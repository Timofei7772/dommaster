"""
AI-прораб — контроль стройки, сроки, бюджет, материалы
"""

from typing import Dict, Any
from sqlalchemy import select

from app.ai.base_agent import BaseAgent
from app.ai.prompts import SITE_MANAGER_PROMPT
from app.models.erp_models import WorkProgress, MaterialUsage, ProjectFinance
from app.models.estimate import Estimate, EstimateItem


class AISiteManagerAgent(BaseAgent):
    name = "AISiteManager"
    description = "AI-прораб: контроль сроков, бюджета, расхода материалов"
    system_prompt = SITE_MANAGER_PROMPT

    async def _process(self, task: Dict[str, Any]) -> Dict[str, Any]:
        estimate_id = task.get("estimate_id")
        if not estimate_id:
            return {"site_report": {"error": "Не указан ID сметы"}}

        # Собираем данные
        progress_data = await self._get_progress(estimate_id)
        finance_data = await self._get_finance(estimate_id)
        material_data = await self._get_material_usage(estimate_id)

        prompt = f"""Проанализируй состояние строительного объекта как прораб:

Прогресс работ: {progress_data}
Финансы: {finance_data}
Расход материалов: {material_data}

Дай оценку состояния, выяви проблемы и дай рекомендации."""

        report = await self.ask_llm_json(prompt)
        return {"site_report": report}

    async def _get_progress(self, estimate_id: int) -> Dict:
        result = await self.db.execute(
            select(EstimateItem)
            .where(EstimateItem.estimate_id == estimate_id)
        )
        items = result.scalars().all()

        progress = []
        for item in items[:50]:
            wp_result = await self.db.execute(
                select(WorkProgress)
                .where(WorkProgress.estimate_item_id == item.id)
            )
            wp = wp_result.scalar_one_or_none()
            if wp:
                progress.append({
                    "name": item.name,
                    "planned": wp.planned_volume,
                    "completed": wp.completed_volume,
                    "remaining": wp.remaining_volume,
                })

        total_planned = sum(p["planned"] for p in progress) if progress else 0
        total_completed = sum(p["completed"] for p in progress) if progress else 0

        return {
            "items": progress[:20],
            "overall_percent": round(total_completed / total_planned * 100, 1) if total_planned else 0,
        }

    async def _get_finance(self, estimate_id: int) -> Dict:
        result = await self.db.execute(
            select(ProjectFinance)
            .where(ProjectFinance.estimate_id == estimate_id)
        )
        finance = result.scalar_one_or_none()
        if not finance:
            return {"status": "no_data"}

        return {
            "total_budget": finance.total_price,
            "labor_cost": finance.labor_cost,
            "material_cost": finance.material_cost,
            "margin": finance.margin,
            "profitability": finance.profitability,
        }

    async def _get_material_usage(self, estimate_id: int) -> Dict:
        result = await self.db.execute(
            select(EstimateItem)
            .where(EstimateItem.estimate_id == estimate_id)
        )
        items = result.scalars().all()
        item_ids = [i.id for i in items]

        if not item_ids:
            return {"status": "no_data"}

        usage_result = await self.db.execute(
            select(MaterialUsage)
            .where(MaterialUsage.estimate_item_id.in_(item_ids))
        )
        usages = usage_result.scalars().all()

        total_cost = sum(u.total or 0 for u in usages)
        return {
            "total_materials": len(usages),
            "total_cost": round(total_cost, 2),
        }
