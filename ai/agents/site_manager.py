"""
AISiteManagerAgent — AI-прораб: контроль сроков, расхода, бюджета.
"""
import uuid
import logging
from datetime import datetime

from sqlalchemy import select

from ai.agents.base_agent import BaseAgent
from models import (
    Estimate, EstimateItem, WorkProgress, MaterialUsage, ProjectFinance,
)
from services.work_progress_service import WorkProgressService

logger = logging.getLogger(__name__)


class AISiteManagerAgent(BaseAgent):

    async def analyze(self, estimate_id: uuid.UUID) -> dict:
        progress_svc = WorkProgressService(self.db)
        progress = await progress_svc.get_project_progress(estimate_id)

        items_result = await self.db.execute(
            select(EstimateItem).where(EstimateItem.estimate_id == estimate_id)
        )
        items = list(items_result.scalars().all())

        # Анализ перерасхода материалов
        overuse_items = []
        for item in items:
            mu_result = await self.db.execute(
                select(MaterialUsage).where(
                    MaterialUsage.estimate_item_id == item.id
                )
            )
            for mu in mu_result.scalars().all():
                if mu.actual_quantity > mu.quantity:
                    overuse = mu.actual_quantity - mu.quantity
                    overuse_items.append({
                        "item": item.name,
                        "material_id": str(mu.material_id),
                        "planned": mu.quantity,
                        "actual": mu.actual_quantity,
                        "overuse": round(overuse, 3),
                        "overuse_cost": round(overuse * mu.price, 2),
                    })

        # Отстающие работы
        behind_schedule = []
        for item in items:
            wp_result = await self.db.execute(
                select(WorkProgress).where(
                    WorkProgress.estimate_item_id == item.id
                )
            )
            wp = wp_result.scalar_one_or_none()
            if wp and wp.planned_end and wp.planned_end < datetime.now():
                if wp.percent_complete < 100:
                    behind_schedule.append({
                        "item": item.name,
                        "percent_complete": wp.percent_complete,
                        "planned_end": wp.planned_end.isoformat(),
                        "days_overdue": (datetime.now() - wp.planned_end).days,
                    })

        # AI-анализ
        analysis_prompt = f"""
Прогресс проекта: {progress}
Перерасход материалов: {overuse_items}
Отстающие работы: {behind_schedule}

Дай рекомендации как прораб:
1. Приоритетные действия
2. Риски
3. Предложения по оптимизации

JSON:
{{
    "status": "на контроле",
    "priority_actions": [],
    "risks": [],
    "optimization_suggestions": [],
    "overall_assessment": ""
}}
"""
        ai_analysis = await self._call_llm(
            "Ты — AI-прораб на строительном объекте.",
            analysis_prompt,
            model="gpt-4o-mini",
        )

        return {
            "progress": progress,
            "material_overuse": overuse_items,
            "behind_schedule": behind_schedule,
            "ai_analysis": ai_analysis,
        }
