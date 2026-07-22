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
from app.models.ks2 import KS2Act, KS2Item
from app.models.ks3 import KS3Certificate, KS3Item
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

    async def get_contract_snapshot(
        self,
        *,
        contract_id: int,
        revision_id: int,
        company_id: int,
    ) -> DocumentSnapshot | None:
        result = await self.session.execute(
            select(DocumentSnapshot).where(
                DocumentSnapshot.document_type == "contract",
                DocumentSnapshot.entity_id == contract_id,
                DocumentSnapshot.estimate_revision_id == revision_id,
                DocumentSnapshot.company_id == company_id,
            )
        )
        return result.scalar_one_or_none()

    async def get_ks2(self, ks2_id: int) -> KS2Act | None:
        result = await self.session.execute(
            select(KS2Act)
            .where(KS2Act.id == ks2_id)
            .options(selectinload(KS2Act.items))
        )
        return result.scalar_one_or_none()

    async def get_company_ks2(
        self,
        *,
        ks2_id: int,
        company_id: int,
    ) -> KS2Act | None:
        result = await self.session.execute(
            select(KS2Act)
            .join(DocumentSnapshot, DocumentSnapshot.entity_id == KS2Act.id)
            .where(
                KS2Act.id == ks2_id,
                DocumentSnapshot.document_type == "ks2",
                DocumentSnapshot.company_id == company_id,
            )
            .options(selectinload(KS2Act.items))
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def get_document_snapshot(
        self,
        *,
        document_type: str,
        entity_id: int,
        status: str | None = None,
    ) -> DocumentSnapshot | None:
        query = select(DocumentSnapshot).where(
            DocumentSnapshot.document_type == document_type,
            DocumentSnapshot.entity_id == entity_id,
        )
        if status is not None:
            query = query.where(DocumentSnapshot.status == status)
        result = await self.session.execute(
            query.order_by(DocumentSnapshot.version.desc()).limit(1)
        )
        return result.scalar_one_or_none()

    async def next_snapshot_version(
        self,
        *,
        document_type: str,
        entity_id: int,
    ) -> int:
        result = await self.session.execute(
            select(func.max(DocumentSnapshot.version)).where(
                DocumentSnapshot.document_type == document_type,
                DocumentSnapshot.entity_id == entity_id,
            )
        )
        return int(result.scalar_one_or_none() or 0) + 1

    async def get_signed_ks2_quantities(
        self,
        *,
        revision_id: int,
        company_id: int,
        exclude_ks2_id: int | None = None,
    ) -> dict[int, float]:
        query = (
            select(KS2Item.estimate_item_id, func.sum(KS2Item.quantity_done))
            .join(KS2Act, KS2Act.id == KS2Item.act_id)
            .join(DocumentSnapshot, DocumentSnapshot.entity_id == KS2Act.id)
            .where(
                DocumentSnapshot.document_type == "ks2",
                DocumentSnapshot.status == "signed",
                DocumentSnapshot.estimate_revision_id == revision_id,
                DocumentSnapshot.company_id == company_id,
            )
            .group_by(KS2Item.estimate_item_id)
        )
        if exclude_ks2_id is not None:
            query = query.where(KS2Act.id != exclude_ks2_id)
        result = await self.session.execute(query)
        return {
            int(source_row_id): float(quantity or 0)
            for source_row_id, quantity in result.all()
            if source_row_id is not None
        }

    async def create_ks2(self, **data) -> KS2Act:
        act = KS2Act(**data)
        self.session.add(act)
        await self.session.flush()
        return act

    async def create_ks2_item(self, **data) -> KS2Item:
        item = KS2Item(**data)
        self.session.add(item)
        await self.session.flush()
        return item

    async def get_signed_ks2_acts(
        self,
        *,
        ks2_ids: list[int],
        company_id: int,
    ) -> list[KS2Act]:
        result = await self.session.execute(
            select(KS2Act)
            .join(DocumentSnapshot, DocumentSnapshot.entity_id == KS2Act.id)
            .where(
                KS2Act.id.in_(ks2_ids),
                DocumentSnapshot.document_type == "ks2",
                DocumentSnapshot.status == "signed",
                DocumentSnapshot.company_id == company_id,
            )
            .options(selectinload(KS2Act.items))
            .order_by(KS2Act.id)
        )
        return list(result.unique().scalars().all())

    async def get_used_ks2_ids(
        self,
        *,
        ks2_ids: list[int],
        company_id: int,
    ) -> set[int]:
        result = await self.session.execute(
            select(KS3Item.ks2_act_id)
            .join(KS3Certificate, KS3Certificate.id == KS3Item.certificate_id)
            .join(
                DocumentSnapshot,
                DocumentSnapshot.entity_id == KS3Certificate.id,
            )
            .where(
                KS3Item.ks2_act_id.in_(ks2_ids),
                DocumentSnapshot.document_type == "ks3",
                DocumentSnapshot.company_id == company_id,
            )
        )
        return set(result.scalars().all())

    async def get_ks3(self, certificate_id: int) -> KS3Certificate | None:
        result = await self.session.execute(
            select(KS3Certificate)
            .where(KS3Certificate.id == certificate_id)
            .options(selectinload(KS3Certificate.items))
        )
        return result.scalar_one_or_none()

    async def get_previous_ks3_total(
        self,
        *,
        revision_id: int,
        company_id: int,
    ) -> float:
        result = await self.session.execute(
            select(func.sum(KS3Certificate.total_current_period))
            .join(
                DocumentSnapshot,
                DocumentSnapshot.entity_id == KS3Certificate.id,
            )
            .where(
                DocumentSnapshot.document_type == "ks3",
                DocumentSnapshot.estimate_revision_id == revision_id,
                DocumentSnapshot.company_id == company_id,
            )
        )
        return float(result.scalar_one_or_none() or 0)

    async def create_ks3(self, **data) -> KS3Certificate:
        certificate = KS3Certificate(**data)
        self.session.add(certificate)
        await self.session.flush()
        return certificate

    async def create_ks3_item(self, **data) -> KS3Item:
        item = KS3Item(**data)
        self.session.add(item)
        await self.session.flush()
        return item
