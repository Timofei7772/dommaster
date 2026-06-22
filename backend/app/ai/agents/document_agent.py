"""
AI-агент генерации документов — подготовка данных для документов
"""

from typing import Dict, Any
from app.ai.base_agent import BaseAgent
from app.ai.prompts import DOCUMENT_AGENT_PROMPT


class DocumentAgent(BaseAgent):
    name = "DocumentAgent"
    description = "AI-подготовка данных для генерации документов"
    system_prompt = DOCUMENT_AGENT_PROMPT

    async def _process(self, task: Dict[str, Any]) -> Dict[str, Any]:
        doc_type = task.get("document_type", "kp")
        estimate_data = task.get("estimate_data", {})
        client_data = task.get("client_data", {})

        prompt = f"""Подготовь данные для документа типа: {doc_type}

Данные сметы: {estimate_data}
Данные клиента: {client_data}

Сформируй все необходимые поля для заполнения шаблона документа."""

        doc_data = await self.ask_llm_json(prompt)
        return {"document_data": doc_data}
