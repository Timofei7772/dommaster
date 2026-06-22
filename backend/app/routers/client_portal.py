"""
Роутер публичного клиентского портала (доступ по токену шеринга)
"""

import json
from datetime import datetime, date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, Field

from app.database import get_db
from app.models.project import Project, ProjectStatus
from app.models.work_stage import WorkStage
from app.models.payment import Payment
from app.models.estimate import Estimate
from app.models.photo import PhotoReport
from app.models.user import User

router = APIRouter()


# --- Схемы данных ---

class PublicProjectResponse(BaseModel):
    id: int
    name: str
    code: Optional[str] = None
    status: ProjectStatus
    planned_start: Optional[date] = None
    planned_end: Optional[date] = None
    budget: float
    spent: float
    description: Optional[str] = None

    class Config:
        from_attributes = True


class PublicStageResponse(BaseModel):
    id: int
    name: str
    start_date: date
    end_date: date
    status: str
    comments: List[str] = []

    class Config:
        from_attributes = True


class PublicPaymentResponse(BaseModel):
    id: int
    description: str
    planned_date: date
    planned_amount: float
    actual_amount: float
    status: str

    class Config:
        from_attributes = True


class PublicPaymentStatsResponse(BaseModel):
    total_planned: float
    total_paid: float
    total_remaining: float
    payments: List[PublicPaymentResponse]


class PublicPhotoResponse(BaseModel):
    id: int
    url: str
    stage_name: Optional[str] = None
    created_at: datetime


class PublicEstimateItemResponse(BaseModel):
    id: int
    name: str
    unit: Optional[str] = "шт"
    quantity: float
    total: float
    row_type: str
    is_work: bool


class PublicEstimateResponse(BaseModel):
    id: int
    name: str
    total_with_vat: float
    items: List[PublicEstimateItemResponse]


class CommentRequest(BaseModel):
    comment: str = Field(..., min_length=1, max_length=1000)


# --- Вспомогательная функция верификации публичного токена ---
async def verify_share_token(share_token: str, db: AsyncSession) -> Project:
    # Ищем проект по вхождению SHARE_TOKEN в его описание
    query = select(Project).where(Project.description.like(f"%SHARE_TOKEN: {share_token}%"))
    result = await db.execute(query)
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Публичный доступ не найден или ссылка недействительна"
        )
    return project


# --- Эндпоинты ---

@router.get("/{share_token}", response_model=PublicProjectResponse)
async def get_public_project(share_token: str, db: AsyncSession = Depends(get_db)):
    """Получить информацию о проекте по ссылке общего доступа"""
    project = await verify_share_token(share_token, db)
    return project


@router.get("/{share_token}/stages", response_model=List[PublicStageResponse])
async def get_public_stages(share_token: str, db: AsyncSession = Depends(get_db)):
    """Получить этапы работ для клиента"""
    project = await verify_share_token(share_token, db)
    
    stages_res = await db.execute(
        select(WorkStage).where(WorkStage.project_id == project.id).order_by(WorkStage.start_date.asc())
    )
    stages = stages_res.scalars().all()
    
    response = []
    for s in stages:
        comments = []
        if s.comments_json:
            try:
                comments = json.loads(s.comments_json)
            except Exception:
                comments = []
        
        response.append({
            "id": s.id,
            "name": s.name,
            "start_date": s.start_date,
            "end_date": s.end_date,
            "status": s.status,
            "comments": comments
        })
    return response


@router.get("/{share_token}/payments", response_model=PublicPaymentStatsResponse)
async def get_public_payments(share_token: str, db: AsyncSession = Depends(get_db)):
    """Получить график платежей для клиента"""
    project = await verify_share_token(share_token, db)
    
    payments_res = await db.execute(
        select(Payment).where(Payment.project_id == project.id).order_by(Payment.planned_date.asc())
    )
    payments = payments_res.scalars().all()
    
    total_planned = sum(p.planned_amount for p in payments)
    total_paid = sum(p.actual_amount for p in payments if p.status == "paid")
    total_remaining = max(0.0, total_planned - total_paid)
    
    return {
        "total_planned": total_planned,
        "total_paid": total_paid,
        "total_remaining": total_remaining,
        "payments": payments
    }


@router.get("/{share_token}/photos", response_model=List[PublicPhotoResponse])
async def get_public_photos(share_token: str, db: AsyncSession = Depends(get_db)):
    """Получить фотоотчеты по проекту для клиента"""
    project = await verify_share_token(share_token, db)
    
    photos_res = await db.execute(
        select(PhotoReport)
        .where(PhotoReport.project_id == project.id)
        .options(selectinload(PhotoReport.stage))
        .order_by(PhotoReport.created_at.desc())
    )
    photos = photos_res.scalars().all()
    
    return [
        {
            "id": p.id,
            "url": p.url,
            "stage_name": p.stage.name if p.stage else "Общий отчет",
            "created_at": p.created_at
        }
        for p in photos
    ]


@router.get("/{share_token}/estimates", response_model=List[PublicEstimateResponse])
async def get_public_estimates(share_token: str, db: AsyncSession = Depends(get_db)):
    """Получить сметы проекта для клиента (только расчётные позиции)"""
    project = await verify_share_token(share_token, db)
    
    est_res = await db.execute(
        select(Estimate)
        .where(Estimate.project_id == project.id)
        .options(selectinload(Estimate.items))
    )
    estimates = est_res.scalars().all()
    
    response = []
    for est in estimates:
        items = [
            item for item in est.items 
            if item.row_type not in ("comment", "spr")
        ]
        response.append({
            "id": est.id,
            "name": est.name,
            "total_with_vat": est.total_with_vat,
            "items": items
        })
    return response


@router.post("/{share_token}/stages/{stage_id}/comment")
async def add_stage_comment(
    share_token: str,
    stage_id: int,
    data: CommentRequest,
    db: AsyncSession = Depends(get_db)
):
    """Оставить комментарий заказчика по конкретному этапу работы"""
    project = await verify_share_token(share_token, db)
    
    stage_res = await db.execute(
        select(WorkStage).where(WorkStage.id == stage_id, WorkStage.project_id == project.id)
    )
    stage = stage_res.scalar_one_or_none()
    if not stage:
        raise HTTPException(status_code=404, detail="Этап работ не найден")
        
    comments = []
    if stage.comments_json:
        try:
            comments = json.loads(stage.comments_json)
        except Exception:
            comments = []
            
    # Добавляем новый комментарий с датой
    comments.append(f"Заказчик ({datetime.now().strftime('%d.%m.%Y %H:%M')}): {data.comment}")
    stage.comments_json = json.dumps(comments, ensure_ascii=False)
    
    await db.commit()
    return {"success": True, "comments": comments}
