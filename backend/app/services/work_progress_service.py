"""
Сервис контроля выполнения работ
"""

from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.erp_models import WorkProgress
from app.models.estimate import EstimateItem, Estimate


class WorkProgressService:
    """Контроль выполнения работ"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def init_progress_for_estimate(self, estimate_id: int) -> List[WorkProgress]:
        """Инициализировать прогресс для всех позиций сметы"""
        result = await self.db.execute(
            select(EstimateItem)
            .where(EstimateItem.estimate_id == estimate_id)
        )
        items = result.scalars().all()

        progress_list = []
        for item in items:
            if item.row_type in ('comment', 'spr', 'empt', 'irazd'):
                continue

            # Проверяем, не создан ли уже
            existing = await self.db.execute(
                select(WorkProgress)
                .where(WorkProgress.estimate_item_id == item.id)
            )
            wp = existing.scalar_one_or_none()

            if not wp:
                wp = WorkProgress(
                    estimate_item_id=item.id,
                    planned_volume=item.quantity or 0,
                    completed_volume=0.0,
                    remaining_volume=item.quantity or 0,
                )
                self.db.add(wp)

            progress_list.append(wp)

        await self.db.flush()
        return progress_list

    async def update_progress(
        self,
        estimate_item_id: int,
        completed_volume: float,
    ) -> Optional[WorkProgress]:
        """Обновить выполненный объём"""
        result = await self.db.execute(
            select(WorkProgress)
            .where(WorkProgress.estimate_item_id == estimate_item_id)
        )
        wp = result.scalar_one_or_none()
        if not wp:
            return None

        wp.completed_volume = completed_volume
        wp.recalculate()
        await self.db.flush()
        return wp

    async def get_estimate_progress(self, estimate_id: int) -> Dict[str, Any]:
        """Общий прогресс по смете"""
        result = await self.db.execute(
            select(EstimateItem)
            .where(EstimateItem.estimate_id == estimate_id)
        )
        items = result.scalars().all()
        item_ids = [i.id for i in items]

        if not item_ids:
            return {"total_planned": 0, "total_completed": 0, "progress_percent": 0}

        wp_result = await self.db.execute(
            select(WorkProgress)
            .where(WorkProgress.estimate_item_id.in_(item_ids))
        )
        progress_list = wp_result.scalars().all()

        total_planned = sum(wp.planned_volume or 0 for wp in progress_list)
        total_completed = sum(wp.completed_volume or 0 for wp in progress_list)

        # Прогресс по стоимости
        total_cost = 0.0
        completed_cost = 0.0
        for item in items:
            if item.row_type in ('comment', 'spr', 'empt', 'irazd'):
                continue
            item_total = item.total or 0
            # Находим прогресс для этой позиции
            wp = next((p for p in progress_list if p.estimate_item_id == item.id), None)
            if wp and (item.quantity or 0) > 0:
                ratio = (wp.completed_volume or 0) / (item.quantity or 1)
                completed_cost += item_total * min(ratio, 1.0)
            total_cost += item_total

        return {
            "estimate_id": estimate_id,
            "total_items": len(items),
            "tracked_items": len(progress_list),
            "total_cost": round(total_cost, 2),
            "completed_cost": round(completed_cost, 2),
            "progress_percent": round(completed_cost / total_cost * 100, 2) if total_cost > 0 else 0,
        }

    async def get_items_progress(self, estimate_id: int) -> List[Dict]:
        """Прогресс по каждой позиции"""
        result = await self.db.execute(
            select(EstimateItem)
            .where(EstimateItem.estimate_id == estimate_id)
        )
        items = result.scalars().all()

        output = []
        for item in items:
            if item.row_type in ('comment', 'spr', 'empt', 'irazd'):
                continue

            wp_result = await self.db.execute(
                select(WorkProgress)
                .where(WorkProgress.estimate_item_id == item.id)
            )
            wp = wp_result.scalar_one_or_none()

            output.append({
                "item_id": item.id,
                "name": item.name,
                "unit": item.unit,
                "planned": wp.planned_volume if wp else (item.quantity or 0),
                "completed": wp.completed_volume if wp else 0,
                "remaining": wp.remaining_volume if wp else (item.quantity or 0),
                "percent": round(
                    (wp.completed_volume / wp.planned_volume * 100) if wp and wp.planned_volume else 0, 1
                ),
            })

        return output
