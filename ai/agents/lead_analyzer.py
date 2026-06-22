"""
LeadAnalyzerAgent — анализ входящего лида и автоматическое создание
проекта + сметы + КП.
"""
import uuid
import logging

from sqlalchemy.ext.asyncio import AsyncSession

from ai.agents.base_agent import BaseAgent
from models import Client, Project, ProjectStatus

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """
Ты — менеджер по продажам строительной компании.
Проанализируй заявку клиента и извлеки:
1. ФИО/Имя клиента
2. Контакты (телефон, email)
3. Тип объекта
4. Площадь
5. Тип ремонта
6. Адрес
7. Бюджет (если указан)
8. Срочность
9. Дополнительные пожелания

JSON:
{
    "client_name": "...",
    "phone": "...",
    "email": "...",
    "object_type": "квартира",
    "area": 65.0,
    "repair_type": "капитальный",
    "address": "...",
    "city": "Москва",
    "budget": 0,
    "urgency": "средняя",
    "requirements": "...",
    "estimated_price": 0,
    "lead_quality": "hot",
    "confidence": 0.9
}
"""


class LeadAnalyzerAgent(BaseAgent):

    async def analyze(self, lead_data: dict) -> dict:
        source = lead_data.get("source", "unknown")
        text = lead_data.get("text", "")
        phone = lead_data.get("phone", "")
        name = lead_data.get("name", "")

        prompt = f"""
Источник: {source}
Имя: {name}
Телефон: {phone}
Текст заявки: {text}
"""

        analysis = await self._call_llm(SYSTEM_PROMPT, prompt)

        # Создаём клиента и проект
        if analysis.get("lead_quality") in ("hot", "warm"):
            client = await self._create_client(analysis)
            project = await self._create_project(analysis, client.id)

            analysis["client_id"] = str(client.id)
            analysis["project_id"] = str(project.id)
            analysis["auto_created"] = True

            logger.info(
                "LeadAnalyzer: создан клиент %s, проект %s из %s",
                client.name, project.name, source,
            )

        return analysis

    async def _create_client(self, analysis: dict) -> Client:
        client = Client(
            name=analysis.get("client_name", "Новый клиент"),
            phone=analysis.get("phone"),
            email=analysis.get("email"),
            source=analysis.get("source", "ai_lead"),
        )
        self.db.add(client)
        await self.db.flush()
        return client

    async def _create_project(
        self, analysis: dict, client_id: uuid.UUID,
    ) -> Project:
        project = Project(
            name=f"{analysis.get('repair_type', 'Ремонт')} — "
                 f"{analysis.get('object_type', 'объект')} "
                 f"{analysis.get('area', '')} м²",
            client_id=client_id,
            address=analysis.get("address"),
            city=analysis.get("city"),
            area=analysis.get("area", 0),
            object_type=analysis.get("object_type"),
            repair_type=analysis.get("repair_type"),
            status=ProjectStatus.ESTIMATION,
        )
        self.db.add(project)
        await self.db.flush()
        return project
