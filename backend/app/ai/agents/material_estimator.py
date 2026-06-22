"""
Агент расчёта материалов — определяет потребность в материалах
"""

from typing import Dict, Any
from sqlalchemy import select

from app.ai.base_agent import BaseAgent
from app.ai.prompts import MATERIAL_ESTIMATOR_PROMPT
from app.models.erp_models import WorkMaterial
from app.models.material import Material


class MaterialEstimatorAgent(BaseAgent):
    name = "MaterialEstimator"
    description = "Расчёт потребности в материалах по нормам и AI"
    system_prompt = MATERIAL_ESTIMATOR_PROMPT

    async def _process(self, task: Dict[str, Any]) -> Dict[str, Any]:
        generated_works = task.get("generated_works", {})
        matched_works = task.get("matched_works", [])
        volume_calculations = task.get("volume_calculations", {})

        # Собираем материалы из базы (по work_materials)
        db_materials = []
        for match in matched_works:
            db_match = match.get("db_match")
            if db_match and db_match.get("id"):
                result = await self.db.execute(
                    select(WorkMaterial)
                    .where(WorkMaterial.work_id == db_match["id"])
                )
                wm_list = result.scalars().all()
                for wm in wm_list:
                    mat_result = await self.db.execute(
                        select(Material).where(Material.id == wm.material_id)
                    )
                    mat = mat_result.scalar_one_or_none()
                    if mat:
                        db_materials.append({
                            "work": db_match["name"],
                            "material": mat.name,
                            "unit": wm.unit or mat.unit,
                            "consumption_rate": wm.consumption_rate,
                            "price": mat.current_price or mat.base_price,
                        })

        # LLM дополняет расчёт
        prompt = f"""Рассчитай полную потребность в материалах:

Работы: {generated_works}
Объёмы: {volume_calculations}
Известные нормы из базы: {db_materials[:20]}

Добавь недостающие материалы и учти запас на отходы."""

        materials = await self.ask_llm_json(prompt)

        return {
            "db_materials": db_materials,
            "calculated_materials": materials,
        }
