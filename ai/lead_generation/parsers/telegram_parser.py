"""
Парсер Telegram Bot API для получения лидов.
"""
import logging
import aiohttp

logger = logging.getLogger(__name__)


class TelegramParser:
    source_name = "telegram"

    def __init__(self, bot_token: str):
        self.bot_token = bot_token

    async def fetch_leads(self) -> list[dict]:
        if not self.bot_token:
            return []

        leads = []
        try:
            async with aiohttp.ClientSession() as session:
                url = f"https://api.telegram.org/bot{self.bot_token}/getUpdates"
                async with session.get(url) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        for update in data.get("result", []):
                            msg = update.get("message", {})
                            user = msg.get("from", {})
                            leads.append({
                                "source": self.source_name,
                                "text": msg.get("text", ""),
                                "name": f"{user.get('first_name', '')} "
                                        f"{user.get('last_name', '')}".strip(),
                                "phone": "",
                                "external_id": str(msg.get("chat", {}).get("id", "")),
                            })
        except Exception:
            logger.exception("Ошибка Telegram API")

        return leads
