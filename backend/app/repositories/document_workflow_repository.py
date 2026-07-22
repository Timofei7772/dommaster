"""Tenant-scoped persistence for immutable document workflow records."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.models.contract import Contract
from app.models.document_workflow import (
    DocumentAuditEvent,
    DocumentSnapshot,
    EstimateRevision,
)
from app.models.estimate import Estimate
from app.models.project import Project


class DocumentWorkflowRepository:
    """Load workflow sources without crossing a company boundary."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_estimate_for_approval(
        self,
        *,
        estimate_id: int,
        company_id: int,
    ) -> Estimate | None:
        result = await self.session.execute(
            select(Estimate)
            .join(Project, Estimate.project_id == Project.id)
            .where(
                Estimate.id == estimate_id,
                Project.company_id == company_id,
            )
            .options(
                selectinload(Estimate.sections),
                selectinload(Estimate.items),
                joinedload(Estimate.project).joinedload(Project.client),
                joinedload(Estimate.project).joinedload(Project.company),
                joinedload(Estimate.object),
            )
        )
        return result.scalar_one_or_none()

    async def get_revision_by_idempotency_key(
        self,
        *,
        company_id: int,
        idempotency_key: str,
    ) -> EstimateRevision | None:
        result = await self.session.execute(
            select(EstimateRevision).where(
                EstimateRevision.company_id == company_id,
                EstimateRevision.idempotency_key == idempotency_key,
            )
        )
        return result.scalar_one_or_none()

    async def next_revision_number(self, *, estimate_id: int) -> int:
        result = await self.session.execute(
            select(func.max(EstimateRevision.revision_number)).where(
                EstimateRevision.estimate_id == estimate_id
            )
        )
        return int(result.scalar_one_or_none() or 0) + 1

    async def create_revision(self, **data) -> EstimateRevision:
        revision = EstimateRevision(**data)
        self.session.add(revision)
        await self.session.flush()
        return revision

    async def get_revision(
        self,
        *,
        revision_id: int,
        company_id: int,
    ) -> EstimateRevision | None:
        result = await self.session.execute(
            select(EstimateRevision).where(
                EstimateRevision.id == revision_id,
                EstimateRevision.company_id == company_id,
            )
        )
        return result.scalar_one_or_none()

    async def get_snapshot_by_idempotency_key(
        self,
        *,
        company_id: int,
        idempotency_key: str,
    ) -> DocumentSnapshot | None:
        result = await self.session.execute(
            select(DocumentSnapshot).where(
                DocumentSnapshot.company_id == company_id,
                DocumentSnapshot.idempotency_key == idempotency_key,
            )
        )
        return result.scalar_one_or_none()

    async def get_contract(self, contract_id: int) -> Contract | None:
        return await self.session.get(Contract, contract_id)

    async def create_contract(self, **data) -> Contract:
        contract = Contract(**data)
        self.session.add(contract)
        await self.session.flush()
        return contract

    async def create_snapshot(self, **data) -> DocumentSnapshot:
        snapshot = DocumentSnapshot(**data)
        self.session.add(snapshot)
        await self.session.flush()
        return snapshot

    async def create_audit_event(self, **data) -> DocumentAuditEvent:
        event = DocumentAuditEvent(**data)
        self.session.add(event)
        await self.session.flush()
        return event
