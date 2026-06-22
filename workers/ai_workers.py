"""
AI-воркеры, обрабатывающие задачи из очереди.
"""
import uuid
import logging

from database import async_session
from ai.orchestrator import AIOrchestrator

logger = logging.getLogger(__name__)


async def handle_estimate_generation(data: dict) -> None:
    """Обработчик задачи генерации сметы."""
    project_id = uuid.UUID(data["project_id"])
    description = data.get("description", "")
    area = data.get("area", 0)
    repair_type = data.get("repair_type", "стандартный")

    async with async_session() as db:
        orch = AIOrchestrator(db)
        ctx = await orch.generate_estimate_from_description(
            project_id=project_id,
            description=description,
            area=area,
            repair_type=repair_type,
        )
        await db.commit()
        logger.info(
            "Worker: сгенерирована смета %s для проекта %s",
            ctx.estimate_id, project_id,
        )


async def handle_document_generation(data: dict) -> None:
    """Обработчик задачи генерации документов."""
    estimate_id = uuid.UUID(data["estimate_id"])

    async with async_session() as db:
        from services.document_generator import DocumentGeneratorService
        svc = DocumentGeneratorService(db)
        docs = await svc.generate_all(estimate_id)
        await db.commit()
        logger.info("Worker: сгенерировано %d документов", len(docs))


async def handle_lead_scan(data: dict) -> None:
    """Обработчик задачи сканирования лидов."""
    async with async_session() as db:
        from ai.lead_generation import LeadGenerationAI
        gen = LeadGenerationAI(db)
        results = await gen.scan_all_sources()
        await db.commit()
        logger.info("Worker: обработано %d лидов", len(results))


# Реестр обработчиков
TASK_HANDLERS = {
    "estimate_generation": handle_estimate_generation,
    "document_generation": handle_document_generation,
    "lead_scan": handle_lead_scan,
}
