from datetime import date
from uuid import uuid4

import httpx
import pytest
from fastapi import FastAPI

from app.database import get_db
from app.models.company import Company
from app.models.user import User, UserRole
from app.routers.auth import get_current_user
from tests.document_chain.factories import seed_document_chain


WRITE_ROLES = [UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER]


def test_main_app_registers_versioned_document_chain_router():
    from app.main import app

    assert "/api/v1/document-chain/contracts" in app.openapi()["paths"]


async def _user(db_session, company, role=UserRole.OWNER):
    user = User(
        email=f"document-{role.value}-{uuid4().hex}@example.test",
        hashed_password="not-used",
        full_name="Document User",
        role=role,
        company_id=company.id,
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    return user


def _test_app(db_session, current_user):
    from app.routers import document_chain

    app = FastAPI()
    app.include_router(
        document_chain.router,
        prefix="/api/v1/document-chain",
    )

    async def override_db():
        yield db_session

    async def override_user():
        return current_user

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    return app


async def _request(app, method, path, **kwargs):
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        return await client.request(method, path, **kwargs)


@pytest.mark.asyncio
async def test_versioned_api_exposes_complete_chain_and_idempotency(db_session):
    chain = await seed_document_chain(db_session)
    user = await _user(db_session, chain["company"])
    app = _test_app(db_session, user)

    approved = await _request(
        app,
        "POST",
        f"/api/v1/document-chain/estimates/{chain['estimate'].id}/approve",
        headers={"Idempotency-Key": "api-approve-2"},
    )
    assert approved.status_code == 200, approved.text
    revision_id = approved.json()["id"]

    contract = await _request(
        app,
        "POST",
        "/api/v1/document-chain/contracts",
        headers={"Idempotency-Key": "api-contract-2"},
        json={
            "estimate_revision_id": revision_id,
            "number": "Д-API-2",
            "contract_date": "2026-07-22",
        },
    )
    assert contract.status_code == 201, contract.text

    ks2 = await _request(
        app,
        "POST",
        "/api/v1/document-chain/ks2",
        headers={"Idempotency-Key": "api-ks2-create"},
        json={
            "estimate_revision_id": revision_id,
            "contract_id": contract.json()["id"],
            "number": "КС2-API-1",
            "act_date": "2026-07-22",
            "period_start": "2026-07-01",
            "period_end": "2026-07-31",
            "rows": [{
                "source_row_id": chain["work_row_id"],
                "quantity_done": 2,
            }],
        },
    )
    assert ks2.status_code == 201, ks2.text
    signed = await _request(
        app,
        "POST",
        f"/api/v1/document-chain/ks2/{ks2.json()['id']}/approve",
        headers={"Idempotency-Key": "api-ks2-approve"},
    )
    assert signed.status_code == 200, signed.text
    assert signed.json()["status"] == "signed"

    ks3 = await _request(
        app,
        "POST",
        "/api/v1/document-chain/ks3",
        headers={"Idempotency-Key": "api-ks3-create"},
        json={
            "ks2_ids": [ks2.json()["id"]],
            "number": "КС3-API-1",
            "certificate_date": "2026-07-22",
            "period_start": "2026-07-01",
            "period_end": "2026-07-31",
        },
    )
    assert ks3.status_code == 201, ks3.text

    m29 = await _request(
        app,
        "POST",
        "/api/v1/document-chain/m29",
        headers={"Idempotency-Key": "api-m29-create"},
        json={
            "estimate_revision_id": revision_id,
            "project_id": chain["project"].id,
            "report_number": "М29-API-1",
            "report_date": "2026-07-22",
            "rows": [{
                "source_row_id": chain["material_row_id"],
                "actual_quantity": 5,
                "actual_cost": 500,
            }],
        },
    )
    assert m29.status_code == 201, m29.text

    state = await _request(
        app,
        "GET",
        f"/api/v1/document-chain/estimates/{chain['estimate'].id}",
    )
    assert state.status_code == 200, state.text
    assert revision_id in [item["id"] for item in state.json()["revisions"]]
    assert {"contract", "ks2", "ks3", "m29"}.issubset({
        item["document_type"] for item in state.json()["documents"]
    })


@pytest.mark.asyncio
@pytest.mark.parametrize("role", WRITE_ROLES)
async def test_write_roles_can_approve_estimate(db_session, role):
    chain = await seed_document_chain(db_session)
    user = await _user(db_session, chain["company"], role)
    response = await _request(
        _test_app(db_session, user),
        "POST",
        f"/api/v1/document-chain/estimates/{chain['estimate'].id}/approve",
        headers={"Idempotency-Key": f"role-{role.value}"},
    )
    assert response.status_code == 200, response.text


@pytest.mark.asyncio
async def test_api_enforces_role_tenant_header_and_bearer_security(db_session):
    chain = await seed_document_chain(db_session)
    viewer = await _user(db_session, chain["company"], UserRole.VIEWER)
    forbidden = await _request(
        _test_app(db_session, viewer),
        "POST",
        f"/api/v1/document-chain/estimates/{chain['estimate'].id}/approve",
        headers={"Idempotency-Key": "viewer-forbidden"},
    )
    assert forbidden.status_code == 403

    owner = await _user(db_session, chain["company"], UserRole.OWNER)
    missing_header = await _request(
        _test_app(db_session, owner),
        "POST",
        f"/api/v1/document-chain/estimates/{chain['estimate'].id}/approve",
    )
    assert missing_header.status_code == 422

    foreign_company = Company(name="API Foreign")
    db_session.add(foreign_company)
    await db_session.flush()
    foreign_owner = await _user(db_session, foreign_company, UserRole.OWNER)
    hidden = await _request(
        _test_app(db_session, foreign_owner),
        "POST",
        f"/api/v1/document-chain/estimates/{chain['estimate'].id}/approve",
        headers={"Idempotency-Key": "foreign-hidden"},
    )
    assert hidden.status_code == 404

    schema = _test_app(db_session, owner).openapi()
    operations = [
        operation
        for path in schema["paths"].values()
        for operation in path.values()
        if isinstance(operation, dict) and "responses" in operation
    ]
    assert operations
    assert all(operation.get("security") for operation in operations)
