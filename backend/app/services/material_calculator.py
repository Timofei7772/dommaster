"""
Калькулятор расхода материалов
"""

from typing import List, Dict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.erp_models import WorkMaterial, MaterialUsage
from app.models.estimate import EstimateItem
from app.models.material import Material


class MaterialCalculator:
    """Расчёт материалов по нормам расхода из work_materials"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def calculate_for_item(self, item: EstimateItem) -> List[MaterialUsage]:
        """Рассчитать расход материалов для позиции сметы"""
        if not item.work_id:
            return []

        # Получаем нормы расхода для данной работы
        result = await self.db.execute(
            select(WorkMaterial)
            .where(WorkMaterial.work_id == item.work_id)
        )
        norms = result.scalars().all()

        usages = []
        for norm in norms:
            # Получаем текущую цену материала
            mat_result = await self.db.execute(
                select(Material).where(Material.id == norm.material_id)
            )
            material = mat_result.scalar_one_or_none()
            if not material:
                continue

            quantity = round((item.quantity or 0) * (norm.consumption_rate or 0), 4)
            price = material.current_price or material.base_price or 0

            usage = MaterialUsage(
                estimate_item_id=item.id,
                material_id=norm.material_id,
                quantity=quantity,
                price=price,
                total=round(quantity * price, 2),
            )
            usages.append(usage)

        return usages

    async def calculate_for_estimate(self, estimate_id: int) -> List[MaterialUsage]:
        """Рассчитать расход материалов для всей сметы"""
        result = await self.db.execute(
            select(EstimateItem)
            .where(EstimateItem.estimate_id == estimate_id)
        )
        items = result.scalars().all()

        # Удаляем старые расчёты
        for item in items:
            old_result = await self.db.execute(
                select(MaterialUsage)
                .where(MaterialUsage.estimate_item_id == item.id)
            )
            for old_usage in old_result.scalars().all():
                await self.db.delete(old_usage)

        # Рассчитываем новые
        all_usages = []
        for item in items:
            usages = await self.calculate_for_item(item)
            for usage in usages:
                self.db.add(usage)
                all_usages.append(usage)

        await self.db.flush()
        return all_usages

    async def get_material_summary(self, estimate_id: int) -> List[Dict]:
        """Сводка расхода материалов по смете (группировка по материалу)"""
        result = await self.db.execute(
            select(EstimateItem)
            .where(EstimateItem.estimate_id == estimate_id)
        )
        items = result.scalars().all()
        item_ids = [i.id for i in items]

        if not item_ids:
            return []

        usage_result = await self.db.execute(
            select(MaterialUsage)
            .where(MaterialUsage.estimate_item_id.in_(item_ids))
        )
        usages = usage_result.scalars().all()

        # Группируем по материалу
        summary = {}
        for usage in usages:
            mid = usage.material_id
            if mid not in summary:
                mat_result = await self.db.execute(
                    select(Material).where(Material.id == mid)
                )
                mat = mat_result.scalar_one_or_none()
                summary[mid] = {
                    "material_id": mid,
                    "name": mat.name if mat else "Неизвестный",
                    "unit": mat.unit if mat else "",
                    "total_quantity": 0.0,
                    "avg_price": 0.0,
                    "total_cost": 0.0,
                }
            summary[mid]["total_quantity"] = round(summary[mid]["total_quantity"] + usage.quantity, 4)
            summary[mid]["total_cost"] = round(summary[mid]["total_cost"] + usage.total, 2)

        # Средняя цена
        for data in summary.values():
            if data["total_quantity"] > 0:
                data["avg_price"] = round(data["total_cost"] / data["total_quantity"], 2)

        return list(summary.values())
