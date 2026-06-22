"""
AI-агент валидации смет — проверка через LLM
"""

from typing import Dict, Any
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.ai.base_agent import BaseAgent
from app.ai.prompts import ESTIMATE_VALIDATOR_PROMPT
from app.models.estimate import Estimate, EstimateItem


class EstimateValidatorAgent(BaseAgent):
    name = "EstimateValidator"
    description = "AI-проверка сметы на ошибки и несоответствия"
    system_prompt = ESTIMATE_VALIDATOR_PROMPT

    async def _process(self, task: Dict[str, Any]) -> Dict[str, Any]:
        estimate_id = task.get("estimate_id")
        if not estimate_id:
            return {"validation": {"error": "Не указан ID сметы"}}

        result = await self.db.execute(
            select(Estimate)
            .options(selectinload(Estimate.items), selectinload(Estimate.sections))
            .where(Estimate.id == estimate_id)
        )
        estimate = result.scalar_one_or_none()
        if not estimate:
            return {"validation": {"error": "Смета не найдена"}}

        # Подготавливаем данные для LLM
        items_data = []
        for item in estimate.items:
            if item.row_type in ('comment', 'spr', 'empt'):
                continue
            items_data.append({
                "name": item.name,
                "unit": item.unit,
                "quantity": item.quantity,
                "labor_price": item.labor_price,
                "materials_price": item.materials_price,
                "total": item.total,
                "row_type": item.row_type,
            })

        estimate_data = {
            "name": estimate.name,
            "type": str(estimate.estimate_type),
            "overhead_percent": estimate.overhead_percent,
            "profit_percent": estimate.profit_percent,
            "total_cost": estimate.total_cost,
            "total_with_vat": estimate.total_with_vat,
            "items_count": len(items_data),
        }

        prompt = f"""Проверь смету на ошибки:

Смета: {estimate_data}

Позиции (первые 30):
{items_data[:30]}

Проверь полноту, корректность цен, объёмов, накладных."""

        validation = await self.ask_llm_json(prompt)
        return {"validation": validation}
