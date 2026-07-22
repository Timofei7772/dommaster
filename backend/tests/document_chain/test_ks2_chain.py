from datetime import date

import pytest
from sqlalchemy import func, select

from app.models.document_workflow import DocumentAuditEvent, DocumentSnapshot
from app.models.ks2 import KS2Act, KS2Status
from app.services.document_chain_service import (
    DocumentChainService,
    InvalidDocumentQuantityError,
)
from tests.document_chain.factories import seed_document_chain


def _act_data(number):
    return {
        "number": number,
        "act_date": date(2026, 7, 22),
        "period_start": date(2026, 7, 1),
        "period_end": date(2026, 7, 31),
    }


@pytest.mark.asyncio
async def test_ks2_uses_revision_rows_prices_vat_and_prior_signed_quantity(db_session):
    chain = await seed_document_chain(db_session)
    service = DocumentChainService(db_session)

    first = await service.create_ks2(
        estimate_revision_id=chain["revision"].id,
        contract_id=chain["contract"].id,
        company_id=chain["company"].id,
        actor_id=None,
        act_data=_act_data("КС2-1"),
        rows=[
            {"source_row_id": chain["work_row_id"], "quantity_done": 4},
            {"source_row_id": chain["material_row_id"], "quantity_done": 2},
        ],
        idempotency_key="create-ks2-1",
    )
    await service.approve_ks2(
        ks2_id=first.id,
        company_id=chain["company"].id,
        actor_id=None,
        idempotency_key="approve-ks2-1",
    )

    second = await service.create_ks2(
        estimate_revision_id=chain["revision"].id,
        contract_id=chain["contract"].id,
        company_id=chain["company"].id,
        actor_id=None,
        act_data=_act_data("КС2-2"),
        rows=[
            {"source_row_id": chain["work_row_id"], "quantity_done": 3},
            {"source_row_id": chain["material_row_id"], "quantity_done": 1},
        ],
        idempotency_key="create-ks2-2",
    )

    assert [item.estimate_item_id for item in second.items] == [
        chain["work_row_id"],
        chain["material_row_id"],
    ]
    assert [item.quantity_prev for item in second.items] == [4, 2]
    assert [item.unit_price for item in second.items] == [100, 100]
    assert second.total_without_vat == 400
    assert second.vat_amount == 80
    assert second.total_with_vat == 480
    assert second.status == KS2Status.DRAFT


@pytest.mark.asyncio
async def test_draft_does_not_consume_quantity_but_approval_rechecks_remaining(db_session):
    chain = await seed_document_chain(db_session)
    service = DocumentChainService(db_session)
    common = {
        "estimate_revision_id": chain["revision"].id,
        "contract_id": chain["contract"].id,
        "company_id": chain["company"].id,
        "actor_id": None,
        "rows": [{"source_row_id": chain["work_row_id"], "quantity_done": 7}],
    }
    first = await service.create_ks2(
        **common,
        act_data=_act_data("КС2-A"),
        idempotency_key="create-ks2-a",
    )
    second = await service.create_ks2(
        **common,
        act_data=_act_data("КС2-B"),
        idempotency_key="create-ks2-b",
    )

    assert first.items[0].quantity_prev == 0
    assert second.items[0].quantity_prev == 0
    await service.approve_ks2(
        ks2_id=first.id,
        company_id=chain["company"].id,
        actor_id=None,
        idempotency_key="approve-ks2-a",
    )
    with pytest.raises(InvalidDocumentQuantityError):
        await service.approve_ks2(
            ks2_id=second.id,
            company_id=chain["company"].id,
            actor_id=None,
            idempotency_key="approve-ks2-b",
        )


@pytest.mark.asyncio
async def test_ks2_rejects_invalid_quantity_and_approval_is_idempotent(db_session):
    chain = await seed_document_chain(db_session)
    service = DocumentChainService(db_session)

    with pytest.raises(InvalidDocumentQuantityError):
        await service.create_ks2(
            estimate_revision_id=chain["revision"].id,
            contract_id=chain["contract"].id,
            company_id=chain["company"].id,
            actor_id=None,
            act_data=_act_data("КС2-ZERO"),
            rows=[{"source_row_id": chain["work_row_id"], "quantity_done": 0}],
            idempotency_key="create-ks2-zero",
        )

    act = await service.create_ks2(
        estimate_revision_id=chain["revision"].id,
        contract_id=chain["contract"].id,
        company_id=chain["company"].id,
        actor_id=None,
        act_data=_act_data("КС2-IDEM"),
        rows=[{"source_row_id": chain["work_row_id"], "quantity_done": 2}],
        idempotency_key="create-ks2-idem",
    )
    first = await service.approve_ks2(
        ks2_id=act.id,
        company_id=chain["company"].id,
        actor_id=None,
        idempotency_key="approve-ks2-idem",
    )
    repeated = await service.approve_ks2(
        ks2_id=act.id,
        company_id=chain["company"].id,
        actor_id=None,
        idempotency_key="approve-ks2-idem",
    )
    signed_snapshots = (await db_session.execute(
        select(func.count(DocumentSnapshot.id)).where(
            DocumentSnapshot.document_type == "ks2",
            DocumentSnapshot.entity_id == act.id,
            DocumentSnapshot.status == "signed",
        )
    )).scalar_one()
    audit_events = (await db_session.execute(
        select(func.count(DocumentAuditEvent.id)).join(DocumentSnapshot).where(
            DocumentSnapshot.document_type == "ks2",
            DocumentSnapshot.entity_id == act.id,
        )
    )).scalar_one()

    assert first.id == repeated.id == act.id
    assert repeated.status == KS2Status.SIGNED
    assert signed_snapshots == 1
    assert audit_events == 2
