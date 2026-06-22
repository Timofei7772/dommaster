"""
Центральный оркестратор AI-агентов.
Управляет очерёдностью, передачей данных между агентами.
"""
import uuid
import logging
from typing import Optional, Any
from dataclasses import dataclass, field

from sqlalchemy.ext.asyncio import AsyncSession

from config import config
from ai.agents.object_analyzer import ObjectAnalyzerAgent
from ai.agents.design_analyzer import DesignAnalyzerAgent
from ai.agents.work_generator import WorkGeneratorAgent
from ai.agents.volume_estimator import VolumeEstimatorAgent
from ai.agents.material_estimator import MaterialEstimatorAgent
from ai.agents.finance_agent import FinanceAgent
from ai.agents.estimate_validator_agent import EstimateValidatorAgent
from ai.agents.document_agent import DocumentAgent
from ai.agents.site_manager import AISiteManagerAgent
from ai.agents.profit_optimizer import ProfitOptimizerAgent
from ai.agents.lead_analyzer import LeadAnalyzerAgent
from ai.agents.learning_agent import LearningAgent

logger = logging.getLogger(__name__)


@dataclass
class PipelineContext:
    """Контекст, передаваемый между агентами в пайплайне."""
    project_id: Optional[uuid.UUID] = None
    estimate_id: Optional[uuid.UUID] = None
    raw_input: dict = field(default_factory=dict)
    object_analysis: dict = field(default_factory=dict)
    design_analysis: dict = field(default_factory=dict)
    rooms: list[dict] = field(default_factory=list)
    works: list[dict] = field(default_factory=list)
    volumes: dict = field(default_factory=dict)
    materials: list[dict] = field(default_factory=list)
    finance: dict = field(default_factory=dict)
    validation: dict = field(default_factory=dict)
    documents: list[dict] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    stage: str = "init"


