"""
Конфигурация приложения Смета AI
"""

import os
from typing import Optional, List

from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Настройки приложения"""
    
    # База данных (SQLite для разработки)
    DATABASE_URL: str = "sqlite+aiosqlite:///./smeta_ai.db"
    
    # Путь к старой базе Access для миграции (задаётся через переменную окружения LEGACY_ACCESS_DB)
    LEGACY_ACCESS_DB: Optional[str] = None
    
    # API ключи для ИИ
    OPENAI_API_KEY: Optional[str] = None
    ANTHROPIC_API_KEY: Optional[str] = None
    GEMINI_API_KEY: Optional[str] = None  # Для распознавания фото смет
    
    # JWT токены
    SECRET_KEY: str = os.getenv("SECRET_KEY", "smeta-ai-secret-key-change-in-production")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 часов
    
    # Настройки приложения
    APP_NAME: str = "Смета AI"
    COMPANY_NAME: str = "ZARU Смета"
    DEBUG: bool = False
    
    # Пути к шаблонам документов
    TEMPLATES_DIR: str = "templates"
    OUTPUT_DIR: str = "output"
    
    # Настройки сметных расчётов
    DEFAULT_OVERHEAD_PERCENT: float = 15.0  # Накладные расходы
    DEFAULT_PROFIT_PERCENT: float = 10.0    # Сметная прибыль
    DEFAULT_VAT_PERCENT: float = 20.0       # НДС

    # Разрешённые расширения файлов
    ALLOWED_EXTENSIONS: List[str] = [
        ".pdf", ".docx", ".xlsx", ".xls", ".png", ".jpg", ".jpeg", ".dxf", ".dwg"
    ]
    
    # Индексы пересчёта цен (обновляются ежеквартально)
    PRICE_INDEX_MATERIALS: float = 1.0
    PRICE_INDEX_LABOR: float = 1.0
    PRICE_INDEX_MACHINES: float = 1.0
    
    # AI настройки
    AI_DEFAULT_PROVIDER: Optional[str] = None  # openai / anthropic / gemini (авто если None)
    AI_TEMPERATURE: float = 0.3
    AI_MAX_TOKENS: int = 4096

    # Настройки безопасности
    ENCRYPTION_KEY: str = os.getenv("ENCRYPTION_KEY", "default_key")
    ENABLE_ENCRYPTION: bool = True
    LICENSE_ADMIN_SECRET: Optional[str] = None

    # Платежи / YooMoney
    YOOMONEY_SHOP_ID: Optional[str] = None
    YOOMONEY_SECRET: Optional[str] = None
    YOOMONEY_RETURN_URL: Optional[str] = None
    YOOMONEY_WEBHOOK_SECRET: Optional[str] = None

    # Telegram Bot
    TELEGRAM_BOT_TOKEN: Optional[str] = None

    @field_validator("DEBUG", mode="before")
    @classmethod
    def parse_debug(cls, value):
        if isinstance(value, bool):
            return value
        if value is None:
            return False

        normalized = str(value).strip().lower()
        if normalized in {"1", "true", "yes", "on", "debug", "development", "dev"}:
            return True
        if normalized in {"0", "false", "no", "off", "release", "production", "prod"}:
            return False
        return value
    
    class Config:
        env_file = ".env"
        extra = "allow"


settings = Settings()



