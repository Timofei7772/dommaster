"""
Парсер Avito для поиска заявок на ремонт.
"""
import logging
from typing import Optional

import aiohttp

logger = logging.getLogger(__name__)


class AvitoParser:
    source_name = "avito"

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.avito.ru/messenger/v3"

    async def fetch_leads(self) -> list[dict]:
        """
        Получение входящих сообщений / заявок из Avito.
        В реальности — через Avito API для бизнеса.
        """
        if not self.api_key:
            return []

        leads = []
        try:
            async with aiohttp.ClientSession() as session:
                headers = {"Authorization": f"Bearer {self.api_key}"}
                async with session.get(
                    f"{self.base_url}/chats",
                    headers=headers,
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        for chat in data.get("chats", []):
                            leads.append({
                                "source": self.source_name,
                                "text": chat.get("last_message", {}).get("text", ""),
                                "name": chat.get("user", {}).get("name", ""),
                                "phone": "",
                                "external_id": chat.get("id", ""),
                            })
        except Exception:
            logger.exception("Ошибка Avito API")

        return leads
