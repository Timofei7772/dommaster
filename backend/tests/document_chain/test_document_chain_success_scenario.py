from uuid import uuid4

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import func, select

from app.database import get_db
from app.models.document_workflow import DocumentSnapshot, EstimateRevision
from app.models.user import User, UserRole
from app.routers.auth import get_current_user
from tests.document_chain.factories import seed_document_chain


def _app(db_session, user):
    from app.routers import document_chain

    app = FastAPI()
    app.include_router(document_chain.router, prefix="/api/v1/document-chain")

    async def override_db():
        yield db_session

    async def override_user():
        return user

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    return app


async def _request(app, method, path, *, key=None, **kwargs):
    headers = kwargs.pop("headers", {})
    if key:
        headers["Idempotency-Key"] = key
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        return await client.request(method, path, headers=headers, **kwargs)


@pytest.mark.asyncio
async def test_full_persistent_document_chain_through_http(db_session):
    source = await seed_document_chain(db_session, create_chain=False)
    user = User(
        email=f"success-{uuid4().hex}@example.test",
        hashed_password="unused",
        full_name="Владелец",
        role=UserRole.OWNER,
        company_id=source["company"].id,
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    app = _app(db_session, user)
    estimate_id = source["estimate"].id

    revision_1_response = await _request(
        app,
        "POST",
        f"/api/v1/document-chain/estimates/{estimate_id}/approve",
        key="success-approve-r1",
    )
    assert revision_1_response.status_code == 200, revision_1_response.text
    revision_1 = revision_1_response.json()

    contract_response = await _request(
        app,
        "POST",
        "/api/v1/document-chain/contracts",
        key="success-contract-r1",
        json={
            "estimate_revision_id": revision_1["id"],
            "number": "Д-SUCCESS-1",
            "contract_date": "2026-07-22",
        },
    )
    assert contract_response.status_code == 201, contract_response.text
    contract = contract_response.json()

    ks2_ids = []
    for index, quantity in enumerate((4, 6), 1):
        created = await _request(
            app,
            "POST",
            "/api/v1/document-chain/ks2",
            key=f"success-create-ks2-{index}",
            json={
                "estimate_revision_id": revision_1["id"],
                "contract_id": contract["id"],
                "number": f"КС2-SUCCESS-{index}",
                "act_date": "2026-07-22",
                "period_start": "2026-07-01",
                "period_end": "2026-07-31",
                "rows": [{
                    "source_row_id": source["work_row_id"],
                    "quantity_done": quantity,
                }],
            },
        )
        assert created.status_code == 201, created.text
        approved = await _request(
            app,
            "POST",
            f"/api/v1/document-chain/ks2/{created.json()['id']}/approve",
            key=f"success-approve-ks2-{index}",
        )
        assert approved.status_code == 200, approved.text
        ks2_ids.append(created.json()["id"])

    ks3_response = await _request(
        app,
        "POST",
        "/api/v1/document-chain/ks3",
        key="success-ks3",
        json={
            "ks2_ids": ks2_ids,
            "number": "КС3-SUCCESS-1",
            "certificate_date": "2026-07-22",
            "period_start": "2026-07-01",
            "period_end": "2026-07-31",
        },
    )
    assert ks3_response.status_code == 201, ks3_response.text

    m29_response = await _request(
        app,
        "POST",
        "/api/v1/document-chain/m29",
        key="success-m29",
        json={
            "estimate_revision_id": revision_1["id"],
            "project_id": source["project"].id,
            "report_number": "М29-SUCCESS-1",
            "report_date": "2026-07-22",
            "rows": [{
                "source_row_id": source["material_row_id"],
                "actual_quantity": 5,
                "actual_cost": 500,
            }],
        },
    )
    assert m29_response.status_code == 201, m29_response.text

    state_before = await _request(
        app,
        "GET",
        f"/api/v1/document-chain/estimates/{estimate_id}",
    )
    assert state_before.status_code == 200, state_before.text
    frozen_revision = next(
        item for item in state_before.json()["revisions"]
        if item["id"] == revision_1["id"]
    )
    assert frozen_revision["payload_json"]["rows"][0]["name"] == "Монтаж перегородок"

    source["estimate"].items[0].name = "Изменённое наименование"
    source["estimate"].total_with_vat = 9999
    await db_session.flush()
    revision_2_response = await _request(
        app,
        "POST",
        f"/api/v1/document-chain/estimates/{estimate_id}/approve",
        key="success-approve-r2",
    )
    assert revision_2_response.status_code == 200, revision_2_response.text

    repeated_revision = await _request(
        app,
        "POST",
        f"/api/v1/document-chain/estimates/{estimate_id}/approve",
        key="success-approve-r1",
    )
    repeated_contract = await _request(
        app,
        "POST",
        "/api/v1/document-chain/contracts",
        key="success-contract-r1",
        json={
            "estimate_revision_id": revision_1["id"],
            "number": "Д-SUCCESS-1",
            "contract_date": "2026-07-22",
        },
    )
    assert repeated_revision.json()["id"] == revision_1["id"]
    assert repeated_contract.json()["id"] == contract["id"]

    state_after = (await _request(
        app,
        "GET",
        f"/api/v1/document-chain/estimates/{estimate_id}",
    )).json()
    revision_1_after = next(
        item for item in state_after["revisions"]
        if item["id"] == revision_1["id"]
    )
    assert revision_1_after["payload_hash"] == frozen_revision["payload_hash"]
    assert revision_1_after["payload_json"] == frozen_revision["payload_json"]
    assert len(state_after["revisions"]) == 2
    assert (await db_session.execute(
        select(func.count(EstimateRevision.id))
    )).scalar_one() == 2
    assert (await db_session.execute(
        select(func.count(DocumentSnapshot.id))
    )).scalar_one() == 7
