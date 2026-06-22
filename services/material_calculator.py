"""
Расчёт материалов по нормам расхода.
"""
import uuid
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import (
    EstimateItem, Work, WorkMaterial, Material, MaterialUsage,
)

logger = logging.getLogger(__name__)


class MaterialCalculator:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def calculate_for_item(self, item_id: uuid.UUID) -> list[MaterialUsage]:
        """Рассчитать материалы для одной позиции сметы."""
        result = await self.db.execute(
            select(EstimateItem).where(EstimateItem.id == item_id)
        )
        item = result.scalar_one()

        if not item.work_id:
            return []

        # Получаем нормы расхода
        wm_result = await self.db.execute(
            select(WorkMaterial).where(WorkMaterial.work_id == item.work_id)
        )
        work_materials = list(wm_result.scalars().all())

        usages = []
        total_material_cost = 0.0

        for wm in work_materials:
            mat_result = await self.db.execute(
                select(Material).where(Material.id == wm.material_id)
            )
            material = mat_result.scalar_one()

            # Расход = объём × норма × (1 + % отходов)
            raw_quantity = item.quantity * wm.consumption_rate
            waste_multiplier = 1 + material.waste_percent / 100
            quantity = round(raw_quantity * waste_multiplier, 3)
            total = round(quantity * material.base_price, 2)
            total_material_cost += total

            usage = MaterialUsage(
                estimate_item_id=item.id,
                material_id=material.id,
                quantity=quantity,
                price=material.base_price,
                total=total,
                waste_included=True,
            )
            self.db.add(usage)
            usages.append(usage)

        # Обновляем стоимость материалов в позиции
        if total_material_cost > 0 and item.quantity > 0:
            item.price_material = round(total_material_cost / item.quantity, 2)
            item.total_material = round(total_material_cost, 2)
            item.total_cost = round(item.total_work + item.total_material, 2)

        await self.db.flush()
        logger.info(
            "Рассчитаны материалы для позиции %s: %d наименований, %.2f руб.",
            item.name, len(usages), total_material_cost,
        )
        return usages

    async def calculate_for_estimate(self, estimate_id: uuid.UUID) -> list[MaterialUsage]:
        """Рассчитать все материалы для сметы."""
        result = await self.db.execute(
            select(EstimateItem).where(EstimateItem.estimate_id == estimate_id)
        )
        items = list(result.scalars().all())

        all_usages = []
        for item in items:
            usages = await self.calculate_for_item(item.id)
            all_usages.extend(usages)

        return all_usages

    async def get_material_summary(self, estimate_id: uuid.UUID) -> list[dict]:
        """Сводная ведомость материалов для сметы (для M-29)."""
        result = await self.db.execute(
            select(MaterialUsage)
            .join(EstimateItem)
            .where(EstimateItem.estimate_id == estimate_id)
        )
        usages = list(result.scalars().all())

        # Группировка по материалу
        summary: dict[uuid.UUID, dict] = {}
        for u in usages:
            mat_id = u.material_id
            if mat_id not in summary:
                mat_result = await self.db.execute(
                    select(Material).where(Material.id == mat_id)
                )
                mat = mat_result.scalar_one()
                summary[mat_id] = {
                    "material_id": str(mat_id),
                    "name": mat.name,
                    "unit": mat.unit,
                    "quantity": 0.0,
                    "price": mat.base_price,
                    "total": 0.0,
                }
            summary[mat_id]["quantity"] = round(
                summary[mat_id]["quantity"] + u.quantity, 3
            )
            summary[mat_id]["total"] = round(
                summary[mat_id]["total"] + u.total, 2
            )

        return list(summary.values())
