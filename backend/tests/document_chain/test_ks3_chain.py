from datetime import date

import pytest
from sqlalchemy import func, select

from app.models.document_workflow import DocumentSnapshot
from app.models.ks3 import KS3Certificate, KS3Item
from app.services.document_chain_service import (
    DocumentChainService,
    InvalidDocumentSelectionError,
)
from tests.document_chain.factories import seed_document_chain


def _ks2_data(number):
    return {
        "number": number,
        "act_date": date(2026, 7, 22),
        "period_start": date(2026, 7, 1),
        "period_end": date(2026, 7, 31),
    }


def _ks3_data(number):
    return {
        "number": number,
        "certificate_date": date(2026, 7, 22),
        "period_start": date(2026, 7, 1),
        "period_end": date(2026, 7, 31),
    }


async def _create_ks2(service, chain, *, number, quantity, signed=True):
    act = await service.create_ks2(
        estimate_revision_id=chain["revision"].id,
        contract_id=chain["contract"].id,
        company_id=chain["company"].id,
        actor_id=None,
        act_data=_ks2_data(number),
        rows=[{
            "source_row_id": chain["work_row_id"],
            "quantity_done": quantity,
        }],
        idempotency_key=f"create-{number}",
    )
    if signed:
        await service.approve_ks2(
            ks2_id=act.id,
            company_id=chain["company"].id,
            actor_id=None,
            idempotency_key=f"approve-{number}",
        )
    return act


@pytest.mark.asyncio
async def test_ks3_aggregates_only_selected_signed_ks2_and_links_items(db_session):
    chain = await seed_document_chain(db_session)
    service = DocumentChainService(db_session)
    first = await _create_ks2(service, chain, number="КС2-31", quantity=2)
    second = await _create_ks2(service, chain, number="КС2-32", quantity=3)

    certificate = await service.create_ks3(
        ks2_ids=[first.id, second.id],
        company_id=chain["company"].id,
        actor_id=None,
        certificate_data=_ks3_data("КС3-1"),
        idempotency_key="create-ks3-1",
    )

    snapshot = (await db_session.execute(
        select(DocumentSnapshot).where(
            DocumentSnapshot.document_type == "ks3",
            DocumentSnapshot.entity_id == certificate.id,
        )
    )).scalar_one()
    assert certificate.contract_id == chain["contract"].id
    assert certificate.total_current_period == 500
    assert certificate.total_from_start == 500
    assert certificate.vat_amount == 100
    assert certificate.total_with_vat == 600
    assert [item.ks2_act_id for item in certificate.items] == [first.id, second.id]
    assert snapshot.estimate_revision_id == chain["revision"].id
    assert snapshot.payload_json["ks3"]["ks2_ids"] == [first.id, second.id]


@pytest.mark.asyncio
async def test_ks3_rejects_draft_mixed_and_duplicate_acts(db_session):
    chain = await seed_document_chain(db_session, suffix="1")
    foreign = await seed_document_chain(db_session, suffix="2")
    service = DocumentChainService(db_session)
    signed = await _create_ks2(service, chain, number="КС2-SIGNED", quantity=2)
    draft = await _create_ks2(
        service,
        chain,
        number="КС2-DRAFT",
        quantity=2,
        signed=False,
    )
    foreign_signed = await _create_ks2(
        service,
        foreign,
        number="КС2-FOREIGN",
        quantity=2,
    )

    for ids, key in (
        ([draft.id], "ks3-draft"),
        ([signed.id, foreign_signed.id], "ks3-mixed"),
        ([signed.id, signed.id], "ks3-duplicate-request"),
    ):
        with pytest.raises(InvalidDocumentSelectionError):
            await service.create_ks3(
                ks2_ids=ids,
                company_id=chain["company"].id,
                actor_id=None,
                certificate_data=_ks3_data(key),
                idempotency_key=key,
            )


@pytest.mark.asyncio
async def test_ks3_is_idempotent_prevents_reuse_and_calculates_cumulative(db_session):
    chain = await seed_document_chain(db_session)
    service = DocumentChainService(db_session)
    first_act = await _create_ks2(service, chain, number="КС2-CUM-1", quantity=2)
    second_act = await _create_ks2(service, chain, number="КС2-CUM-2", quantity=3)

    first = await service.create_ks3(
        ks2_ids=[first_act.id],
        company_id=chain["company"].id,
        actor_id=None,
        certificate_data=_ks3_data("КС3-CUM-1"),
        idempotency_key="ks3-cumulative-1",
    )
    repeated = await service.create_ks3(
        ks2_ids=[first_act.id],
        company_id=chain["company"].id,
        actor_id=None,
        certificate_data=_ks3_data("КС3-CUM-1"),
        idempotency_key="ks3-cumulative-1",
    )
    second = await service.create_ks3(
        ks2_ids=[second_act.id],
        company_id=chain["company"].id,
        actor_id=None,
        certificate_data=_ks3_data("КС3-CUM-2"),
        idempotency_key="ks3-cumulative-2",
    )

    assert repeated.id == first.id
    assert first.total_current_period == 200
    assert second.total_current_period == 300
    assert second.total_from_start == 500
    with pytest.raises(InvalidDocumentSelectionError):
        await service.create_ks3(
            ks2_ids=[first_act.id],
            company_id=chain["company"].id,
            actor_id=None,
            certificate_data=_ks3_data("КС3-REUSE"),
            idempotency_key="ks3-reuse-act",
        )

    certificate_count = (await db_session.execute(
        select(func.count(KS3Certificate.id))
    )).scalar_one()
    item_count = (await db_session.execute(
        select(func.count(KS3Item.id))
    )).scalar_one()
    assert certificate_count == 2
    assert item_count == 2
