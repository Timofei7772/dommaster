"""
Обработка сырых лидов: анализ → создание клиента/проекта → генерация КП.
"""
import logging

from sqlalchemy.ext.asyncio import AsyncSession

from ai.agents.lead_analyzer import LeadAnalyzerAgent
from ai.orchestrator import AIOrchestrator

logger = logging.getLogger(__name__)


class LeadProcessor:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.analyzer = LeadAnalyzerAgent(db)
        self.orchestrator = AIOrchestrator(db)

    async def process_lead(self, lead_data: dict) -> dict:
        # 1. Анализируем лид
        analysis = await self.analyzer.analyze(lead_data)

        # 2. Если горячий лид — генерируем смету и КП
        if analysis.get("auto_created") and analysis.get("project_id"):
            try:
                import uuid
                project_id = uuid.UUID(analysis["project_id"])
                ctx = await self.orchestrator.generate_estimate_from_description(
                    project_id=project_id,
                    description=lead_data.get("text", ""),
                    area=analysis.get("area", 0),
                    repair_type=analysis.get("repair_type", "стандартный"),
                )
                analysis["estimate_generated"] = True
                analysis["estimate_id"] = str(ctx.estimate_id) if ctx.estimate_id else None
                analysis["documents"] = ctx.documents
            except Exception:
                logger.exception("Ошибка автогенерации сметы для лида")
                analysis["estimate_generated"] = False

        return analysis
