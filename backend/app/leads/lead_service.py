"""
Сервис управления лидами
"""

from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.leads.base_parser import Lead
from app.leads.avito_parser import AvitoParser
from app.leads.profi_parser import ProfiParser
from app.leads.youdo_parser import YouDoParser
from app.models.client import Client
from app.services.audit_service import AuditService


class LeadService:
    """Управление лидами: поиск, анализ, конвертация в клиентов"""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.parsers = {
            "avito": AvitoParser(),
            "profi": ProfiParser(),
            "youdo": YouDoParser(),
        }

    async def search_leads(
        self,
        query: str = "ремонт квартиры",
        sources: Optional[List[str]] = None,
        location: str = "москва",
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        """Поиск лидов на площадках"""
        if not sources:
            sources = list(self.parsers.keys())

        all_leads = []
        for source in sources:
            parser = self.parsers.get(source)
            if not parser:
                continue

            try:
                leads = await parser.search(query, location, limit)
                all_leads.extend([lead.to_dict() for lead in leads])
            except Exception as e:
                all_leads.append({
                    "source": source,
                    "error": str(e),
                })

        return all_leads

    async def convert_lead_to_client(
        self,
        lead_data: Dict[str, Any],
        analyzed: Optional[Dict] = None,
    ) -> Client:
        """Конвертировать лид в клиента"""
        client = Client(
            name=lead_data.get("contact", lead_data.get("title", "Новый клиент")),
            lead_source=lead_data.get("source", "unknown"),
            notes=f"Заявка: {lead_data.get('title', '')}\n"
                  f"Описание: {lead_data.get('description', '')}\n"
                  f"URL: {lead_data.get('url', '')}\n"
                  f"Бюджет: {lead_data.get('price', 'не указан')}",
        )

        if analyzed:
            client.notes += f"\nАнализ AI: {analyzed}"

        self.db.add(client)
        await self.db.flush()

        audit = AuditService(self.db)
        await audit.log_create("client", client.id, {"source": "lead", "lead": lead_data})

        return client

    def available_sources(self) -> List[Dict[str, str]]:
        """Доступные источники лидов"""
        return [
            {"id": "avito", "name": "Avito", "url": "https://avito.ru"},
            {"id": "profi", "name": "Profi.ru", "url": "https://profi.ru"},
            {"id": "youdo", "name": "YouDo", "url": "https://youdo.com"},
        ]
