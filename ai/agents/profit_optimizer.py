"""
ProfitOptimizerAgent — AI-агент оптимизации прибыли.
"""
import uuid
import logging

from ai.agents.base_agent import BaseAgent
from services.profit_optimization_service import ProfitOptimizationService

logger = logging.getLogger(__name__)


class ProfitOptimizerAgent(BaseAgent):

    async def optimize(self, estimate_id: uuid.UUID) -> dict:
        svc = ProfitOptimizationService(self.db)

        analysis = await svc.analyze_estimate(estimate_id)
        price_suggestion = await svc.suggest_price_increase(estimate_id)
        alternatives = await svc.find_material_alternatives(estimate_id)

        # AI-рекомендации
        prompt = f"""
Анализ сметы: {analysis}
Предложение по цене: {price_suggestion}
Альтернативные материалы: {alternatives[:10]}

Дай конкретные рекомендации по оптимизации прибыли.

JSON:
{{
    "summary": "...",
    "actions": [
        {{
            "action": "...",
            "expected_impact": "...",
            "priority": "high/medium/low"
        }}
    ],
    "estimated_additional_profit": 0.0
}}
"""
        ai_recommendations = await self._call_llm(
            "Ты — финансовый аналитик строительной компании.",
            prompt,
            model="gpt-4o-mini",
        )

        return {
            "analysis": analysis,
            "price_suggestion": price_suggestion,
            "material_alternatives": alternatives[:20],
            "ai_recommendations": ai_recommendations,
        }
