"""
FastAPI router for Telegram webhook and bot status.
"""
import logging

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/telegram", tags=["Telegram"])

# Храним ссылку на бота, устанавливается при инициализации приложения
_bot_instance = None


def set_bot_instance(bot):
    """Установить экземпляр бота для обработки вебхуков."""
    global _bot_instance
    _bot_instance = bot


class WebhookUpdate(BaseModel):
    """Тело запроса от Telegram (сырой JSON update)."""
    update_id: int
    message: dict | None = None
    edited_message: dict | None = None
    channel_post: dict | None = None
    edited_channel_post: dict | None = None
    inline_query: dict | None = None
    chosen_inline_result: dict | None = None
    callback_query: dict | None = None
    shipping_query: dict | None = None
    pre_checkout_query: dict | None = None
    poll: dict | None = None
    poll_answer: dict | None = None
    my_chat_member: dict | None = None
    chat_member: dict | None = None
    chat_join_request: dict | None = None


@router.post("/webhook")
async def telegram_webhook(update: dict, request: Request):
    """Принимает входящие обновления от Telegram (вебхук).

    Telegram присылает сырой JSON — передаём его в бота для обработки.
    """
    if not _bot_instance:
        raise HTTPException(status_code=503, detail="Bot not initialized")

    try:
        await _bot_instance.process_update(update)
        return {"ok": True}
    except Exception as exc:
        logger.error("Ошибка обработки Telegram webhook: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/status")
async def telegram_status():
    """Проверка состояния Telegram бота."""
    if not _bot_instance or not _bot_instance.application:
        return {
            "configured": bool(getattr(settings, "TELEGRAM_BOT_TOKEN", None)),
            "running": False,
            "message": "Бот не запущен"
        }

    try:
        me = await _bot_instance.application.bot.get_me()
        return {
            "configured": True,
            "running": True,
            "bot_name": me.full_name,
            "bot_username": me.username,
            "message": "Бот работает"
        }
    except Exception as exc:
        return {
            "configured": True,
            "running": False,
            "message": f"Ошибка подключения: {exc}"
        }
