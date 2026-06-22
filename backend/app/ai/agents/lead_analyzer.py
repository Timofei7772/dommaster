"""
Агент анализа лидов — обработка заявок с площадок
"""

from typing import Dict, Any
from app.ai.base_agent import BaseAgent
from app.ai.prompts import LEAD_ANALYZER_PROMPT


class LeadAnalyzerAgent(BaseAgent):
    name = "LeadAnalyzer"
    description = "Анализ заявок клиентов с площадок (Avito, Profi.ru, YouDo)"
    system_prompt = LEAD_ANALYZER_PROMPT

    async def _process(self, task: Dict[str, Any]) -> Dict[str, Any]:
        lead_text = task.get("lead_text", "")
        source = task.get("source", "unknown")

        if not lead_text:
            return {"lead_analysis": {"error": "Нет текста заявки"}}

        prompt = f"""Проанализируй заявку клиента с площадки {source}:

"{lead_text}"

Определи тип объекта, площадь, тип ремонта, бюджет, срочность и потенциальную стоимость."""

        analysis = await self.ask_llm_json(prompt)

        return {
            "lead_analysis": analysis,
            "source": source,
            # Передаём для ObjectAnalyzer (если в цепочке)
            "description": lead_text,
            "object_type": analysis.get("object_type", ""),
            "area": analysis.get("estimated_area", 0),
        }
