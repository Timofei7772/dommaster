"""
Парсер Profi.ru для поиска заказов на ремонт.
"""
import logging
import aiohttp

logger = logging.getLogger(__name__)


class ProfiParser:
    source_name = "profi.ru"

    def __init__(self, api_key: str):
        self.api_key = api_key

    async def fetch_leads(self) -> list[dict]:
        if not self.api_key:
            return []

        leads = []
        try:
            async with aiohttp.ClientSession() as session:
                headers = {"Authorization": f"Bearer {self.api_key}"}
                async with session.get(
                    "https://api.profi.ru/v1/orders",
                    headers=headers,
                    params={"category": "remont", "status": "new"},
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        for order in data.get("orders", []):
                            leads.append({
                                "source": self.source_name,
                                "text": order.get("description", ""),
                                "name": order.get("client_name", ""),
                                "phone": order.get("phone", ""),
                                "external_id": order.get("id", ""),
                            })
        except Exception:
            logger.exception("Ошибка Profi.ru API")

        return leads
