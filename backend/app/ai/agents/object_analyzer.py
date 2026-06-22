"""
Агент анализа объекта — определяет тип, площадь, помещения из фото/текста
"""

from typing import Dict, Any
from app.ai.base_agent import BaseAgent
from app.ai.prompts import OBJECT_ANALYZER_PROMPT


class ObjectAnalyzerAgent(BaseAgent):
    name = "ObjectAnalyzer"
    description = "Анализ объекта по фото/тексту: тип, площадь, помещения"
    system_prompt = OBJECT_ANALYZER_PROMPT

    async def _process(self, task: Dict[str, Any]) -> Dict[str, Any]:
        # Анализ фото
        if "image_data" in task:
            result = await self.llm.vision(
                image_data=task["image_data"],
                prompt="Проанализируй это фото строительного объекта. "
                       "Определи тип помещения, состояние, необходимые работы. "
                       "Ответь в формате JSON.",
            )
            analysis = await self.ask_llm_json(
                f"Преобразуй анализ фото в структурированные данные:\n{result}"
            )
            return {"object_analysis": analysis}

        # Анализ текста
        description = task.get("description", "")
        area = task.get("area", 0)
        object_type = task.get("object_type", "")

        prompt = f"""Проанализируй объект:
Описание: {description}
Тип: {object_type}
Площадь: {area} м²

Определи параметры объекта и список помещений."""

        analysis = await self.ask_llm_json(prompt)
        return {"object_analysis": analysis}
