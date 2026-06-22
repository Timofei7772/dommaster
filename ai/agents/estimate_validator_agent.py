"""
EstimateValidatorAgent — AI-валидация сметы на адекватность цен и объёмов.
"""
import uuid
import logging

from sqlalchemy import select

from ai.agents.base_agent import BaseAgent
from models import Estimate, EstimateItem, EstimateSection

logger = logging.getLogger(__name__)


class EstimateValidatorAgent(BaseAgent):

    async def validate(self, estimate_id: uuid.UUID) -> dict:
        est_result = await self.db.execute(
            select(Estimate).where(Estimate.id == estimate_id)
        )
        estimate = est_result.scalar_one_or_none()
        if not estimate:
            return {"valid": False, "errors": ["Смета не найдена"]}

        items_result = await self.db.execute(
            select(EstimateItem).where(EstimateItem.estimate_id == estimate_id)
        )
        items = list(items_result.scalars().all())

        # Формируем данные для AI-проверки
        items_text = "\n".join(
            f"- {i.name}: {i.quantity} {i.unit} × "
            f"(работа {i.price_work} + мат. {i.price_material}) = {i.total_cost}"
            for i in items
        )

        prompt = f"""
Проверь смету на адекватность:
Итого: {estimate.final_price} руб.

Позиции:
{items_text}

Проверь:
1. Адекватность цен (не завышены/занижены ли)
2. Полноту работ (нет ли пропущенных обязательных работ)
3. Правильность объёмов
4. Правильность единиц измерения

Ответ JSON:
{{
    "valid": true,
    "score": 0.95,
    "issues": [
        {{
            "type": "price_warning",
            "item": "...",
            "message": "...",
            "severity": "warning"
        }}
    ],
    "missing_works": [],
    "recommendations": []
}}
"""
        result = await self._call_llm(
            "Ты — эксперт-сметчик, проверяющий строительные сметы.",
            prompt,
            model="gpt-4o-mini",
        )

        logger.info(
            "EstimateValidator: score=%.2f, issues=%d",
            result.get("score", 0),
            len(result.get("issues", [])),
        )
        return result
