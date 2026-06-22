"""
Сервис оптимизации прибыли
"""

from typing import List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.estimate import Estimate, EstimateItem
from app.models.erp_models import LaborPayment, MaterialUsage


class ProfitOptimizationService:
    """Анализ и оптимизация маржинальности"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def analyze_estimate(self, estimate_id: int) -> Dict[str, Any]:
        """Полный анализ прибыльности сметы"""
        result = await self.db.execute(
            select(Estimate)
            .options(selectinload(Estimate.items))
            .where(Estimate.id == estimate_id)
        )
        estimate = result.scalar_one_or_none()
        if not estimate:
            return {}

        recommendations = []
        potential_savings = 0.0

        # 1. Анализ накладных
        overhead_analysis = self._analyze_overhead(estimate)
        recommendations.extend(overhead_analysis["recommendations"])
        potential_savings += overhead_analysis["potential"]

        # 2. Анализ маржинальности по позициям
        item_analysis = await self._analyze_items(estimate)
        recommendations.extend(item_analysis["recommendations"])
        potential_savings += item_analysis["potential"]

        # 3. Анализ материалов
        material_analysis = await self._analyze_material_costs(estimate_id)
        recommendations.extend(material_analysis["recommendations"])
        potential_savings += material_analysis["potential"]

        return {
            "estimate_id": estimate_id,
            "current_margin": round((estimate.overhead_cost or 0) + (estimate.profit_cost or 0), 2),
            "current_margin_percent": self._calc_margin_percent(estimate),
            "potential_savings": round(potential_savings, 2),
            "recommendations": recommendations,
            "risk_level": self._assess_risk(estimate),
        }

    def _analyze_overhead(self, estimate: Estimate) -> Dict:
        """Анализ накладных расходов"""
        recommendations = []
        potential = 0.0
        pct = estimate.overhead_percent or 0

        if pct < 12:
            diff = 12 - pct
            base = (estimate.labor_cost or 0) + (estimate.materials_cost or 0) + (estimate.machines_cost or 0)
            potential = round(base * diff / 100, 2)
            recommendations.append({
                "type": "overhead",
                "priority": "high",
                "message": f"Накладные расходы ({pct}%) ниже рыночных (12-18%). "
                           f"Повышение до 12% добавит {potential:.0f} руб.",
            })

        return {"recommendations": recommendations, "potential": potential}

    async def _analyze_items(self, estimate: Estimate) -> Dict:
        """Анализ позиций на предмет недооценки"""
        recommendations = []
        potential = 0.0

        low_margin_items = []
        for item in estimate.items:
            if item.row_type in ('comment', 'spr', 'empt', 'irazd'):
                continue
            labor = item.labor_price or 0
            mat = item.materials_price or 0
            total_base = labor + mat
            if total_base > 0 and labor > 0:
                labor_ratio = labor / total_base
                if labor_ratio < 0.25:  # Работа < 25% от стоимости
                    low_margin_items.append(item)

        if low_margin_items:
            recommendations.append({
                "type": "pricing",
                "priority": "medium",
                "message": f"Найдено {len(low_margin_items)} позиций с низкой долей работ (<25%). "
                           f"Возможно, цена работ занижена.",
                "items": [{"id": i.id, "name": i.name} for i in low_margin_items[:5]],
            })

        return {"recommendations": recommendations, "potential": potential}

    async def _analyze_material_costs(self, estimate_id: int) -> Dict:
        """Анализ расходов на материалы"""
        recommendations = []
        potential = 0.0

        # Проверяем наличие данных о расходе материалов
        result = await self.db.execute(
            select(EstimateItem)
            .where(EstimateItem.estimate_id == estimate_id)
        )
        items = result.scalars().all()
        item_ids = [i.id for i in items]

        if item_ids:
            usage_result = await self.db.execute(
                select(MaterialUsage)
                .where(MaterialUsage.estimate_item_id.in_(item_ids))
            )
            usages = usage_result.scalars().all()

            if not usages and items:
                recommendations.append({
                    "type": "materials",
                    "priority": "low",
                    "message": "Нет данных о нормах расхода материалов. "
                               "Добавьте привязки work_materials для точного учёта.",
                })

        return {"recommendations": recommendations, "potential": potential}

    def _calc_margin_percent(self, estimate: Estimate) -> float:
        total = estimate.total_cost or 0
        if total <= 0:
            return 0
        margin = (estimate.overhead_cost or 0) + (estimate.profit_cost or 0)
        return round(margin / total * 100, 2)

    def _assess_risk(self, estimate: Estimate) -> str:
        margin_pct = self._calc_margin_percent(estimate)
        if margin_pct < 5:
            return "high"
        elif margin_pct < 15:
            return "medium"
        return "low"
