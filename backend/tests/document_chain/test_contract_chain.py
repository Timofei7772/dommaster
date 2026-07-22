from datetime import date, datetime, timezone

import pytest
from sqlalchemy import func, select

from app.models.client import Client
from app.models.company import Company
from app.models.contract import Contract, ContractType
from app.models.document_workflow import (
    DocumentAuditEvent,
    DocumentSnapshot,
    EstimateRevision,
)
from app.models.estimate import Estimate
from app.models.project import Project, ProjectObject
from app.services.document_chain_service import (
    DocumentChainNotFoundError,
    InvalidSourceRevisionError,
    DocumentChainService,
)
from app.services.snapshot_service import SnapshotService


async def _seed_approved_revision(db_session):
    company = Company(name="Генподрядчик", bank_details="р/с подрядчика")
    client = Client(
        company_owner=company,
        name="ООО Надёжный заказчик",
        client_type="company",
        inn="667100000010",
        kpp="667101001",
        legal_address="Екатеринбург, ул. Клиента, 7",
        phone="+7 900 000-00-01",
        email="client@example.test",
        bank_name="Банк заказчика",
        bik="046577001",
        checking_account="40702810000000000001",
        corr_account="30101810000000000001",
    )
    project = Project(
        code="CONTRACT-PRJ-1",
        name="Ремонт школы",
        company=company,
        client=client,
    )
    project_object = ProjectObject(
        project=project,
        code="SCHOOL-1",
        name="Здание школы № 1",
        address="Екатеринбург, ул. Школьная, 1",
    )
    estimate = Estimate(
        number="ЛС-CONTRACT-1",
        name="Смета ремонта школы",
        project=project,
        object=project_object,
        total_cost=1000,
        vat_cost=200,
        total_with_vat=1200,
    )
    db_session.add_all([company, client, project, project_object, estimate])
    await db_session.flush()
    revision = await SnapshotService(db_session).approve_estimate(
        estimate_id=estimate.id,
        company_id=company.id,
        actor_id=None,
        idempotency_key="approve-for-contract",
    )
    return company, estimate, revision


@pytest.mark.asyncio
async def test_contract_is_created_from_exact_approved_revision(db_session):
    company, estimate, revision = await _seed_approved_revision(db_session)

    contract = await DocumentChainService(db_session).create_contract(
        estimate_revision_id=revision.id,
        company_id=company.id,
        actor_id=None,
        contract_data={
            "number": "Д-001",
            "contract_date": date(2026, 7, 22),
        },
        idempotency_key="contract-revision-1",
    )

    snapshot = (await db_session.execute(
        select(DocumentSnapshot).where(
            DocumentSnapshot.document_type == "contract",
            DocumentSnapshot.entity_id == contract.id,
        )
    )).scalar_one()
    audit = (await db_session.execute(
        select(DocumentAuditEvent).where(
            DocumentAuditEvent.snapshot_id == snapshot.id
        )
    )).scalar_one()

    assert contract.project_id == estimate.project_id
    assert contract.contract_type == ContractType.LEGAL_ENTITY
    assert contract.customer_name == "ООО Надёжный заказчик"
    assert contract.customer_inn == "667100000010"
    assert contract.customer_phone == "+7 900 000-00-01"
    assert contract.customer_email == "client@example.test"
    assert contract.object_name == "Здание школы № 1"
    assert contract.object_address == "Екатеринбург, ул. Школьная, 1"
    assert contract.total_amount == 1200
    assert snapshot.estimate_revision_id == revision.id
    assert snapshot.status == "draft"
    assert snapshot.payload_json["source"]["estimate_revision_hash"] == revision.payload_hash
    assert snapshot.payload_json["contract"]["total_amount"] == "1200"
    assert audit.previous_status is None
    assert audit.new_status == "draft"


@pytest.mark.asyncio
async def test_contract_creation_is_idempotent(db_session):
    company, _estimate, revision = await _seed_approved_revision(db_session)
    service = DocumentChainService(db_session)
    command = {
        "estimate_revision_id": revision.id,
        "company_id": company.id,
        "actor_id": None,
        "contract_data": {
            "number": "Д-002",
            "contract_date": date(2026, 7, 22),
        },
        "idempotency_key": "contract-idempotent",
    }

    first = await service.create_contract(**command)
    repeated = await service.create_contract(**command)
    contract_count = (await db_session.execute(
        select(func.count(Contract.id))
    )).scalar_one()

    assert repeated.id == first.id
    assert contract_count == 1


@pytest.mark.asyncio
async def test_draft_or_foreign_revision_cannot_create_contract(db_session):
    company, estimate, approved_revision = await _seed_approved_revision(db_session)
    draft_revision = EstimateRevision(
        company_id=company.id,
        estimate_id=estimate.id,
        revision_number=2,
        payload_json={
            **approved_revision.payload_json,
            "estimate": {
                **approved_revision.payload_json["estimate"],
                "status": "draft",
            },
        },
        payload_hash="draft-source",
        approved_at=datetime.now(timezone.utc),
    )
    foreign_company = Company(name="Чужая организация")
    db_session.add_all([draft_revision, foreign_company])
    await db_session.flush()
    service = DocumentChainService(db_session)

    with pytest.raises(InvalidSourceRevisionError):
        await service.create_contract(
            estimate_revision_id=draft_revision.id,
            company_id=company.id,
            actor_id=None,
            contract_data={"number": "Д-DRAFT", "contract_date": date.today()},
            idempotency_key="contract-draft",
        )

    with pytest.raises(DocumentChainNotFoundError):
        await service.create_contract(
            estimate_revision_id=approved_revision.id,
            company_id=foreign_company.id,
            actor_id=None,
            contract_data={"number": "Д-FOREIGN", "contract_date": date.today()},
            idempotency_key="contract-foreign",
        )
