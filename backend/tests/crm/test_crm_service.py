"""Business rules for the CRM funnel and lead conversion."""

import pytest
from sqlalchemy import func, select

from app.models.client import Client
from app.models.company import Company
from app.models.lead import Lead, LeadStatus
from app.models.versioning import AuditLog


@pytest.mark.asyncio
async def test_change_status_allows_next_funnel_step_and_writes_audit(
    db_session,
    company,
    manager,
):
    from app.services.crm_service import CrmService

    lead = Lead(company_id=company.id, name="Lead", status=LeadStatus.NEW)
    db_session.add(lead)
    await db_session.flush()

    changed = await CrmService(db_session).change_status(
        company_id=company.id,
        lead_id=lead.id,
        new_status=LeadStatus.CONTACTED,
        user_id=manager.id,
    )

    assert changed.status is LeadStatus.CONTACTED
    audit = (
        await db_session.execute(
            select(AuditLog).where(
                AuditLog.entity_type == "lead",
                AuditLog.entity_id == lead.id,
            )
        )
    ).scalar_one()
    assert audit.old_value == {"status": "new"}
    assert audit.new_value == {"status": "contacted"}
    assert audit.user_id == manager.id


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("current_status", "new_status"),
    [
        (LeadStatus.NEW, LeadStatus.QUALIFIED),
        (LeadStatus.LOST, LeadStatus.CONTACTED),
        (LeadStatus.CONTRACT, LeadStatus.LOST),
    ],
)
async def test_change_status_rejects_invalid_transition_without_mutation(
    db_session,
    company,
    current_status,
    new_status,
):
    from app.services.crm_service import CrmService, InvalidLeadTransitionError

    lead = Lead(company_id=company.id, name="Lead", status=current_status)
    db_session.add(lead)
    await db_session.flush()

    with pytest.raises(InvalidLeadTransitionError):
        await CrmService(db_session).change_status(
            company_id=company.id,
            lead_id=lead.id,
            new_status=new_status,
        )

    assert lead.status is current_status


@pytest.mark.asyncio
async def test_change_status_hides_another_company_lead(db_session, company):
    from app.services.crm_service import CrmService, LeadNotFoundError

    other_company = Company(name="Other Company")
    db_session.add(other_company)
    await db_session.flush()
    lead = Lead(company_id=other_company.id, name="Foreign Lead")
    db_session.add(lead)
    await db_session.flush()

    with pytest.raises(LeadNotFoundError):
        await CrmService(db_session).change_status(
            company_id=company.id,
            lead_id=lead.id,
            new_status=LeadStatus.CONTACTED,
        )


@pytest.mark.asyncio
async def test_change_status_requires_company_context(db_session):
    from app.services.crm_service import CrmService, MissingCompanyError

    with pytest.raises(MissingCompanyError):
        await CrmService(db_session).change_status(
            company_id=None,
            lead_id=1,
            new_status=LeadStatus.CONTACTED,
        )


@pytest.mark.asyncio
async def test_convert_lead_creates_client_and_marks_it_ready_for_project(
    db_session,
    company,
    manager,
):
    from app.services.crm_service import CrmService

    lead = Lead(
        company_id=company.id,
        assigned_to=manager.id,
        name="Иван Петров",
        phone="+7 999 000-00-01",
        email="ivan@example.com",
        address="г. Уфа, ул. Ленина, 1",
        description="Ремонт квартиры",
        source="telegram",
    )
    db_session.add(lead)
    await db_session.flush()

    result = await CrmService(db_session).convert_lead(
        company_id=company.id,
        lead_id=lead.id,
        user_id=manager.id,
    )

    assert result.reused_client is False
    assert result.ready_for_project is True
    assert result.client.company_id == company.id
    assert result.client.name == lead.name
    assert result.client.actual_address == lead.address
    assert lead.client_id == result.client.id
    assert lead.status is LeadStatus.CONTRACT
    assert lead.converted_at is not None


