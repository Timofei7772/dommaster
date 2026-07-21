"""CRM model contracts."""

import pytest


@pytest.mark.asyncio
async def test_lead_defaults_to_new_and_belongs_to_company(
    db_session,
    company,
    manager,
):
    from app.models.lead import Lead, LeadStatus

    lead = Lead(
        company_id=company.id,
        assigned_to=manager.id,
        name="Иван Петров",
        phone="+79990000000",
    )
    db_session.add(lead)
    await db_session.flush()

    assert lead.id is not None
    assert lead.status is LeadStatus.NEW
    assert lead.company_id == company.id
