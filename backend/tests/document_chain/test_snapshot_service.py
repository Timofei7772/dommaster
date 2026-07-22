import copy

import pytest

from app.models.client import Client
from app.models.company import Company
from app.models.estimate import Estimate, EstimateItem, EstimateSection
from app.models.project import Project, ProjectObject
from app.models.user import User
from app.services.snapshot_service import SnapshotNotFoundError, SnapshotService


async def _seed_estimate(db_session, *, company_name="Snapshot Company"):
    company = Company(name=company_name, bank_details="р/с 40702810000000000001")
    user = User(
        email=f"owner-{company_name}@example.test",
        hashed_password="test",
        full_name="Главный сметчик",
        company=company,
    )
    client = Client(
        company_owner=company,
        name="ООО Заказчик",
        inn="667100000001" if company_name == "Snapshot Company" else "667100000002",
        legal_address="Екатеринбург, ул. Заказчика, 1",
    )
    project = Project(
        code=f"PRJ-{company_name}",
        name="Капитальный ремонт",
        customer_name="Старое имя не использовать",
        company=company,
        client=client,
    )
    project_object = ProjectObject(
        project=project,
        code="OBJ-1",
        name="Административное здание",
        address="Екатеринбург, ул. Строителей, 10",
    )
    estimate = Estimate(
        number=f"ЛС-{company_name}",
        name="Ремонт помещений",
        project=project,
        object=project_object,
        work_coef=1.8,
        material_coef=1.04,
        overhead_percent=10,
        profit_percent=5,
        vat_percent=20,
        vat_on_top=True,
        labor_cost=180,
        materials_cost=104,
        machines_cost=0,
        overhead_cost=28.4,
        profit_cost=15.62,
        total_cost=328.02,
        vat_cost=65.6,
        total_with_vat=393.62,
    )
    second_section = EstimateSection(
        estimate=estimate,
        number="2",
        name="Материалы",
        order_index=20,
        total_cost=104,
    )
    first_section = EstimateSection(
        estimate=estimate,
        number="1",
        name="Работы",
        order_index=10,
        total_cost=180,
    )
    db_session.add_all([
        company,
        user,
        client,
        project,
        project_object,
        estimate,
        second_section,
        first_section,
    ])
    await db_session.flush()
    db_session.add_all([
        EstimateItem(
            estimate=estimate,
            section=second_section,
            item_number="2",
            order_index=20,
            justification="МАТ-1",
            name="Краска",
            unit="кг",
            quantity=2,
            materials_price=50,
            materials_total=104,
            total=104,
            row_type="mat",
        ),
        EstimateItem(
            estimate=estimate,
            section=first_section,
            item_number="1",
            order_index=10,
            justification="РАБ-1",
            name="Окраска стен",
            unit="м2",
            quantity=10,
            labor_price=10,
            labor_total=180,
            total=180,
            row_type="pr",
        ),
    ])
    await db_session.flush()
    return company, user, estimate


@pytest.mark.asyncio
async def test_approve_estimate_creates_canonical_ordered_revision(db_session):
    company, user, estimate = await _seed_estimate(db_session)

    revision = await SnapshotService(db_session).approve_estimate(
        estimate_id=estimate.id,
        company_id=company.id,
        actor_id=user.id,
        idempotency_key="approve-estimate-1",
    )

    payload = revision.payload_json
    assert revision.revision_number == 1
    assert len(revision.payload_hash) == 64
    assert payload["schema_version"] == "estimate-snapshot.v1"
    assert payload["calculation_schema_version"] == "smeta-2007.v1"
    assert payload["project"]["name"] == "Капитальный ремонт"
    assert payload["object"]["address"] == "Екатеринбург, ул. Строителей, 10"
    assert payload["parties"]["customer"]["name"] == "ООО Заказчик"
    assert payload["parties"]["contractor"]["name"] == "Snapshot Company"
    assert [section["number"] for section in payload["sections"]] == ["1", "2"]
    assert [row["item_number"] for row in payload["rows"]] == ["1", "2"]
    assert payload["coefficients"]["work"] == "1.8"
    assert payload["vat"]["percent"] == "20"
    assert payload["totals"]["total_with_vat"] == "393.62"


@pytest.mark.asyncio
async def test_approval_is_idempotent_and_revision_payload_is_immutable(db_session):
    company, user, estimate = await _seed_estimate(db_session)
    service = SnapshotService(db_session)

    first = await service.approve_estimate(
        estimate_id=estimate.id,
        company_id=company.id,
        actor_id=user.id,
        idempotency_key="approve-estimate-immutable",
    )
    frozen_payload = copy.deepcopy(first.payload_json)
    frozen_hash = first.payload_hash

    estimate.total_with_vat = 999999
    estimate.items[0].name = "Изменённая строка"
    await db_session.flush()

    repeated = await service.approve_estimate(
        estimate_id=estimate.id,
        company_id=company.id,
        actor_id=user.id,
        idempotency_key="approve-estimate-immutable",
    )

    assert repeated.id == first.id
    assert repeated.payload_json == frozen_payload
    assert repeated.payload_hash == frozen_hash


@pytest.mark.asyncio
async def test_foreign_company_estimate_is_not_visible(db_session):
    owner_company, _owner, estimate = await _seed_estimate(db_session)
    foreign_company = Company(name="Foreign Company")
    db_session.add(foreign_company)
    await db_session.flush()

    with pytest.raises(SnapshotNotFoundError):
        await SnapshotService(db_session).approve_estimate(
            estimate_id=estimate.id,
            company_id=foreign_company.id,
            actor_id=None,
            idempotency_key="foreign-attempt",
        )

    assert owner_company.id != foreign_company.id
