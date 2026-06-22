"""
AI-агент оптимизации прибыли
"""

from typing import Dict, Any
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.ai.base_agent import BaseAgent
from app.ai.prompts import PROFIT_OPTIMIZER_PROMPT
from app.models.estimate import Estimate


class ProfitOptimizerAgent(BaseAgent):
    name = "ProfitOptimizer"
    description = "AI-оптимизация маржинальности и прибыли"
    system_prompt = PROFIT_OPTIMIZER_PROMPT

    async def _process(self, task: Dict[str, Any]) -> Dict[str, Any]:
        estimate_id = task.get("estimate_id")
        if not estimate_id:
            return {"optimization": {"error": "Не указан ID сметы"}}

        result = await self.db.execute(
            select(Estimate)
            .options(selectinload(Estimate.items))
            .where(Estimate.id == estimate_id)
        )
        estimate = result.scalar_one_or_none()
        if not estimate:
            return {"optimization": {"error": "Смета не найдена"}}

        items_summary = []
        for item in estimate.items[:50]:
            if item.row_type in ('comment', 'spr', 'empt', 'irazd'):
                continue
            items_summary.append({
                "name": item.name,
                "labor": item.labor_price,
                "materials": item.materials_price,
                "quantity": item.quantity,
                "total": item.total,
            })

        prompt = f"""Проанализируй смету и найди возможности оптимизации прибыли:

Смета: {estimate.name}
Итого: {estimate.total_with_vat} руб.
Накладные: {estimate.overhead_percent}%
Прибыль: {estimate.profit_percent}%
Текущая маржа: {(estimate.overhead_cost or 0) + (estimate.profit_cost or 0)} руб.

Позиции (топ-50):
{items_summary}

Предложи конкретные способы увеличения прибыли."""

        optimization = await self.ask_llm_json(prompt)
        return {"optimization": optimization}
