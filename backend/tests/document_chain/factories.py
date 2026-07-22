from datetime import date

from app.models.client import Client
from app.models.company import Company
from app.models.estimate import Estimate, EstimateItem, EstimateSection
from app.models.project import Project, ProjectObject
from app.services.document_chain_service import DocumentChainService
from app.services.snapshot_service import SnapshotService


async def seed_document_chain(db_session, *, suffix="1"):
    company = Company(name=f"Генподрядчик {suffix}", bank_details="р/с подрядчика")
    client = Client(
        company_owner=company,
        name="ООО Заказчик",
        client_type="company",
        inn=f"6671000000{int(suffix):02d}",
        legal_address="Екатеринбург, ул. Клиента, 7",
    )
    project = Project(
        code=f"CHAIN-PRJ-{suffix}",
        name="Ремонт объекта",
        company=company,
        client=client,
    )
    project_object = ProjectObject(
        project=project,
        code=f"OBJECT-{suffix}",
        name="Административное здание",
        address="Екатеринбург, ул. Строителей, 10",
    )
    estimate = Estimate(
        number=f"ЛС-CHAIN-{suffix}",
        name="Работы и материалы",
        project=project,
        object=project_object,
        labor_cost=1000,
        materials_cost=500,
        total_cost=1500,
        vat_percent=20,
        vat_on_top=True,
        vat_cost=300,
        total_with_vat=1800,
    )
    section = EstimateSection(
        estimate=estimate,
        number="1",
        name="Основные работы",
        order_index=1,
        total_cost=1500,
    )
    db_session.add_all([company, client, project, project_object, estimate, section])
    await db_session.flush()
    work = EstimateItem(
        estimate=estimate,
        section=section,
        item_number="1",
        order_index=1,
        name="Монтаж перегородок",
        unit="м2",
        quantity=10,
        labor_price=100,
        labor_total=1000,
        total=1000,
        row_type="pr",
    )
    material = EstimateItem(
        estimate=estimate,
        section=section,
        item_number="2",
        order_index=2,
        name="Гипсокартон",
        unit="лист",
        quantity=5,
        materials_price=100,
        materials_total=500,
        total=500,
        row_type="mat",
    )
    db_session.add_all([work, material])
    await db_session.flush()

    revision = await SnapshotService(db_session).approve_estimate(
        estimate_id=estimate.id,
        company_id=company.id,
        actor_id=None,
        idempotency_key=f"approve-chain-{suffix}",
    )
    contract = await DocumentChainService(db_session).create_contract(
        estimate_revision_id=revision.id,
        company_id=company.id,
        actor_id=None,
        contract_data={
            "number": f"Д-{suffix}",
            "contract_date": date(2026, 7, 22),
        },
        idempotency_key=f"contract-chain-{suffix}",
    )
    return {
        "company": company,
        "project": project,
        "estimate": estimate,
        "revision": revision,
        "contract": contract,
        "work_row_id": work.id,
        "material_row_id": material.id,
    }
