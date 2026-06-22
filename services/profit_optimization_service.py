"""
Оптимизация прибыли: анализ маржи, поиск перерасходов, рекомендации.
"""
import uuid
import logging
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import (
    Estimate, EstimateItem, ProjectFinance,
    MaterialUsage, LaborPayment, Material,
)

logger = logging.getLogger(__name__)


class ProfitOptimizationService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def analyze_estimate(self, estimate_id: uuid.UUID) -> dict:
        est_result = await self.db.execute(
            select(Estimate).where(Estimate.id == estimate_id)
        )
        estimate = est_result.scalar_one()

        items_result = await self.db.execute(
            select(EstimateItem).where(EstimateItem.estimate_id == estimate_id)
        )
        items = list(items_result.scalars().all())

        analysis = {
            "estimate_id": str(estimate_id),
            "current_price": estimate.final_price,
            "recommendations": [],
            "potential_savings": 0.0,
            "potential_revenue_increase": 0.0,
            "item_analysis": [],
        }

        for item in items:
            item_analysis = await self._analyze_item(item)
            analysis["item_analysis"].append(item_analysis)
            analysis["potential_savings"] += item_analysis.get("potential_saving", 0)

        # Рекомендации по наценке
        fin_result = await self.db.execute(
            select(ProjectFinance).where(ProjectFinance.estimate_id == estimate_id)
        )
        finance = fin_result.scalar_one_or_none()

        if finance:
            if finance.margin_percent < 15:
                analysis["recommendations"].append({
                    "type": "low_margin",
                    "message": f"Маржа {finance.margin_percent:.1f}% ниже рекомендуемой (15%)",
                    "action": "Рассмотрите увеличение наценки или оптимизацию расходов",
                })
            if finance.overhead_percent < 10:
                analysis["recommendations"].append({
                    "type": "low_overhead",
                    "message": "Накладные расходы занижены",
                    "action": "Рекомендуется минимум 10% на накладные",
                })

        # Поиск позиций с аномально низкой маржой
        for item in items:
            if item.total_cost > 0 and item.price_work > 0:
                work_share = item.total_work / item.total_cost
                if work_share < 0.3:
                    analysis["recommendations"].append({
                        "type": "low_work_share",
                        "item": item.name,
                        "message": f"Доля работ {work_share:.0%} — возможно занижена цена",
                        "action": "Проверьте расценки на работы",
                    })

        return analysis

    async def _analyze_item(self, item: EstimateItem) -> dict:
        result = {
            "item_id": str(item.id),
            "name": item.name,
            "current_cost": item.total_cost,
            "potential_saving": 0.0,
            "suggestions": [],
        }

        # Проверяем перерасход материалов
        mu_result = await self.db.execute(
            select(MaterialUsage).where(MaterialUsage.estimate_item_id == item.id)
        )
        usages = list(mu_result.scalars().all())

        for usage in usages:
            if usage.actual_quantity > 0:
                overuse = usage.actual_quantity - usage.quantity
                if overuse > 0:
                    cost = overuse * usage.price
                    result["potential_saving"] += cost
                    result["suggestions"].append({
                        "type": "material_overuse",
                        "material_id": str(usage.material_id),
                        "overuse_quantity": round(overuse, 3),
                        "overuse_cost": round(cost, 2),
                    })

        return result

    async def suggest_price_increase(
        self, estimate_id: uuid.UUID, target_margin: float = 25.0,
    ) -> dict:
        """Предложить повышение цены до целевой маржи."""
        fin_result = await self.db.execute(
            select(ProjectFinance).where(ProjectFinance.estimate_id == estimate_id)
        )
        finance = fin_result.scalar_one_or_none()
        if not finance:
            return {"error": "Финансы не рассчитаны"}

        cost = finance.labor_cost + finance.material_cost + finance.overhead_amount
        target_price = cost / (1 - target_margin / 100)
        increase = target_price - finance.total_price

        return {
            "current_price": finance.total_price,
            "current_margin": finance.margin_percent,
            "target_margin": target_margin,
            "suggested_price": round(target_price, 2),
            "price_increase": round(increase, 2),
            "increase_percent": round(increase / finance.total_price * 100, 2)
            if finance.total_price > 0 else 0,
        }

    async def find_material_alternatives(
        self, estimate_id: uuid.UUID,
    ) -> list[dict]:
        """Найти альтернативные материалы дешевле текущих."""
        mu_result = await self.db.execute(
            select(MaterialUsage)
            .join(EstimateItem)
            .where(EstimateItem.estimate_id == estimate_id)
        )
        usages = list(mu_result.scalars().all())

        alternatives = []
        for usage in usages:
            mat_result = await self.db.execute(
                select(Material).where(Material.id == usage.material_id)
            )
            current = mat_result.scalar_one()

            # Ищем более дешёвые аналоги той же категории
            alt_result = await self.db.execute(
                select(Material)
                .where(
                    Material.category == current.category,
                    Material.base_price < current.base_price,
                    Material.id != current.id,
                )
                .order_by(Material.base_price)
                .limit(3)
            )
            alt_materials = list(alt_result.scalars().all())

            for alt in alt_materials:
                saving = (current.base_price - alt.base_price) * usage.quantity
                alternatives.append({
                    "current_material": current.name,
                    "current_price": current.base_price,
                    "alternative_material": alt.name,
                    "alternative_price": alt.base_price,
                    "quantity": usage.quantity,
                    "saving": round(saving, 2),
                })

        return sorted(alternatives, key=lambda x: x["saving"], reverse=True)