@pytest.mark.asyncio
@pytest.mark.parametrize("match_field", ["phone", "email"])
async def test_convert_lead_reuses_contact_match_in_same_company(
    db_session,
    company,
    match_field,
):
    from app.services.crm_service import CrmService

    existing = Client(
        company_id=company.id,
        name="Existing Client",
        phone="+7 (999) 123-45-67" if match_field == "phone" else None,
        email="CLIENT@example.com" if match_field == "email" else None,
    )
    lead = Lead(
        company_id=company.id,
        name="Lead",
        phone="8 999 123 45 67" if match_field == "phone" else None,
        email=" client@EXAMPLE.com " if match_field == "email" else None,
    )
    db_session.add_all([existing, lead])
    await db_session.flush()

    result = await CrmService(db_session).convert_lead(
        company_id=company.id,
        lead_id=lead.id,
    )

    assert result.client is existing
    assert result.reused_client is True
    assert await db_session.scalar(select(func.count()).select_from(Client)) == 1


@pytest.mark.asyncio
async def test_convert_lead_never_reuses_another_company_client(
    db_session,
    company,
):
    from app.services.crm_service import CrmService

    other_company = Company(name="Other Company")
    db_session.add(other_company)
    await db_session.flush()
    foreign_client = Client(
        company_id=other_company.id,
        name="Foreign Client",
        phone="+7 999 222-33-44",
    )
    lead = Lead(
        company_id=company.id,
        name="Local Lead",
        phone="+7 999 222-33-44",
    )
    db_session.add_all([foreign_client, lead])
    await db_session.flush()

    result = await CrmService(db_session).convert_lead(
        company_id=company.id,
        lead_id=lead.id,
    )

    assert result.client.id != foreign_client.id
    assert result.client.company_id == company.id
    assert result.reused_client is False


@pytest.mark.asyncio
async def test_convert_lead_is_idempotent(db_session, company):
    from app.services.crm_service import CrmService

    lead = Lead(company_id=company.id, name="Lead", phone="+7 999 333-44-55")
    db_session.add(lead)
    await db_session.flush()
    service = CrmService(db_session)

    first = await service.convert_lead(company_id=company.id, lead_id=lead.id)
    second = await service.convert_lead(company_id=company.id, lead_id=lead.id)

    assert second.client.id == first.client.id
    assert second.reused_client is True
    assert await db_session.scalar(select(func.count()).select_from(Client)) == 1


@pytest.mark.asyncio
async def test_convert_lead_rejects_ambiguous_contacts_without_changes(
    db_session,
    company,
):
    from app.services.crm_service import CrmService, LeadConversionConflictError

    phone_client = Client(
        company_id=company.id,
        name="Phone Client",
        phone="+7 999 444-55-66",
    )
    email_client = Client(
        company_id=company.id,
        name="Email Client",
        email="lead@example.com",
    )
    lead = Lead(
        company_id=company.id,
        name="Ambiguous Lead",
        phone="8 999 444 55 66",
        email="lead@example.com",
    )
    db_session.add_all([phone_client, email_client, lead])
    await db_session.flush()

    with pytest.raises(LeadConversionConflictError):
        await CrmService(db_session).convert_lead(
            company_id=company.id,
            lead_id=lead.id,
        )

    assert lead.client_id is None
    assert lead.converted_at is None
    assert lead.status is LeadStatus.NEW
    assert await db_session.scalar(select(func.count()).select_from(Client)) == 2


@pytest.mark.asyncio
async def test_convert_lead_rolls_back_with_request_when_audit_fails(
    db_session,
    company,
):
    from app.services.crm_service import CrmService

    class FailingAuditService:
        async def log_create(self, *args, **kwargs):
            raise RuntimeError("audit unavailable")

        async def log_update(self, *args, **kwargs):
            raise RuntimeError("audit unavailable")

    lead = Lead(company_id=company.id, name="Rollback Lead")
    db_session.add(lead)
    await db_session.commit()
    lead_id = lead.id

    with pytest.raises(RuntimeError, match="audit unavailable"):
        await CrmService(
            db_session,
            audit_service=FailingAuditService(),
        ).convert_lead(company_id=company.id, lead_id=lead_id)
    await db_session.rollback()

    restored_lead = await db_session.get(Lead, lead_id)
    assert restored_lead.client_id is None
    assert restored_lead.converted_at is None
    assert restored_lead.status is LeadStatus.NEW
    assert await db_session.scalar(select(func.count()).select_from(Client)) == 0
