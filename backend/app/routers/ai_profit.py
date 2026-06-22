"""
API роутер для AI-оптимизации прибыли
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.database import get_db
from app.ai.orchestrator import AIOrchestrator


router = APIRouter()


@router.get("/optimize/{estimate_id}")
async def optimize_profit(
    estimate_id: int,
    provider: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """AI-анализ и оптимизация прибыли по смете"""
    try:
        orchestrator = AIOrchestrator(db, provider_name=provider)
        task = await orchestrator.execute_task("optimize_profit", {
            "estimate_id": estimate_id,
        })
        return task.to_dict()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/benchmarks")
async def get_benchmarks(
    provider: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Получить бенчмарки цен из истории"""
    try:
        orchestrator = AIOrchestrator(db, provider_name=provider)
        result = await orchestrator.execute_single_agent("LearningAgent", {
            "action": "get_benchmarks",
        })
        return result.to_dict()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/history")
async def get_history_analysis(
    provider: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Анализ исторических данных"""
    try:
        orchestrator = AIOrchestrator(db, provider_name=provider)
        result = await orchestrator.execute_single_agent("LearningAgent", {
            "action": "analyze_history",
        })
        return result.to_dict()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
