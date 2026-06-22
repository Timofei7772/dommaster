"""
LearningAgent — обучение системы на основе завершённых проектов.
"""
import logging
from typing import TYPE_CHECKING

from ai.agents.base_agent import BaseAgent
from models import AuditLog

if TYPE_CHECKING:
    from ai.orchestrator import PipelineContext

logger = logging.getLogger(__name__)


class LearningAgent(BaseAgent):

    async def record_generation(self, ctx: "PipelineContext") -> None:
        """Сохраняем результат генерации для дальнейшего обучения."""
        log = AuditLog(
            entity_type="ai_generation",
            entity_id=ctx.estimate_id or ctx.project_id,
            action="estimate_generated",
            new_value={
                "rooms_count": len(ctx.rooms),
                "works_count": len(ctx.works),
                "materials_count": len(ctx.materials),
                "finance": ctx.finance,
                "errors": ctx.errors,
                "validation": ctx.validation,
            },
        )
        self.db.add(log)
        await self.db.flush()
        logger.info("LearningAgent: записан результат генерации")

    async def get_generation_stats(self) -> dict:
        """Статистика AI-генераций для дашборда."""
        from sqlalchemy import select, func
        result = await self.db.execute(
            select(func.count(AuditLog.id))
            .where(AuditLog.action == "estimate_generated")
        )
        total = result.scalar() or 0
        return {"total_generations": total}
