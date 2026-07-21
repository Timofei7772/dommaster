"""Contracts for tenant-scoped CRM persistence."""

import pytest

from app.models.client import Client
from app.models.company import Company
from app.models.lead import Lead, LeadStatus


@pytest.mark.asyncio
async def test_lead_repository_never_crosses_company_boundary(
    db_session,
    company,
    manager,
):
    from app.repositories.lead_repository import LeadRepository

    other_company = Company(name="Other Company")
    db_session.add(other_company)
    await db_session.flush()

    own_lead = Lead(
        company_id=company.id,
        assigned_to=manager.id,
        name="Own Lead",
        status=LeadStatus.NEW,
    )
    foreign_lead = Lead(
        company_id=other_company.id,
        name="Foreign Lead",
        status=LeadStatus.QUALIFIED,
    )
    db_session.add_all([own_lead, foreign_lead])
    await db_session.flush()

    repository = LeadRepository(db_session)

    assert await repository.get_by_id(own_lead.id, company.id) is own_lead
    assert await repository.get_by_id(foreign_lead.id, company.id) is None
    assert await repository.list(company.id) == [own_lead]
    assert await repository.list(company.id, LeadStatus.QUALIFIED) == []


@pytest.mark.asyncio
async def test_lead_repository_create_uses_explicit_company_context(
    db_session,
    company,
    manager,
):
    from app.repositories.lead_repository import LeadRepository

    repository = LeadRepository(db_session)
    lead = await repository.create(
        company_id=company.id,
        assigned_to=manager.id,
        name="Created Lead",
        phone="+7 999 000-00-00",
    )

    assert lead.id is not None
    assert lead.company_id == company.id
    assert lead.status is LeadStatus.NEW


@pytest.mark.asyncio
async def test_client_repository_matches_normalized_contact_within_company(
    db_session,
    company,
):
    from app.repositories.client_repository import ClientRepository

    other_company = Company(name="Other Company")
    db_session.add(other_company)
    await db_session.flush()

    own_client = Client(
        company_id=company.id,
        name="Иван Петров",
        phone="+7 (999) 123-45-67",
        email=" Client@Example.COM ",
    )
    foreign_client = Client(
        company_id=other_company.id,
        name="Foreign Client",
        phone="79991234567",
        email="client@example.com",
    )
    db_session.add_all([own_client, foreign_client])
    await db_session.flush()

    repository = ClientRepository(db_session)

    assert await repository.find_match(
        company_id=company.id,
        phone="8 (999) 123-45-67",
        email=None,
    ) is own_client
    assert await repository.find_match(
        company_id=company.id,
        phone=None,
        email="client@example.com",
    ) is own_client


@pytest.mark.asyncio
async def test_client_repository_reports_conflicting_identity_matches(
    db_session,
    company,
):
    from app.repositories.client_repository import (
        AmbiguousClientMatchError,
        ClientRepository,
    )

    phone_client = Client(
        company_id=company.id,
        name="Phone Match",
        phone="+7 999 111-22-33",
    )
    email_client = Client(
        company_id=company.id,
        name="Email Match",
        email="person@example.com",
    )
    db_session.add_all([phone_client, email_client])
    await db_session.flush()

    repository = ClientRepository(db_session)

    with pytest.raises(AmbiguousClientMatchError):
        await repository.find_match(
            company_id=company.id,
            phone="79991112233",
            email=" PERSON@example.com ",
        )


@pytest.mark.asyncio
async def test_client_repository_get_and_create_are_company_scoped(
    db_session,
    company,
):
    from app.repositories.client_repository import ClientRepository

    repository = ClientRepository(db_session)
    client = await repository.create(
        company_id=company.id,
        name="New Client",
        email="new@example.com",
    )

    assert client.id is not None
    assert await repository.get_by_id(client.id, company.id) is client
    assert await repository.get_by_id(client.id, company.id + 1000) is None
