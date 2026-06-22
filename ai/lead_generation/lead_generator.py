"""
LeadGenerationAI — основной модуль поиска клиентов.
"""
import asyncio
import logging
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from config import config
from ai.lead_generation.parsers.avito_parser import AvitoParser
from ai.lead_generation.parsers.profi_parser import ProfiParser
from ai.lead_generation.parsers.youdo_parser import YouDoParser
from ai.lead_generation.parsers.vk_parser import VKParser
from ai.lead_generation.parsers.telegram_parser import TelegramParser
from ai.lead_generation.lead_processor import LeadProcessor

logger = logging.getLogger(__name__)


class LeadGenerationAI:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.processor = LeadProcessor(db)
        self.parsers = [
            AvitoParser(config.leads.avito_api_key),
            ProfiParser(config.leads.profi_api_key),
            YouDoParser(config.leads.youdo_api_key),
            VKParser(config.leads.vk_token),
            TelegramParser(config.leads.telegram_bot_token),
        ]

    async def scan_all_sources(self) -> list[dict]:
        """Сканировать все источники лидов."""
        all_leads = []

        for parser in self.parsers:
            try:
                leads = await parser.fetch_leads()
                logger.info(
                    "Получено %d лидов из %s",
                    len(leads), parser.source_name,
                )
                all_leads.extend(leads)
            except Exception:
                logger.exception(
                    "Ошибка получения лидов из %s",
                    parser.source_name,
                )

        # Обрабатываем лиды
        processed = []
        for lead in all_leads:
            result = await self.processor.process_lead(lead)
            processed.append(result)

        return processed

    async def start_periodic_scan(self) -> None:
        """Периодическое сканирование."""
        interval = config.leads.scan_interval_minutes * 60
        while True:
            try:
                results = await self.scan_all_sources()
                logger.info(
                    "Периодическое сканирование: обработано %d лидов",
                    len(results),
                )
            except Exception:
                logger.exception("Ошибка периодического сканирования")
            await asyncio.sleep(interval)
