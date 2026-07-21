"""Sprint 1 success scenario from lead capture to project readiness."""

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import func, select

from app.database import get_db
from app.models.client import Client
from app.models.project import Project


def _crm_app(db_session, current_user):
    from app.routers import clients, leads
    from app.routers.auth import get_current_user

    app = FastAPI()
    app.include_router(leads.router, prefix="/api/leads")
    app.include_router(clients.router, prefix="/api/clients")

    async def override_db():
        try:
            yield db_session
            await db_session.flush()
        except Exception:
            await db_session.rollback()
            raise

    async def override_current_user():
        return current_user

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_current_user
    return app


async def _request(app, method, path, **kwargs):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport,
        base_url="http://testserver",
    ) as client:
        return await client.request(method, path, **kwargs)


@pytest.mark.asyncio
async def test_manager_converts_lead_into_project_ready_client(
    db_session,
    company,
    manager,
):
    app = _crm_app(db_session, manager)

    created = await _request(
        app,
        "POST",
        "/api/leads/",
        json={
            "name": "Заказчик объекта",
            "phone": "+7 999 777-88-99",
            "address": "г. Уфа, строительный объект",
            "expected_budget": 2500000,
            "source": "telegram",
        },
    )
    assert created.status_code == 201, created.text
    lead_id = created.json()["id"]

    for next_status in ("contacted", "qualified", "proposal", "contract"):
        moved = await _request(
            app,
            "PATCH",
            f"/api/leads/{lead_id}/status",
            json={"status": next_status},
        )
        assert moved.status_code == 200, moved.text
        assert moved.json()["status"] == next_status

    converted = await _request(
        app,
        "POST",
        f"/api/leads/{lead_id}/convert",
    )
    assert converted.status_code == 200, converted.text
    payload = converted.json()
    assert payload["ready_for_project"] is True
    assert payload["reused_client"] is False

    client_id = payload["client"]["id"]
    fetched = await _request(app, "GET", f"/api/clients/{client_id}")
    assert fetched.status_code == 200
    assert fetched.json()["id"] == client_id

    project = Project(
        name="Первый объект клиента",
        client_id=client_id,
        company_id=company.id,
        created_by=manager.id,
    )
    db_session.add(project)
    await db_session.flush()
    assert project.id is not None
    assert project.client_id == client_id

    repeated = await _request(
        app,
        "POST",
        f"/api/leads/{lead_id}/convert",
    )
    assert repeated.status_code == 200
    assert repeated.json()["client"]["id"] == client_id
    assert repeated.json()["reused_client"] is True
    assert await db_session.scalar(select(func.count()).select_from(Client)) == 1


def test_production_openapi_exposes_protected_crm_contracts():
    from app.main import app

    schema = app.openapi()
    required_operations = {
        ("/api/leads/", "post"),
        ("/api/leads/", "get"),
        ("/api/leads/{lead_id}/status", "patch"),
        ("/api/leads/{lead_id}/convert", "post"),
        ("/api/leads/convert", "post"),
        ("/api/clients/", "post"),
        ("/api/clients/", "get"),
        ("/api/clients/{client_id}", "get"),
        ("/api/clients/{client_id}", "patch"),
        ("/api/clients/{client_id}", "delete"),
    }

    for path, method in required_operations:
        operation = schema["paths"][path][method]
        assert operation.get("security") == [{"OAuth2PasswordBearer": []}]
