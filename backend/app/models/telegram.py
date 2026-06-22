"""
Модель для подписок чатов Telegram на уведомления
"""

from sqlalchemy import Column, Integer, BigInteger, String, Boolean, DateTime
from sqlalchemy.sql import func

from app.database import Base


class TelegramChat(Base):
    """Подписка Telegram чата на уведомления"""
    __tablename__ = "telegram_chats"

    id = Column(Integer, primary_key=True, index=True)
    chat_id = Column(BigInteger, nullable=False, unique=True, index=True,
                     comment="Telegram chat ID")
    project_id = Column(Integer, nullable=True, index=True,
                        comment="ID проекта для привязки (опционально)")
    enabled = Column(Boolean, default=True,
                     comment="Активна ли подписка")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
