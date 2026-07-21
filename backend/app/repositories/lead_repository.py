"""Company-scoped persistence for CRM leads."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lead import Lead, LeadStatus


class LeadRepository:
    """Read and write leads without crossing an organization boundary."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(
        self,
        *,
        company_id: int,
        assigned_to: int | None,
        **data,
    ) -> Lead:
        lead = Lead(
            company_id=company_id,
            assigned_to=assigned_to,
            **data,
        )
        self.session.add(lead)
        await self.session.flush()
        return lead

    async def get_by_id(self, lead_id: int, company_id: int) -> Lead | None:
        result = await self.session.execute(
            select(Lead).where(
                Lead.id == lead_id,
                Lead.company_id == company_id,
            )
        )
        return result.scalar_one_or_none()

    async def list(
        self,
        company_id: int,
        status: LeadStatus | None = None,
    ) -> list[Lead]:
        query = select(Lead).where(Lead.company_id == company_id)
        if status is not None:
            query = query.where(Lead.status == status)
        result = await self.session.execute(query.order_by(Lead.id))
        return list(result.scalars().all())