class AIOrchestrator:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.object_analyzer = ObjectAnalyzerAgent(db)
        self.design_analyzer = DesignAnalyzerAgent(db)
        self.work_generator = WorkGeneratorAgent(db)
        self.volume_estimator = VolumeEstimatorAgent(db)
        self.material_estimator = MaterialEstimatorAgent(db)
        self.finance_agent = FinanceAgent(db)
        self.validator_agent = EstimateValidatorAgent(db)
        self.document_agent = DocumentAgent(db)
        self.site_manager = AISiteManagerAgent(db)
        self.profit_optimizer = ProfitOptimizerAgent(db)
        self.lead_analyzer = LeadAnalyzerAgent(db)
        self.learning_agent = LearningAgent(db)

    # ------------------------------------------------------------------ #
    #  Полный пайплайн: входные данные → готовая смета                     #
    # ------------------------------------------------------------------ #
    async def generate_estimate_from_description(
        self,
        project_id: uuid.UUID,
        *,
        description: str = "",
        photos: list[bytes] | None = None,
        area: float = 0,
        rooms: list[dict] | None = None,
        repair_type: str = "стандартный",
    ) -> PipelineContext:
        ctx = PipelineContext(
            project_id=project_id,
            raw_input={
                "description": description,
                "area": area,
                "rooms": rooms or [],
                "repair_type": repair_type,
            },
        )

        pipeline = [
            ("object_analysis", self._step_analyze_object),
            ("work_generation", self._step_generate_works),
            ("volume_estimation", self._step_estimate_volumes),
            ("material_estimation", self._step_estimate_materials),
            ("finance_calculation", self._step_calculate_finance),
            ("estimate_creation", self._step_create_estimate),
            ("validation", self._step_validate),
            ("document_generation", self._step_generate_documents),
            ("learning", self._step_learn),
        ]

        for stage_name, step_func in pipeline:
            ctx.stage = stage_name
            logger.info("Пайплайн: стадия %s", stage_name)
            try:
                ctx = await step_func(ctx, photos)
            except Exception as e:
                ctx.errors.append(f"[{stage_name}] {str(e)}")
                logger.exception("Ошибка на стадии %s", stage_name)
                # Продолжаем пайплайн, если ошибка не критичная
                if stage_name in ("estimate_creation",):
                    break

        return ctx

    # ------------------------------------------------------------------ #
    #  Полный пайплайн: дизайн-проект → смета                             #
    # ------------------------------------------------------------------ #
    async def generate_estimate_from_design(
        self,
        project_id: uuid.UUID,
        file_path: str,
        file_type: str = "pdf",
    ) -> PipelineContext:
        ctx = PipelineContext(
            project_id=project_id,
            raw_input={
                "file_path": file_path,
                "file_type": file_type,
            },
        )

        pipeline = [
            ("design_analysis", self._step_analyze_design),
            ("work_generation", self._step_generate_works),
            ("volume_estimation", self._step_estimate_volumes),
            ("material_estimation", self._step_estimate_materials),
            ("finance_calculation", self._step_calculate_finance),
            ("estimate_creation", self._step_create_estimate),
            ("validation", self._step_validate),
            ("document_generation", self._step_generate_documents),
        ]

        for stage_name, step_func in pipeline:
            ctx.stage = stage_name
            logger.info("Пайплайн дизайн-проекта: стадия %s", stage_name)
            try:
                ctx = await step_func(ctx, None)
            except Exception as e:
                ctx.errors.append(f"[{stage_name}] {str(e)}")
                logger.exception("Ошибка на стадии %s", stage_name)
                if stage_name in ("design_analysis", "estimate_creation"):
                    break

        return ctx

    # ------------------------------------------------------------------ #
    #  Шаги пайплайна                                                     #
    # ------------------------------------------------------------------ #
    async def _step_analyze_object(
        self, ctx: PipelineContext, photos: list[bytes] | None,
    ) -> PipelineContext:
        result = await self.object_analyzer.analyze(
            description=ctx.raw_input.get("description", ""),
            photos=photos,
            area=ctx.raw_input.get("area", 0),
            repair_type=ctx.raw_input.get("repair_type", ""),
        )
        ctx.object_analysis = result
        ctx.rooms = result.get("rooms", ctx.raw_input.get("rooms", []))
        return ctx

    async def _step_analyze_design(
        self, ctx: PipelineContext, _photos: Any,
    ) -> PipelineContext:
        result = await self.design_analyzer.analyze(
            file_path=ctx.raw_input.get("file_path", ""),
            file_type=ctx.raw_input.get("file_type", "pdf"),
        )
        ctx.design_analysis = result
        ctx.rooms = result.get("rooms", [])
        return ctx

    async def _step_generate_works(
        self, ctx: PipelineContext, _photos: Any,
    ) -> PipelineContext:
        result = await self.work_generator.generate(
            rooms=ctx.rooms,
            repair_type=ctx.raw_input.get("repair_type", "стандартный"),
            object_analysis=ctx.object_analysis,
            design_analysis=ctx.design_analysis,
        )
        ctx.works = result
        return ctx

    async def _step_estimate_volumes(
        self, ctx: PipelineContext, _photos: Any,
    ) -> PipelineContext:
        result = await self.volume_estimator.estimate(
            rooms=ctx.rooms,
            works=ctx.works,
        )
        ctx.volumes = result
        # Обогащаем works объёмами
        for work in ctx.works:
            room_name = work.get("room", "")
            if room_name in ctx.volumes:
                room_vols = ctx.volumes[room_name]
                unit = work.get("unit", "м²")
                if unit == "м²" and "floor_area" in room_vols:
                    work["quantity"] = room_vols["floor_area"]
                elif unit == "м.п." and "perimeter" in room_vols:
                    work["quantity"] = room_vols["perimeter"]
                elif unit == "м²" and "wall_area" in room_vols:
                    work["quantity"] = room_vols["wall_area"]
        return ctx

    async def _step_estimate_materials(
        self, ctx: PipelineContext, _photos: Any,
    ) -> PipelineContext:
        result = await self.material_estimator.estimate(works=ctx.works)
        ctx.materials = result
        return ctx

    async def _step_calculate_finance(
        self, ctx: PipelineContext, _photos: Any,
    ) -> PipelineContext:
        result = await self.finance_agent.calculate(
            works=ctx.works,
            materials=ctx.materials,
        )
        ctx.finance = result
        return ctx

    async def _step_create_estimate(
        self, ctx: PipelineContext, _photos: Any,
    ) -> PipelineContext:
        from services.estimate_service import EstimateService

        svc = EstimateService(self.db)
        estimate = await svc.create_estimate(
            project_id=ctx.project_id,
            name=f"AI-смета {ctx.raw_input.get('repair_type', '')}",
        )
        estimate.ai_generated = True
        ctx.estimate_id = estimate.id

        # Группируем работы по разделам
        sections_map: dict[str, list[dict]] = {}
        for work in ctx.works:
            section_name = work.get("section", work.get("category", "Общие работы"))
            if section_name not in sections_map:
                sections_map[section_name] = []
            sections_map[section_name].append(work)

        items_data = [
            {
                "section": section_name,
                "items": [
                    {
                        "name": w["name"],
                        "unit": w.get("unit", "м²"),
                        "quantity": w.get("quantity", 0),
                        "price_work": w.get("price_work", 0),
                        "price_material": w.get("price_material", 0),
                        "work_id": w.get("work_id"),
                    }
                    for w in works_list
                ],
            }
            for section_name, works_list in sections_map.items()
        ]

        await svc.bulk_add_items(estimate.id, items_data)
        await self.db.flush()
        return ctx

    async def _step_validate(
        self, ctx: PipelineContext, _photos: Any,
    ) -> PipelineContext:
        if ctx.estimate_id:
            result = await self.validator_agent.validate(ctx.estimate_id)
            ctx.validation = result
        return ctx

    async def _step_generate_documents(
        self, ctx: PipelineContext, _photos: Any,
    ) -> PipelineContext:
        if ctx.estimate_id:
            result = await self.document_agent.generate(ctx.estimate_id)
            ctx.documents = result
        return ctx

    async def _step_learn(
        self, ctx: PipelineContext, _photos: Any,
    ) -> PipelineContext:
        await self.learning_agent.record_generation(ctx)
        return ctx

    # ------------------------------------------------------------------ #
    #  Отдельные операции                                                 #
    # ------------------------------------------------------------------ #
    async def analyze_site_progress(self, estimate_id: uuid.UUID) -> dict:
        return await self.site_manager.analyze(estimate_id)

    async def optimize_profit(self, estimate_id: uuid.UUID) -> dict:
        return await self.profit_optimizer.optimize(estimate_id)

    async def analyze_lead(self, lead_data: dict) -> dict:
        return await self.lead_analyzer.analyze(lead_data)
