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
    telegram_webhook, document_chain,
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
                # --- Отделка стен ---
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Отделка','Штукатурка стен цементная','м²',{p},'{c}','Башкортостан')" for c,p in [('Салават',420),('Стерлитамак',450),('Ишимбай',380)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Отделка','Штукатурка стен гипсовая','м²',{p},'{c}','Башкортостан')" for c,p in [('Салават',380),('Стерлитамак',400),('Ишимбай',350)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Отделка','Шпатлёвка стен','м²',{p},'{c}','Башкортостан')" for c,p in [('Салават',280),('Стерлитамак',300),('Ишимбай',250)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Отделка','Грунтовка стен','м²',{p},'{c}','Башкортостан')" for c,p in [('Салават',60),('Стерлитамак',70),('Ишимбай',50)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Отделка','Маячковая штукатурка','м²',{p},'{c}','Башкортостан')" for c,p in [('Салават',520),('Стерлитамак',550),('Ишимбай',480)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Отделка','Демонтаж штукатурки','м²',{p},'{c}','Башкортостан')" for c,p in [('Салават',200),('Стерлитамак',220),('Ишимбай',180)]],
                # --- Стены (обои, покраска) ---
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Стены','Поклейка обоев флизелиновых','м²',{p},'{c}','Башкортостан')" for c,p in [('Салават',350),('Стерлитамак',380),('Ишимбай',320)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Стены','Поклейка обоев виниловых','м²',{p},'{c}','Башкортостан')" for c,p in [('Салават',400),('Стерлитамак',430),('Ишимбай',370)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Стены','Поклейка обоев стекло','м²',{p},'{c}','Башкортостан')" for c,p in [('Салават',450),('Стерлитамак',480),('Ишимбай',420)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Стены','Покраска стен','м²',{p},'{c}','Башкортостан')" for c,p in [('Салават',200),('Стерлитамак',220),('Ишимбай',180)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Стены','Декоративная штукатурка','м²',{p},'{c}','Башкортостан')" for c,p in [('Салават',800),('Стерлитамак',850),('Ишимбай',750)]],
                # --- Потолок ---
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Потолок','Покраска потолка','м²',{p},'{c}','Башкортостан')" for c,p in [('Салават',250),('Стерлитамак',270),('Ишимбай',230)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Потолок','Шпатлёвка потолка','м²',{p},'{c}','Башкортостан')" for c,p in [('Салават',320),('Стерлитамак',340),('Ишимбай',300)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Потолок','Монтаж натяжного потолка матовый','м²',{p},'{c}','Башкортостан')" for c,p in [('Салават',650),('Стерлитамак',680),('Ишимбай',600)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Потолок','Монтаж натяжного потолка глянцевый','м²',{p},'{c}','Башкортостан')" for c,p in [('Салават',700),('Стерлитамак',730),('Ишимбай',650)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Потолок','Монтаж ГКЛ потолка','м²',{p},'{c}','Башкортостан')" for c,p in [('Салават',550),('Стерлитамак',580),('Ишимбай',520)]],
                # --- Полы ---
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Полы','Стяжка пола цементная','м²',{p},'{c}','Башкортостан')" for c,p in [('Салават',550),('Стерлитамак',580),('Ишимбай',500)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Полы','Наливной пол','м²',{p},'{c}','Башкортостан')" for c,p in [('Салават',450),('Стерлитамак',480),('Ишимбай',420)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Полы','Укладка ламината','м²',{p},'{c}','Башкортостан')" for c,p in [('Салават',380),('Стерлитамак',400),('Ишимбай',350)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Полы','Укладка паркетной доски','м²',{p},'{c}','Башкортостан')" for c,p in [('Салават',500),('Стерлитамак',530),('Ишимбай',470)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Полы','Укладка линолеума','м²',{p},'{c}','Башкортостан')" for c,p in [('Салават',250),('Стерлитамак',270),('Ишимбай',230)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Полы','Укладка ковролина','м²',{p},'{c}','Башкортостан')" for c,p in [('Салават',280),('Стерлитамак',300),('Ишимбай',260)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Полы','Монтаж плинтуса','мп',{p},'{c}','Башкортостан')" for c,p in [('Салават',150),('Стерлитамак',170),('Ишимбай',130)]],
                # --- Плитка ---
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Плитка','Укладка плитки напольной','м²',{p},'{c}','Башкортостан')" for c,p in [('Салават',1200),('Стерлитамак',1300),('Ишимбай',1100)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Плитка','Укладка плитки настенной','м²',{p},'{c}','Башкортостан')" for c,p in [('Салават',1100),('Стерлитамак',1200),('Ишимбай',1000)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Плитка','Укладка керамогранита','м²',{p},'{c}','Башкортостан')" for c,p in [('Салават',1300),('Стерлитамак',1400),('Ишимбай',1200)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Плитка','Укладка мозаики','м²',{p},'{c}','Башкортостан')" for c,p in [('Салават',1800),('Стерлитамак',1900),('Ишимбай',1700)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Плитка','Затирка швов','м²',{p},'{c}','Башкортостан')" for c,p in [('Салават',180),('Стерлитамак',200),('Ишимбай',160)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Плитка','Демонтаж плитки','м²',{p},'{c}','Башкортостан')" for c,p in [('Салават',350),('Стерлитамак',370),('Ишимбай',330)]],
                # --- Сантехника ---
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Сантехника','Установка унитаза','шт',{p},'{c}','Башкортостан')" for c,p in [('Салават',2500),('Стерлитамак',2800),('Ишимбай',2300)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Сантехника','Установка раковины','шт',{p},'{c}','Башкортостан')" for c,p in [('Салават',2000),('Стерлитамак',2200),('Ишимбай',1800)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Сантехника','Установка ванны стальной','шт',{p},'{c}','Башкортостан')" for c,p in [('Салават',3500),('Стерлитамак',3700),('Ишимбай',3300)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Сантехника','Установка ванны акриловой','шт',{p},'{c}','Башкортостан')" for c,p in [('Салават',4000),('Стерлитамак',4200),('Ишимбай',3800)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Сантехника','Установка душевой кабины','шт',{p},'{c}','Башкортостан')" for c,p in [('Салават',5000),('Стерлитамак',5300),('Ишимбай',4800)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Сантехника','Установка смесителя','шт',{p},'{c}','Башкортостан')" for c,p in [('Салават',800),('Стерлитамак',900),('Ишимбай',750)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Сантехника','Установка полотенцесушителя','шт',{p},'{c}','Башкортостан')" for c,p in [('Салават',2000),('Стерлитамак',2200),('Ишимбай',1800)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Сантехника','Монтаж водопровода (полипропилен)','мп',{p},'{c}','Башкортостан')" for c,p in [('Салават',400),('Стерлитамак',420),('Ишимбай',380)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Сантехника','Монтаж канализации','мп',{p},'{c}','Башкортостан')" for c,p in [('Салават',350),('Стерлитамак',370),('Ишимбай',330)]],
                # --- Электрика ---
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Электрика','Прокладка кабеля до 5 мм²','мп',{p},'{c}','Башкортостан')" for c,p in [('Салават',180),('Стерлитамак',200),('Ишимбай',160)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Электрика','Прокладка кабеля 5-10 мм²','мп',{p},'{c}','Башкортостан')" for c,p in [('Салават',250),('Стерлитамак',270),('Ишимбай',230)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Электрика','Установка розетки','шт',{p},'{c}','Башкортостан')" for c,p in [('Салават',300),('Стерлитамак',320),('Ишимбай',280)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Электрика','Установка выключателя','шт',{p},'{c}','Башкортостан')" for c,p in [('Салават',250),('Стерлитамак',270),('Ишимбай',230)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Электрика','Монтаж электрощита','шт',{p},'{c}','Башкортостан')" for c,p in [('Салават',3000),('Стерлитамак',3200),('Ишимбай',2800)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Электрика','Установка люстры','шт',{p},'{c}','Башкортостан')" for c,p in [('Салават',800),('Стерлитамак',850),('Ишимбай',750)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Электрика','Установка точечного светильника','шт',{p},'{c}','Башкортостан')" for c,p in [('Салават',350),('Стерлитамак',370),('Ишимбай',330)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Электрика','Штробление стен под проводку','мп',{p},'{c}','Башкортостан')" for c,p in [('Салават',200),('Стерлитамак',220),('Ишимбай',180)]],
                # --- Двери ---
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Двери','Установка межкомнатной двери','шт',{p},'{c}','Башкортостан')" for c,p in [('Салават',2500),('Стерлитамак',2700),('Ишимбай',2300)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Двери','Установка входной двери','шт',{p},'{c}','Башкортостан')" for c,p in [('Салават',3500),('Стерлитамак',3700),('Ишимбай',3300)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Двери','Монтаж дверной коробки','шт',{p},'{c}','Башкортостан')" for c,p in [('Салават',1500),('Стерлитамак',1600),('Ишимбай',1400)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Двери','Установка наличников','мп',{p},'{c}','Башкортостан')" for c,p in [('Салават',200),('Стерлитамак',220),('Ишимбай',180)]],
                # --- Демонтаж ---
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Демонтаж','Демонтаж перегородки','м²',{p},'{c}','Башкортостан')" for c,p in [('Салават',300),('Стерлитамак',320),('Ишимбай',280)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Демонтаж','Демонтаж двери','шт',{p},'{c}','Башкортостан')" for c,p in [('Салават',500),('Стерлитамак',550),('Ишимбай',450)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Демонтаж','Демонтаж сантехники','шт',{p},'{c}','Башкортостан')" for c,p in [('Салават',400),('Стерлитамак',450),('Ишимбай',350)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('Демонтаж','Вынос мусора','м³',{p},'{c}','Башкортостан')" for c,p in [('Салават',1000),('Стерлитамак',1100),('Ишимбай',900)]],
                # --- Монтаж ГКЛ ---
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('ГКЛ','Монтаж ГКЛ перегородки','м²',{p},'{c}','Башкортостан')" for c,p in [('Салават',500),('Стерлитамак',530),('Ишимбай',470)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('ГКЛ','Монтаж ГКЛ стены','м²',{p},'{c}','Башкортостан')" for c,p in [('Салават',450),('Стерлитамак',480),('Ишимбай',420)]],
                *[f"INSERT INTO local_prices (category,name,unit,price,city,region) VALUES ('ГКЛ','Шпаклёвка ГКЛ','м²',{p},'{c}','Башкортостан')" for c,p in [('Салават',200),('Стерлитамак',220),('Ишимбай',180)]],
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

# CORS для фронтенда + Electron
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex="(http://localhost:[0-9]+|http://127\\.0\\.0\\.1:[0-9]+|app://.*|null)",
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
app.include_router(
    document_chain.router,
    prefix="/api/v1/document-chain",
    tags=["Цепочка документов"],
)


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
