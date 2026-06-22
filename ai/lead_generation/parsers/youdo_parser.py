"""
Парсер YouDo для поиска задач на ремонт.
"""
import logging
import aiohttp

logger = logging.getLogger(__name__)


class YouDoParser:
    source_name = "youdo"

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
                    "https://youdo.com/api/v2/tasks",
                    headers=headers,
                    params={"category_id": "remont"},
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        for task in data.get("tasks", []):
                            leads.append({
                                "source": self.source_name,
                                "text": task.get("description", ""),
                                "name": task.get("name", ""),
                                "phone": "",
                                "external_id": str(task.get("id", "")),
                            })
        except Exception:
            logger.exception("Ошибка YouDo API")

        return leads
