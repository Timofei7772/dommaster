"""Tenant-isolation contract for the existing Client API."""

import httpx
import pytest
from fastapi import FastAPI

from app.database import get_db
from app.models.client import Client
from app.models.company import Company
from app.models.user import User, UserRole


def _test_app(db_session, current_user: User) -> FastAPI:
    from app.routers import clients
    from app.routers.auth import get_current_user

    app = FastAPI()
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


async def _request(app: FastAPI, method: str, path: str, **kwargs):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport,
        base_url="http://testserver",
    ) as client:
        return await client.request(method, path, **kwargs)


@pytest.mark.asyncio
async def test_client_list_only_returns_active_company_rows(
    db_session,
    company,
    manager,
):
    other_company = Company(name="Other Company")
    db_session.add(other_company)
    await db_session.flush()
    own = Client(company_id=company.id, name="Own Client")
    inactive = Client(company_id=company.id, name="Inactive", is_active=False)
    foreign = Client(company_id=other_company.id, name="Foreign Client")
    db_session.add_all([own, inactive, foreign])
    await db_session.flush()

    response = await _request(
        _test_app(db_session, manager),
        "GET",
        "/api/clients/",
    )

    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == [own.id]


@pytest.mark.asyncio
async def test_client_detail_hides_foreign_company_row(
    db_session,
    company,
    manager,
):
    other_company = Company(name="Other Company")
    db_session.add(other_company)
    await db_session.flush()
    own = Client(company_id=company.id, name="Own Client")
    foreign = Client(company_id=other_company.id, name="Foreign Client")
    db_session.add_all([own, foreign])
    await db_session.commit()

    own_response = await _request(
        _test_app(db_session, manager),
        "GET",
        f"/api/clients/{own.id}",
    )
    foreign_response = await _request(
        _test_app(db_session, manager),
        "GET",
        f"/api/clients/{foreign.id}",
    )

    assert own_response.status_code == 200
    assert foreign_response.status_code == 404


@pytest.mark.asyncio
async def test_client_create_uses_authenticated_company(
    db_session,
    company,
    manager,
):
    response = await _request(
        _test_app(db_session, manager),
        "POST",
        "/api/clients/",
        json={"name": "Created Client", "phone": "+7 999 000-11-22"},
    )

    assert response.status_code == 201, response.text
    client = await db_session.get(Client, response.json()["id"])
    assert client.company_id == company.id


@pytest.mark.asyncio
async def test_client_create_requires_company_bound_user(db_session):
    user = User(
        email="unbound@example.test",
        hashed_password="not-used",
        full_name="Unbound User",
        role=UserRole.MANAGER,
        company_id=None,
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()

    response = await _request(
        _test_app(db_session, user),
        "POST",
        "/api/clients/",
        json={"name": "No Company Client"},
    )

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_client_update_is_company_scoped(
    db_session,
    company,
    manager,
):
    other_company = Company(name="Other Company")
    db_session.add(other_company)
    await db_session.flush()
    own = Client(company_id=company.id, name="Own Client")
    foreign = Client(company_id=other_company.id, name="Foreign Client")
    db_session.add_all([own, foreign])
    await db_session.commit()

    own_response = await _request(
        _test_app(db_session, manager),
        "PATCH",
        f"/api/clients/{own.id}",
        json={"name": "Updated Own Client"},
    )
    await db_session.commit()
    foreign_response = await _request(
        _test_app(db_session, manager),
        "PATCH",
        f"/api/clients/{foreign.id}",
        json={"name": "Stolen Client"},
    )

    assert own_response.status_code == 200
    assert foreign_response.status_code == 404
    await db_session.refresh(foreign)
    assert foreign.name == "Foreign Client"


@pytest.mark.asyncio
async def test_client_delete_is_company_scoped(
    db_session,
    company,
    manager,
):
    other_company = Company(name="Other Company")
    db_session.add(other_company)
    await db_session.flush()
    own = Client(company_id=company.id, name="Own Client")
    foreign = Client(company_id=other_company.id, name="Foreign Client")
    db_session.add_all([own, foreign])
    await db_session.commit()

    own_response = await _request(
        _test_app(db_session, manager),
        "DELETE",
        f"/api/clients/{own.id}",
    )
    await db_session.commit()
    foreign_response = await _request(
        _test_app(db_session, manager),
        "DELETE",
        f"/api/clients/{foreign.id}",
    )

    assert own_response.status_code == 200
    assert foreign_response.status_code == 404
    await db_session.refresh(foreign)
    assert foreign.is_active is True
