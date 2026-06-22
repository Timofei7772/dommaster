# config.py
import os
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class DatabaseConfig:
    host: str = os.getenv("DB_HOST", "localhost")
    port: int = int(os.getenv("DB_PORT", "5432"))
    name: str = os.getenv("DB_NAME", "zaru_erp")
    user: str = os.getenv("DB_USER", "postgres")
    password: str = os.getenv("DB_PASSWORD", "postgres")

    @property
    def url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.user}:{self.password}"
            f"@{self.host}:{self.port}/{self.name}"
        )

    @property
    def sync_url(self) -> str:
        return (
            f"postgresql://{self.user}:{self.password}"
            f"@{self.host}:{self.port}/{self.name}"
        )


@dataclass
class RedisConfig:
    host: str = os.getenv("REDIS_HOST", "localhost")
    port: int = int(os.getenv("REDIS_PORT", "6379"))
    db: int = int(os.getenv("REDIS_DB", "0"))

    @property
    def url(self) -> str:
        return f"redis://{self.host}:{self.port}/{self.db}"


@dataclass
class RabbitMQConfig:
    host: str = os.getenv("RABBITMQ_HOST", "localhost")
    port: int = int(os.getenv("RABBITMQ_PORT", "5672"))
    user: str = os.getenv("RABBITMQ_USER", "guest")
    password: str = os.getenv("RABBITMQ_PASSWORD", "guest")

    @property
    def url(self) -> str:
        return (
            f"amqp://{self.user}:{self.password}"
            f"@{self.host}:{self.port}/"
        )


@dataclass
class AIConfig:
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    anthropic_api_key: str = os.getenv("ANTHROPIC_API_KEY", "")
    model_primary: str = "gpt-4o"
    model_vision: str = "gpt-4o"
    model_fast: str = "gpt-4o-mini"
    max_tokens: int = 4096
    temperature: float = 0.1


@dataclass
class DocumentConfig:
    output_dir: str = os.getenv("DOCS_OUTPUT_DIR", "./generated_docs")
    template_dir: str = os.getenv("DOCS_TEMPLATE_DIR", "./templates")


@dataclass
class LeadConfig:
    avito_api_key: str = os.getenv("AVITO_API_KEY", "")
    profi_api_key: str = os.getenv("PROFI_API_KEY", "")
    youdo_api_key: str = os.getenv("YOUDO_API_KEY", "")
    vk_token: str = os.getenv("VK_TOKEN", "")
    telegram_bot_token: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
    scan_interval_minutes: int = 15


@dataclass
class AppConfig:
    db: DatabaseConfig = field(default_factory=DatabaseConfig)
    redis: RedisConfig = field(default_factory=RedisConfig)
    rabbitmq: RabbitMQConfig = field(default_factory=RabbitMQConfig)
    ai: AIConfig = field(default_factory=AIConfig)
    documents: DocumentConfig = field(default_factory=DocumentConfig)
    leads: LeadConfig = field(default_factory=LeadConfig)
    debug: bool = os.getenv("DEBUG", "false").lower() == "true"
    app_name: str = "ZARU Смета PRO"
    version: str = "2.0.0"


config = AppConfig()
