"""Transactional business rules for the CRM funnel."""

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.client import Client
from app.models.lead import Lead, LeadStatus
from app.repositories.client_repository import (
    AmbiguousClientMatchError,
    ClientRepository,
)
from app.repositories.lead_repository import LeadRepository
from app.services.audit_service import AuditService


ALLOWED_TRANSITIONS: dict[LeadStatus, set[LeadStatus]] = {
    LeadStatus.NEW: {LeadStatus.CONTACTED, LeadStatus.LOST},
    LeadStatus.CONTACTED: {LeadStatus.QUALIFIED, LeadStatus.LOST},
    LeadStatus.QUALIFIED: {LeadStatus.PROPOSAL, LeadStatus.LOST},
    LeadStatus.PROPOSAL: {LeadStatus.CONTRACT, LeadStatus.LOST},
    LeadStatus.CONTRACT: set(),
    LeadStatus.LOST: set(),
}


class CrmError(Exception):
    """Base error for CRM business-rule failures."""


class LeadNotFoundError(CrmError):
    """Raised when a lead is absent from the active company."""


class InvalidLeadTransitionError(CrmError):
    """Raised when a requested funnel movement is not allowed."""


class MissingCompanyError(CrmError):
    """Raised when an operation has no authenticated company context."""


class LeadConversionConflictError(CrmError):
    """Raised when a lead cannot be mapped to one unambiguous client."""


@dataclass(frozen=True)
class LeadConversionResult:
    """Outcome of a lead conversion command."""

    lead: Lead
    client: Client
    reused_client: bool
    ready_for_project: bool = True


class CrmService:
    """Own CRM transactions while repositories remain persistence-only."""

    def __init__(
        self,
        session: AsyncSession,
        *,
        lead_repository: LeadRepository | None = None,
        client_repository: ClientRepository | None = None,
        audit_service: AuditService | None = None,
    ):
        self.session = session
        self.leads = lead_repository or LeadRepository(session)
        self.clients = client_repository or ClientRepository(session)
        self.audit = audit_service or AuditService(session)

    async def change_status(
        self,
        *,
        company_id: int | None,
        lead_id: int,
        new_status: LeadStatus,
        user_id: int | None = None,
    ) -> Lead:
        if company_id is None:
            raise MissingCompanyError("Company context is required")

        lead = await self.leads.get_by_id(lead_id, company_id)
        if lead is None:
            raise LeadNotFoundError(f"Lead {lead_id} was not found")

        old_status = lead.status
        if new_status not in ALLOWED_TRANSITIONS[old_status]:
            raise InvalidLeadTransitionError(
                f"Cannot move lead from {old_status.value} to {new_status.value}"
            )

        lead.status = new_status
        await self.audit.log_update(
            "lead",
            lead.id,
            old_data={"status": old_status.value},
            new_data={"status": new_status.value},
            fields="status",
            user_id=user_id,
        )
        await self.session.flush()
        return lead

    async def convert_lead(
        self,
        *,
        company_id: int | None,
        lead_id: int,
        user_id: int | None = None,
    ) -> LeadConversionResult:
        if company_id is None:
            raise MissingCompanyError("Company context is required")

        lead = await self.leads.get_by_id(lead_id, company_id)
        if lead is None:
            raise LeadNotFoundError(f"Lead {lead_id} was not found")

        if lead.client_id is not None:
            linked_client = await self.clients.get_by_id(lead.client_id, company_id)
            if linked_client is None:
                raise LeadConversionConflictError(
                    "Lead points to a client outside the active company"
                )
            return LeadConversionResult(
                lead=lead,
                client=linked_client,
                reused_client=True,
            )

        try:
            client = await self.clients.find_match(
                company_id=company_id,
                phone=lead.phone,
                email=lead.email,
            )
        except AmbiguousClientMatchError as error:
            raise LeadConversionConflictError(str(error)) from error

        reused_client = client is not None
        if client is None:
            client = await self.clients.create(
                company_id=company_id,
                name=lead.name,
                phone=lead.phone,
                email=lead.email,
                actual_address=lead.address,
                lead_source=lead.source,
                notes=lead.description,
            )
            await self.audit.log_create(
                "client",
                client.id,
                data={"source_lead_id": lead.id},
                user_id=user_id,
            )

        old_status = lead.status
        lead.client_id = client.id
        lead.converted_at = datetime.now(timezone.utc)
        lead.status = LeadStatus.CONTRACT
        await self.audit.log_update(
            "lead",
            lead.id,
            old_data={
                "status": old_status.value,
                "client_id": None,
            },
            new_data={
                "status": LeadStatus.CONTRACT.value,
                "client_id": client.id,
            },
            fields="status,client_id,converted_at",
            user_id=user_id,
        )
        await self.session.flush()

        return LeadConversionResult(
            lead=lead,
            client=client,
            reused_client=reused_client,
        )
