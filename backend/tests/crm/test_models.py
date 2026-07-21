"""CRM model contracts."""

import pytest
from sqlalchemy.exc import IntegrityError


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


@pytest.mark.asyncio
async def test_lead_connects_company_manager_and_converted_client(
    db_session,
    company,
    manager,
):
    from app.models.client import Client
    from app.models.lead import Lead

    client = Client(company_id=company.id, name="Заказчик")
    lead = Lead(
        company_id=company.id,
        assigned_to=manager.id,
        name="Заказчик",
        client=client,
    )
    db_session.add(lead)
    await db_session.flush()
    await db_session.refresh(company, ["clients"])
    await db_session.refresh(manager, ["assigned_leads"])

    assert lead.company is company
    assert lead.manager is manager
    assert lead.client is client
    assert client in company.clients
    assert lead in manager.assigned_leads
    assert lead in client.source_leads


@pytest.mark.asyncio
async def test_client_requires_company(db_session):
    from app.models.client import Client

    db_session.add(Client(name="Клиент без компании"))

    with pytest.raises(IntegrityError):
        await db_session.flush()


@pytest.mark.asyncio
async def test_two_companies_may_share_client_contact_details(db_session, company):
    from app.models.client import Client
    from app.models.company import Company

    other_company = Company(name="Other CRM Company")
    db_session.add(other_company)
    await db_session.flush()

    db_session.add_all([
        Client(
            company_id=company.id,
            name="Первый клиент",
            phone="+79990000000",
            email="client@example.test",
        ),
        Client(
            company_id=other_company.id,
            name="Второй клиент",
            phone="+79990000000",
            email="client@example.test",
        ),
    ])

    await db_session.flush()
