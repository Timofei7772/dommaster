"""
API роутер для AI-оркестратора
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field

from app.database import get_db
from app.ai.orchestrator import AIOrchestrator


# Схемы
class AITaskRequest(BaseModel):
    task_type: str = Field(..., description="Тип задачи: generate_estimate, analyze_design, ...")
    params: Dict[str, Any] = Field(default={}, description="Параметры задачи")
    provider: Optional[str] = Field(None, description="LLM провайдер: openai/anthropic/gemini")


class SingleAgentRequest(BaseModel):
    agent_name: str
    params: Dict[str, Any] = {}
    provider: Optional[str] = None


router = APIRouter()


@router.post("/execute")
async def execute_task(
    request: AITaskRequest,
    db: AsyncSession = Depends(get_db),
):
    """Запустить AI-задачу через оркестратор"""
    try:
        orchestrator = AIOrchestrator(db, provider_name=request.provider)
        task = await orchestrator.execute_task(request.task_type, request.params)
        return task.to_dict()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка AI: {str(e)}")


@router.post("/agent")
async def execute_single_agent(
    request: SingleAgentRequest,
    db: AsyncSession = Depends(get_db),
):
    """Запустить одного AI-агента"""
    try:
        orchestrator = AIOrchestrator(db, provider_name=request.provider)
        result = await orchestrator.execute_single_agent(request.agent_name, request.params)
        return result.to_dict()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/agents")
async def list_agents(db: AsyncSession = Depends(get_db)):
    """Список доступных AI-агентов"""
    try:
        orchestrator = AIOrchestrator(db)
        return orchestrator.list_agents()
    except ValueError:
        # Нет API-ключей — возвращаем список без инициализации
        return [
            {"name": "ObjectAnalyzer", "description": "Анализ объекта по фото/тексту"},
            {"name": "DesignAnalyzer", "description": "Чтение дизайн-проектов"},
            {"name": "WorkGenerator", "description": "Генерация списка работ"},
            {"name": "VolumeEstimator", "description": "Расчёт объёмов"},
            {"name": "MaterialEstimator", "description": "Расчёт материалов"},
            {"name": "FinanceAgent", "description": "Финансовые расчёты"},
            {"name": "EstimateValidator", "description": "Валидация смет"},
            {"name": "DocumentAgent", "description": "Генерация документов"},
            {"name": "AISiteManager", "description": "AI-прораб"},
            {"name": "ProfitOptimizer", "description": "Оптимизация прибыли"},
            {"name": "LeadAnalyzer", "description": "Анализ лидов"},
            {"name": "LearningAgent", "description": "Обучение на данных"},
        ]


@router.get("/task-types")
async def list_task_types():
    """Доступные типы AI-задач"""
    return [
        {"type": "generate_estimate", "description": "Автогенерация сметы из описания объекта"},
        {"type": "analyze_design", "description": "Анализ дизайн-проекта и создание сметы"},
        {"type": "analyze_photo", "description": "Анализ фото объекта"},
        {"type": "validate_estimate", "description": "AI-валидация сметы"},
        {"type": "optimize_profit", "description": "Оптимизация прибыли"},
        {"type": "site_management", "description": "AI-прораб (отчёт о стройке)"},
        {"type": "generate_documents", "description": "AI-генерация документов"},
        {"type": "analyze_lead", "description": "Анализ заявки клиента"},
    ]
