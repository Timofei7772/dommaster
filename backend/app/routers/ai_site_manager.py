"""
API роутер для AI-прораба
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.database import get_db
from app.ai.orchestrator import AIOrchestrator


router = APIRouter()


@router.get("/report/{estimate_id}")
async def get_site_report(
    estimate_id: int,
    provider: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Получить отчёт AI-прораба по смете"""
    try:
        orchestrator = AIOrchestrator(db, provider_name=provider)
        task = await orchestrator.execute_task("site_management", {
            "estimate_id": estimate_id,
        })
        return task.to_dict()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/validate/{estimate_id}")
async def ai_validate_estimate(
    estimate_id: int,
    provider: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """AI-валидация сметы"""
    try:
        orchestrator = AIOrchestrator(db, provider_name=provider)
        task = await orchestrator.execute_task("validate_estimate", {
            "estimate_id": estimate_id,
        })
        return task.to_dict()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
