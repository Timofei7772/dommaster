"""
MaterialEstimatorAgent — расчёт материалов с учётом норм расхода и отходов.
"""
import uuid
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ai.agents.base_agent import BaseAgent
from models import Work, WorkMaterial, Material

logger = logging.getLogger(__name__)


class MaterialEstimatorAgent(BaseAgent):

    async def estimate(self, works: list[dict]) -> list[dict]:
        """
        Для каждой работы определить материалы и их расход.
        """
        all_materials = []

        for work in works:
            work_id = work.get("work_id")
            quantity = work.get("quantity", 0)

            if work_id and quantity > 0:
                materials = await self._get_materials_by_norm(work_id, quantity)
                all_materials.extend(materials)
            elif quantity > 0:
                # AI-расчёт, если нет в справочнике
                materials = await self._ai_estimate_materials(work, quantity)
                all_materials.extend(materials)

        logger.info(
            "MaterialEstimator: рассчитано %d позиций материалов",
            len(all_materials),
        )
        return all_materials

    async def _get_materials_by_norm(
        self, work_id: str, quantity: float,
    ) -> list[dict]:
        """Расчёт по нормам из таблицы work_materials."""
        wm_result = await self.db.execute(
            select(WorkMaterial).where(
                WorkMaterial.work_id == uuid.UUID(work_id)
            )
        )
        work_materials = list(wm_result.scalars().all())
        materials = []

        for wm in work_materials:
            mat_result = await self.db.execute(
                select(Material).where(Material.id == wm.material_id)
            )
            mat = mat_result.scalar_one_or_none()
            if not mat:
                continue

            raw_qty = quantity * wm.consumption_rate
            waste_mult = 1 + mat.waste_percent / 100
            final_qty = round(raw_qty * waste_mult, 3)

            materials.append({
                "material_id": str(mat.id),
                "name": mat.name,
                "unit": mat.unit,
                "quantity": final_qty,
                "price": mat.base_price,
                "total": round(final_qty * mat.base_price, 2),
                "work_id": work_id,
            })

        return materials

    async def _ai_estimate_materials(
        self, work: dict, quantity: float,
    ) -> list[dict]:
        """AI-расчёт материалов, если нет в справочнике."""
        prompt = f"""
Рассчитай материалы для работы:
Название: {work.get('name', '')}
Единица: {work.get('unit', 'м²')}
Объём: {quantity}

Верни JSON:
{{
    "materials": [
        {{
            "name": "Название материала",
            "unit": "шт",
            "quantity": 10.0,
            "price": 150.0,
            "total": 1500.0
        }}
    ]
}}
"""
        result = await self._call_llm(
            "Ты — эксперт по строительным материалам.",
            prompt,
            model="gpt-4o-mini",
        )
        materials = result.get("materials", [])
        for m in materials:
            m["work_name"] = work.get("name", "")
        return materials
