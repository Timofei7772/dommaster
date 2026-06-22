"""
Контроль хода выполнения работ.
"""
import uuid
import logging
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import EstimateItem, WorkProgress

logger = logging.getLogger(__name__)


class WorkProgressService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def update_progress(
        self,
        item_id: uuid.UUID,
        completed_volume: float,
    ) -> WorkProgress:
        item_result = await self.db.execute(
            select(EstimateItem).where(EstimateItem.id == item_id)
        )
        item = item_result.scalar_one()

        prog_result = await self.db.execute(
            select(WorkProgress).where(WorkProgress.estimate_item_id == item_id)
        )
        progress = prog_result.scalar_one_or_none()

        if not progress:
            progress = WorkProgress(
                estimate_item_id=item_id,
                planned_volume=item.planned_volume,
            )
            self.db.add(progress)

        progress.completed_volume = completed_volume
        progress.remaining_volume = max(0, progress.planned_volume - completed_volume)
        if progress.planned_volume > 0:
            progress.percent_complete = round(
                completed_volume / progress.planned_volume * 100, 1
            )
        if completed_volume > 0 and not progress.actual_start:
            progress.actual_start = datetime.now()
        if completed_volume >= progress.planned_volume and not progress.actual_end:
            progress.actual_end = datetime.now()

        # Синхронизация с позицией
        item.completed_volume = completed_volume
        item.remaining_volume = progress.remaining_volume

        await self.db.flush()
        return progress

    async def get_project_progress(self, estimate_id: uuid.UUID) -> dict:
        result = await self.db.execute(
            select(EstimateItem).where(EstimateItem.estimate_id == estimate_id)
        )
        items = list(result.scalars().all())

        total_planned = sum(i.planned_volume for i in items)
        total_completed = sum(i.completed_volume for i in items)
        total_remaining = sum(i.remaining_volume for i in items)

        total_cost = sum(i.total_cost for i in items)
        completed_cost = sum(
            i.completed_volume * (i.price_work + i.price_material)
            for i in items
        )

        return {
            "total_items": len(items),
            "completed_items": sum(
                1 for i in items if i.completed_volume >= i.planned_volume
            ),
            "total_planned_volume": total_planned,
            "total_completed_volume": total_completed,
            "total_remaining_volume": total_remaining,
            "percent_complete": round(
                total_completed / total_planned * 100, 1
            ) if total_planned > 0 else 0,
            "total_budget": round(total_cost, 2),
            "spent_budget": round(completed_cost, 2),
            "remaining_budget": round(total_cost - completed_cost, 2),
        }
