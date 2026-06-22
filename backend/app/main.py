"""
Смета AI - Современная система для сметных расчётов
Backend API Server
Компания: ZARU Смета
"""

from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import logging
import uvicorn

from app.database import engine, Base, get_db
logger = logging.getLogger(__name__)

from app.routers import (
    estimates, works, materials, ks2, ks3, contracts,
    ai_assistant, photo_scanner,
    clients, documents, progress, finance,
    ai_orchestrator, ai_design, ai_estimate_gen, ai_site_manager, ai_profit,
    leads, license as license_api, payment,
    deals, analytics, templates, settings as settings_api,
    auth, crm_projects, crm_stages, crm_payments, crm_photos, crm_requests, crm_estimates, client_portal,
    competitor_analysis, handwriting_ocr, director_dashboard, local_prices,
    telegram_webhook,
)
from app.config import settings
from app.telegram_bot import TelegramBot


# Создаём глобальный экземпляр бота
telegram_bot = TelegramBot()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Инициализация при запуске приложения"""
    # Создание таблиц в БД
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Seed данных при первом запуске
    from sqlalchemy import select, func as sf, text as st
    from app.models import LocalPrice
    async with engine.begin() as conn:
        row = await conn.execute(select(sf.count(LocalPrice.id)))
        count = row.one()[0]
        if count == 0:
            logger.info("Первичное заполнение базы данных...")
            seeds = [
                "INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Отделка','Штукатурка стен цементная','м²',420,'Салават','Башкортостан')",
                "INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Отделка','Штукатурка стен цементная','м²',450,'Стерлитамак','Башкортостан')",
                "INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Отделка','Штукатурка стен цементная','м²',380,'Ишимбай','Башкортостан')",
                "INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Отделка','Шпатлёвка стен','м²',280,'Салават','Башкортостан')",
                "INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Отделка','Шпатлёвка стен','м²',300,'Стерлитамак','Башкортостан')",
                "INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Полы','Стяжка пола','м²',550,'Салават','Башкортостан')",
                "INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Полы','Стяжка пола','м²',580,'Стерлитамак','Башкортостан')",
                "INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Полы','Укладка ламината','м²',380,'Салават','Башкортостан')",
                "INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Плитка','Укладка плитки напольной','м²',1200,'Салават','Башкортостан')",
                "INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Плитка','Укладка плитки напольной','м²',1300,'Стерлитамак','Башкортостан')",
                "INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Сантехника','Установка унитаза','шт',2500,'Салават','Башкортостан')",
                "INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Электрика','Прокладка кабеля до 5 мм²','м',180,'Салават','Башкортостан')",
                "INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Стены','Поклейка обоев','м²',320,'Салават','Башкортостан')",
            ]
            for sql in seeds:
                await conn.execute(st(sql))
            logger.info("База заполнена ценами Башкортостан!")

    # Запуск Telegram бота
    if telegram_bot.token:
        await telegram_bot.start()
        # Регистрируем бота в вебхук-роутере
        telegram_webhook.set_bot_instance(telegram_bot)
        # Устанавливаем вебхук (если указан PUBLIC_URL в окружении)
        public_url = getattr(settings, "PUBLIC_URL", None)
        if public_url:
            webhook_url = f"{public_url.rstrip('/')}/api/telegram/webhook"
            await telegram_bot.set_webhook(url=webhook_url)
            logger.info("Telegram webhook установлен: %s", webhook_url)
    else:
        logger.info("Telegram бот не настроен (пропущен запуск)")

    yield

    # Остановка Telegram бота
    if telegram_bot.token:
        await telegram_bot.stop()
    # Закрытие соединений при остановке
    await engine.dispose()


app = FastAPI(
    title="Смета AI API",
    description="""
    🏗️ **Современная система для сметных расчётов ZARU Смета**
    
    ## Возможности:
    * 📋 Составление локальных смет
    * 📊 Объектные и сводные сметы
    * 📝 Акты выполненных работ (КС-2, КС-3)
    * 💰 Ресурсный метод расчёта
    * 🤖 ИИ-помощник для подбора расценок
    * 📄 Генерация документов (договоры, счета)
    """,
    version="2.0.0",
    lifespan=lifespan,
)

# CORS для фронтенда
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "app://.*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключение роутеров
app.include_router(estimates.router, prefix="/api/estimates", tags=["Сметы"])
app.include_router(works.router, prefix="/api/works", tags=["Работы"])
app.include_router(materials.router, prefix="/api/materials", tags=["Материалы"])
app.include_router(ks2.router, prefix="/api/ks2", tags=["КС-2"])
app.include_router(ks3.router, prefix="/api/ks3", tags=["КС-3"])
app.include_router(contracts.router, prefix="/api/contracts", tags=["Договоры"])
app.include_router(ai_assistant.router, prefix="/api/ai", tags=["ИИ-помощник"])
app.include_router(photo_scanner.router, prefix="/api/scanner", tags=["Сканер фото"])
app.include_router(license_api.router, prefix="/api/license", tags=["Лицензии"])
app.include_router(payment.router, prefix="/api/payment", tags=["Платежи"])

# ERP роутеры
app.include_router(clients.router, prefix="/api/clients", tags=["Клиенты"])
app.include_router(documents.router, prefix="/api/documents", tags=["Документы"])
app.include_router(progress.router, prefix="/api/progress", tags=["Прогресс работ"])
app.include_router(finance.router, prefix="/api/finance", tags=["Финансы"])

# AI роутеры
app.include_router(ai_orchestrator.router, prefix="/api/ai/orchestrator", tags=["AI Оркестратор"])
app.include_router(ai_design.router, prefix="/api/ai/design", tags=["AI Дизайн-проект"])
app.include_router(ai_estimate_gen.router, prefix="/api/ai/generate", tags=["AI Генерация смет"])
app.include_router(ai_site_manager.router, prefix="/api/ai/site-manager", tags=["AI Прораб"])
app.include_router(ai_profit.router, prefix="/api/ai/profit", tags=["AI Оптимизация"])
app.include_router(leads.router, prefix="/api/leads", tags=["Лидогенерация"])
app.include_router(deals.router, prefix="/api/deals", tags=["CRM Конвейер"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["Аналитика CRM"])
app.include_router(templates.router, prefix="/api/templates", tags=["Шаблоны"])
app.include_router(settings_api.router, prefix="/api/settings", tags=["Настройки"])

# CRM Модули
app.include_router(auth.router, prefix="/api/auth", tags=["CRM Аутентификация"])
app.include_router(crm_projects.router, prefix="/api/crm-projects", tags=["CRM Проекты"])
app.include_router(crm_stages.router, prefix="/api/crm-stages", tags=["CRM График работ"])
app.include_router(crm_payments.router, prefix="/api/crm-payments", tags=["CRM График платежей"])
app.include_router(crm_photos.router, prefix="/api/crm-photos", tags=["CRM Фотоотчеты"])
app.include_router(crm_requests.router, prefix="/api/crm-requests", tags=["CRM Заявки и Канбан"])
app.include_router(crm_estimates.router, prefix="/api/crm-estimates", tags=["CRM Сметы"])
app.include_router(client_portal.router, prefix="/api/client-portal", tags=["CRM Публичный портал"])

# Раздача статических файлов (фотоотчётов и логотипов)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# DomMaster OS — новые модули
app.include_router(competitor_analysis.router, prefix="/api/competitor", tags=["Анализ конкурентов"])
app.include_router(handwriting_ocr.router, prefix="/api/ocr", tags=["Распознавание текста"])
app.include_router(director_dashboard.router, prefix="/api/director", tags=["Панель руководителя"])
app.include_router(local_prices.router, prefix="/api/prices", tags=["Цены"])

# Telegram бот
app.include_router(telegram_webhook.router)


@app.get("/")
async def root():
    """Главная страница API"""
    return {
        "name": "Смета AI",
        "version": "2.0.0",
        "company": "ZARU Смета",
        "status": "running",
        "docs": "/docs",
        "features": [
            "Локальные сметы",
            "Объектные сметы",
            "Сводные сметы",
            "КС-2 / КС-3",
            "Ресурсный метод",
            "ИИ-помощник",
            "Генерация документов"
        ]
    }


@app.get("/health")
async def health_check():
    """Проверка состояния сервера"""
    return {"status": "healthy", "database": "connected"}


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
