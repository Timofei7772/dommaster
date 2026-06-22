# main.py
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import config
from database import engine, Base, get_db
from api import projects, estimates, documents, ai_endpoints, leads
from workers.task_queue import TaskQueue

logging.basicConfig(
    level=logging.DEBUG if config.debug else logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger(__name__)

task_queue: TaskQueue | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global task_queue
    logger.info("Запуск %s v%s", config.app_name, config.version)

    # Создание таблиц
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Очередь задач
    task_queue = TaskQueue(config.rabbitmq)
    await task_queue.connect()

    logger.info("Система готова к работе")
    yield

    # Завершение
    if task_queue:
        await task_queue.disconnect()
    await engine.dispose()
    logger.info("Система остановлена")


app = FastAPI(
    title=config.app_name,
    version=config.version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Маршруты ---
app.include_router(projects.router, prefix="/api/v1/projects", tags=["projects"])
app.include_router(estimates.router, prefix="/api/v1/estimates", tags=["estimates"])
app.include_router(documents.router, prefix="/api/v1/documents", tags=["documents"])
app.include_router(ai_endpoints.router, prefix="/api/v1/ai", tags=["ai"])
app.include_router(leads.router, prefix="/api/v1/leads", tags=["leads"])


@app.get("/api/v1/health")
async def health():
    return {
        "status": "ok",
        "app": config.app_name,
        "version": config.version,
    }
