from datetime import date

import pytest
from sqlalchemy import func, select

from app.models.document_workflow import DocumentSnapshot
from app.models.m29_report import M29Report
from app.services.document_chain_service import (
    DocumentChainNotFoundError,
    DocumentChainService,
)
from tests.document_chain.factories import seed_document_chain


def _report_data(number):
    return {
        "report_number": number,
        "report_date": date(2026, 7, 22),
        "period_start": date(2026, 7, 1),
        "period_end": date(2026, 7, 31),
        "responsible_name": "Прораб Петров П.П.",
        "notes": "Отчёт за июль",
    }


@pytest.mark.asyncio
async def test_m29_contains_only_material_rows_and_server_totals(db_session):
    chain = await seed_document_chain(db_session)

    report = await DocumentChainService(db_session).create_m29(
        estimate_revision_id=chain["revision"].id,
        project_id=chain["project"].id,
        company_id=chain["company"].id,
        actor_id=None,
        report_data=_report_data("М29-1"),
        rows=[
            {
                "source_row_id": chain["material_row_id"],
                "actual_quantity": 6,
                "actual_cost": 630,
                "deviation_reason": "Перерасход из-за подрезки",
            },
            {
                "source_row_id": chain["work_row_id"],
                "actual_quantity": 99,
                "actual_cost": 99999,
                "deviation_reason": "Работа не должна попасть в М-29",
            },
        ],
        idempotency_key="create-m29-1",
    )

    snapshot = (await db_session.execute(
        select(DocumentSnapshot).where(
            DocumentSnapshot.document_type == "m29",
            DocumentSnapshot.entity_id == report.id,
        )
    )).scalar_one()
    material_rows = snapshot.payload_json["m29"]["rows"]
    assert report.total_norm_cost == 500
    assert report.total_actual_cost == 630
    assert len(material_rows) == 1
    assert material_rows[0]["source_row_id"] == chain["material_row_id"]
    assert material_rows[0]["normative_quantity"] == "5"
    assert material_rows[0]["normative_cost"] == "500"
    assert material_rows[0]["actual_quantity"] == "6"
    assert material_rows[0]["actual_cost"] == "630"
    assert material_rows[0]["quantity_deviation"] == "1"
    assert material_rows[0]["cost_deviation"] == "130"
    assert material_rows[0]["deviation_reason"] == "Перерасход из-за подрезки"


@pytest.mark.asyncio
async def test_m29_is_tenant_scoped_and_idempotent(db_session):
    chain = await seed_document_chain(db_session, suffix="1")
    foreign = await seed_document_chain(db_session, suffix="2")
    service = DocumentChainService(db_session)
    command = {
        "estimate_revision_id": chain["revision"].id,
        "project_id": chain["project"].id,
        "company_id": chain["company"].id,
        "actor_id": None,
        "report_data": _report_data("М29-IDEM"),
        "rows": [{
            "source_row_id": chain["material_row_id"],
            "actual_quantity": 5,
            "actual_cost": 500,
            "deviation_reason": None,
        }],
        "idempotency_key": "create-m29-idempotent",
    }

    first = await service.create_m29(**command)
    repeated = await service.create_m29(**command)
    assert repeated.id == first.id
    assert (await db_session.execute(
        select(func.count(M29Report.id))
    )).scalar_one() == 1

    with pytest.raises(DocumentChainNotFoundError):
        await service.create_m29(
            estimate_revision_id=chain["revision"].id,
            project_id=foreign["project"].id,
            company_id=chain["company"].id,
            actor_id=None,
            report_data=_report_data("М29-FOREIGN-PROJECT"),
            rows=[],
            idempotency_key="m29-foreign-project",
        )
    with pytest.raises(DocumentChainNotFoundError):
        await service.create_m29(
            estimate_revision_id=foreign["revision"].id,
            project_id=foreign["project"].id,
            company_id=chain["company"].id,
            actor_id=None,
            report_data=_report_data("М29-FOREIGN-REVISION"),
            rows=[],
            idempotency_key="m29-foreign-revision",
        )
