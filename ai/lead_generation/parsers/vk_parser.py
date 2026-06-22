"""
Парсер ВКонтакте для получения лидов из сообщений сообщества.
"""
import logging
import aiohttp

logger = logging.getLogger(__name__)


class VKParser:
    source_name = "vk"

    def __init__(self, token: str):
        self.token = token

    async def fetch_leads(self) -> list[dict]:
        if not self.token:
            return []

        leads = []
        try:
            async with aiohttp.ClientSession() as session:
                params = {
                    "access_token": self.token,
                    "v": "5.131",
                    "count": 50,
                }
                # Получаем сообщения сообщества
                async with session.get(
                    "https://api.vk.com/method/messages.getConversations",
                    params=params,
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        for item in data.get("response", {}).get("items", []):
                            msg = item.get("last_message", {})
                            leads.append({
                                "source": self.source_name,
                                "text": msg.get("text", ""),
                                "name": "",
                                "phone": "",
                                "external_id": str(msg.get("from_id", "")),
                            })
        except Exception:
            logger.exception("Ошибка VK API")

        return leads
