"""HTTP contract for persistent, tenant-scoped CRM leads."""

from uuid import uuid4

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import func, select

from app.database import get_db
from app.models.client import Client
from app.models.company import Company
from app.models.lead import Lead, LeadStatus
from app.models.user import User, UserRole


def _test_app(db_session, current_user: User) -> FastAPI:
    from app.routers import leads
    from app.routers.auth import get_current_user

    app = FastAPI()
    app.include_router(leads.router, prefix="/api/leads")

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


async def _request(app: FastAPI, method: str, path: str, **kwargs):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport,
        base_url="http://testserver",
    ) as client:
        return await client.request(method, path, **kwargs)


async def _user(db_session, company, role: UserRole) -> User:
    user = User(
        email=f"{role.value}-{uuid4().hex}@example.test",
        hashed_password="not-used",
        full_name=f"{role.value.title()} User",
        role=role,
        company_id=company.id,
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest.mark.asyncio
@pytest.mark.parametrize("role", [UserRole.OWNER, UserRole.MANAGER])
async def test_owner_and_manager_can_create_and_list_leads(
    db_session,
    company,
    role,
):
    current_user = await _user(db_session, company, role)
    app = _test_app(db_session, current_user)

    created = await _request(
        app,
        "POST",
        "/api/leads/",
        json={
            "name": "Иван Петров",
            "phone": "+7 999 000-00-00",
            "source": "manual",
        },
    )
    listed = await _request(app, "GET", "/api/leads/")

    assert created.status_code == 201, created.text
    assert created.json()["company_id"] == company.id
    assert created.json()["assigned_to"] == current_user.id
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [created.json()["id"]]


@pytest.mark.asyncio
@pytest.mark.parametrize("role", [UserRole.ESTIMATOR, UserRole.VIEWER])
async def test_read_only_roles_cannot_mutate_leads(
    db_session,
    company,
    role,
):
    current_user = await _user(db_session, company, role)
    app = _test_app(db_session, current_user)

    response = await _request(
        app,
        "POST",
        "/api/leads/",
        json={"name": "Forbidden Lead"},
    )

    assert response.status_code == 403
    assert await db_session.scalar(select(func.count()).select_from(Lead)) == 0


@pytest.mark.asyncio
async def test_list_never_returns_another_company_lead(
    db_session,
    company,
    manager,
):
    other_company = Company(name="Other Company")
    db_session.add(other_company)
    await db_session.flush()
    own = Lead(company_id=company.id, name="Own Lead")
    foreign = Lead(company_id=other_company.id, name="Foreign Lead")
    db_session.add_all([own, foreign])
    await db_session.flush()

    response = await _request(
        _test_app(db_session, manager),
        "GET",
        "/api/leads/",
    )

    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == [own.id]


@pytest.mark.asyncio
async def test_invalid_transition_returns_400_and_preserves_status(
    db_session,
    company,
    manager,
):
    lead = Lead(company_id=company.id, name="Lead")
    db_session.add(lead)
    await db_session.flush()

    response = await _request(
        _test_app(db_session, manager),
        "PATCH",
        f"/api/leads/{lead.id}/status",
        json={"status": "qualified"},
    )

    assert response.status_code == 400
    assert lead.status is LeadStatus.NEW


@pytest.mark.asyncio
async def test_foreign_company_lead_returns_404(
    db_session,
    company,
    manager,
):
    other_company = Company(name="Other Company")
    db_session.add(other_company)
    await db_session.flush()
    foreign = Lead(company_id=other_company.id, name="Foreign Lead")
    db_session.add(foreign)
    await db_session.flush()

    response = await _request(
        _test_app(db_session, manager),
        "PATCH",
        f"/api/leads/{foreign.id}/status",
        json={"status": "contacted"},
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_persisted_conversion_returns_client_and_is_idempotent(
    db_session,
    company,
    manager,
):
    app = _test_app(db_session, manager)
    created = await _request(
        app,
        "POST",
        "/api/leads/",
        json={"name": "Lead", "email": "lead@example.com"},
    )
    lead_id = created.json()["id"]

    first = await _request(app, "POST", f"/api/leads/{lead_id}/convert")
    second = await _request(app, "POST", f"/api/leads/{lead_id}/convert")

    assert first.status_code == 200, first.text
    assert first.json()["client"]["company_id"] == company.id
    assert first.json()["reused_client"] is False
    assert first.json()["ready_for_project"] is True
    assert second.json()["client"]["id"] == first.json()["client"]["id"]
    assert second.json()["reused_client"] is True


@pytest.mark.asyncio
async def test_legacy_convert_persists_lead_and_delegates_to_crm_service(
    db_session,
    company,
    manager,
):
    response = await _request(
        _test_app(db_session, manager),
        "POST",
        "/api/leads/convert",
        json={
            "title": "Legacy Lead",
            "description": "Ремонт офиса",
            "source": "manual",
            "contact": "+7 999 555-66-77",
            "price": 500000,
        },
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    lead = await db_session.get(Lead, payload["lead_id"])
    client = await db_session.get(Client, payload["client_id"])
    assert lead.client_id == client.id
    assert lead.status is LeadStatus.CONTRACT
    assert client.company_id == company.id
    assert payload["ready_for_project"] is True
