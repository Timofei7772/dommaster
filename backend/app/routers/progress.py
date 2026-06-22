"""
API роутер для контроля выполнения работ
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Dict, Any
from pydantic import BaseModel

from app.database import get_db
from app.services.work_progress_service import WorkProgressService


# Схемы
class ProgressUpdateRequest(BaseModel):
    estimate_item_id: int
    completed_volume: float


class ProgressResponse(BaseModel):
    item_id: int
    name: str
    unit: str
    planned: float
    completed: float
    remaining: float
    percent: float


router = APIRouter()


@router.post("/init/{estimate_id}")
async def init_progress(estimate_id: int, db: AsyncSession = Depends(get_db)):
    """Инициализировать прогресс для сметы"""
    service = WorkProgressService(db)
    progress_list = await service.init_progress_for_estimate(estimate_id)
    return {"detail": f"Инициализировано {len(progress_list)} позиций"}


@router.get("/estimate/{estimate_id}")
async def get_estimate_progress(estimate_id: int, db: AsyncSession = Depends(get_db)):
    """Общий прогресс по смете"""
    service = WorkProgressService(db)
    return await service.get_estimate_progress(estimate_id)


@router.get("/items/{estimate_id}", response_model=List[ProgressResponse])
async def get_items_progress(estimate_id: int, db: AsyncSession = Depends(get_db)):
    """Прогресс по каждой позиции"""
    service = WorkProgressService(db)
    return await service.get_items_progress(estimate_id)


@router.patch("/update")
async def update_progress(
    request: ProgressUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Обновить выполненный объём"""
    service = WorkProgressService(db)
    wp = await service.update_progress(
        estimate_item_id=request.estimate_item_id,
        completed_volume=request.completed_volume,
    )
    if not wp:
        raise HTTPException(status_code=404, detail="Прогресс не найден. Инициализируйте прогресс.")
    return {
        "estimate_item_id": wp.estimate_item_id,
        "planned": wp.planned_volume,
        "completed": wp.completed_volume,
        "remaining": wp.remaining_volume,
    }
