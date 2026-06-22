"""
API роутер для CRM-конвейера сделок
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func as sa_func, case
from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime

from app.database import get_db
from app.models.deal import Deal, DealActivity, DealStage


# === Pydantic-схемы ===

class ActivityCreate(BaseModel):
    activity_type: str = "message"
    description: str

class AISuggestRequest(BaseModel):
    client_message: str

class DealCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None
    address: Optional[str] = None
    stage: str = "lead"
    sale_amount: float = 0.0
    estimate_total: float = 0.0
    cost_amount: float = 0.0
    advance_amount: float = 0.0
    estimate_id: Optional[int] = None
    source: Optional[str] = None
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    client_id: Optional[int] = None
    notes: Optional[str] = None
    next_action: Optional[str] = None
    next_action_date: Optional[datetime] = None


class DealUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    address: Optional[str] = None
    sale_amount: Optional[float] = None
    estimate_total: Optional[float] = None
    cost_amount: Optional[float] = None
    advance_amount: Optional[float] = None
    estimate_id: Optional[int] = None
    source: Optional[str] = None
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    meeting_date: Optional[datetime] = None
    meeting_notes: Optional[str] = None
    master_name: Optional[str] = None
    master_id: Optional[int] = None
    notes: Optional[str] = None
    client_id: Optional[int] = None
    next_action: Optional[str] = None
    next_action_date: Optional[datetime] = None
    last_contact_at: Optional[datetime] = None


class DealMoveRequest(BaseModel):
    new_stage: str


class DealLostRequest(BaseModel):
    reason: Optional[str] = None


class DealResponse(BaseModel):
    id: int
    client_id: Optional[int]
    title: str
    description: Optional[str]
    address: Optional[str]
    stage: str
    estimate_id: Optional[int]
    sale_amount: float
    estimate_total: float
    cost_amount: float
    advance_amount: float
    profit: float
    source: Optional[str]
    contact_name: Optional[str]
    contact_phone: Optional[str]
    meeting_date: Optional[datetime]
    meeting_notes: Optional[str]
    master_id: Optional[int]
    master_name: Optional[str]
    is_lost: bool
    lost_reason: Optional[str]
    notes: Optional[str]
    next_action: Optional[str]
    next_action_date: Optional[datetime]
    last_contact_at: Optional[datetime]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    closed_at: Optional[datetime]

    class Config:
        from_attributes = True


class DealActivityResponse(BaseModel):
    id: int
    deal_id: int
    activity_type: str
    description: Optional[str]
    old_stage: Optional[str]
    new_stage: Optional[str]
    created_at: Optional[datetime]

    class Config:
        from_attributes = True


class PipelineStatsResponse(BaseModel):
    stage: str
    count: int
    total_sale_amount: float
    total_profit: float


# === Роутер ===

router = APIRouter()


@router.get("/", response_model=List[DealResponse])
async def list_deals(
    stage: Optional[str] = Query(None, description="Фильтр по этапу"),
    source: Optional[str] = Query(None, description="Фильтр по источнику"),
    is_lost: Optional[bool] = Query(None, description="Показать потерянные"),
    search: Optional[str] = Query(None, description="Поиск по названию/контакту"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Список сделок с фильтрацией"""
    query = select(Deal)

    if stage:
        query = query.where(Deal.stage == stage)
    if source:
        query = query.where(Deal.source == source)
    if is_lost is not None:
        query = query.where(Deal.is_lost == is_lost)
    else:
        # По умолчанию не показываем потерянные
        query = query.where(Deal.is_lost == False)
    if search:
        query = query.where(
            Deal.title.ilike(f"%{search}%") |
            Deal.contact_name.ilike(f"%{search}%") |
            Deal.contact_phone.ilike(f"%{search}%")
        )

    query = query.order_by(Deal.updated_at.desc()).offset(offset).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/stats", response_model=List[PipelineStatsResponse])
async def get_pipeline_stats(db: AsyncSession = Depends(get_db)):
    """Статистика конвейера по этапам"""
    query = (
        select(
            Deal.stage,
            sa_func.count(Deal.id).label("count"),
            sa_func.coalesce(sa_func.sum(Deal.sale_amount), 0).label("total_sale_amount"),
            sa_func.coalesce(sa_func.sum(Deal.profit), 0).label("total_profit"),
        )
        .where(Deal.is_lost == False)
        .group_by(Deal.stage)
    )
    result = await db.execute(query)
    rows = result.all()

    stage_data = {
        row.stage: {
            "count": row.count, 
            "total_sale_amount": getattr(row, "total_sale_amount", 0),
            "total_profit": getattr(row, "total_profit", 0)
        } for row in rows
    }
    all_stages = [s.value for s in DealStage]
    return [
        PipelineStatsResponse(
            stage=stage,
            count=stage_data.get(stage, {}).get("count", 0),
            total_sale_amount=stage_data.get(stage, {}).get("total_sale_amount", 0.0),
            total_profit=stage_data.get(stage, {}).get("total_profit", 0.0),
        )
        for stage in all_stages
    ]


@router.get("/{deal_id}", response_model=DealResponse)
async def get_deal(deal_id: int, db: AsyncSession = Depends(get_db)):
    """Получить сделку по ID"""
    result = await db.execute(select(Deal).where(Deal.id == deal_id))
    deal = result.scalar_one_or_none()
    if not deal:
        raise HTTPException(status_code=404, detail="Сделка не найдена")
    return deal


@router.post("/", response_model=DealResponse, status_code=201)
async def create_deal(data: DealCreate, db: AsyncSession = Depends(get_db)):
    """Создать сделку"""
    deal_data = data.model_dump(exclude_none=True)

    # Преобразуем stage из строки в enum
    stage_str = deal_data.pop("stage", "lead")
    try:
        deal_stage = DealStage(stage_str)
    except ValueError:
        deal_stage = DealStage.LEAD

    deal = Deal(**deal_data, stage=deal_stage)
    deal.calculate_profit()
    db.add(deal)
    await db.flush()

    # Лог создания
    activity = DealActivity(
        deal_id=deal.id,
        activity_type="created",
        description=f"Сделка создана: {deal.title}",
        new_stage=deal.stage.value if isinstance(deal.stage, DealStage) else deal.stage,
    )
    db.add(activity)
    await db.flush()

    return deal


@router.patch("/{deal_id}", response_model=DealResponse)
async def update_deal(deal_id: int, data: DealUpdate, db: AsyncSession = Depends(get_db)):
    """Обновить сделку"""
    result = await db.execute(select(Deal).where(Deal.id == deal_id))
    deal = result.scalar_one_or_none()
    if not deal:
        raise HTTPException(status_code=404, detail="Сделка не найдена")

    update_data = data.model_dump(exclude_none=True)
    for field, value in update_data.items():
        setattr(deal, field, value)

    deal.calculate_profit()
    await db.flush()
    return deal


@router.post("/{deal_id}/move", response_model=DealResponse)
async def move_deal(deal_id: int, data: DealMoveRequest, db: AsyncSession = Depends(get_db)):
    """Переместить сделку на другой этап"""
    result = await db.execute(select(Deal).where(Deal.id == deal_id))
    deal = result.scalar_one_or_none()
    if not deal:
        raise HTTPException(status_code=404, detail="Сделка не найдена")

    try:
        new_stage = DealStage(data.new_stage)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Неизвестный этап: {data.new_stage}")

    old_stage_value = deal.stage.value if isinstance(deal.stage, DealStage) else deal.stage

    # Лог перехода
    activity = DealActivity(
        deal_id=deal.id,
        activity_type="stage_change",
        description=f"Этап: {old_stage_value} → {new_stage.value}",
        old_stage=old_stage_value,
        new_stage=new_stage.value,
    )
    db.add(activity)

    deal.stage = new_stage

    # Если закрытие — ставим дату
    if new_stage == DealStage.PROFIT:
        deal.closed_at = datetime.utcnow()
        deal.calculate_profit()

    await db.flush()
    return deal


@router.post("/{deal_id}/lost", response_model=DealResponse)
async def mark_deal_lost(deal_id: int, data: DealLostRequest, db: AsyncSession = Depends(get_db)):
    """Отметить сделку как потерянную"""
    result = await db.execute(select(Deal).where(Deal.id == deal_id))
    deal = result.scalar_one_or_none()
    if not deal:
        raise HTTPException(status_code=404, detail="Сделка не найдена")

    deal.is_lost = True
    deal.lost_reason = data.reason
    deal.closed_at = datetime.utcnow()

    activity = DealActivity(
        deal_id=deal.id,
        activity_type="lost",
        description=f"Сделка потеряна. Причина: {data.reason or 'не указана'}",
    )
    db.add(activity)

    await db.flush()
    return deal


@router.get("/{deal_id}/activities", response_model=List[DealActivityResponse])
async def get_deal_activities(deal_id: int, db: AsyncSession = Depends(get_db)):
    """История действий по сделке"""
    query = (
        select(DealActivity)
        .where(DealActivity.deal_id == deal_id)
        .order_by(DealActivity.created_at.desc())
    )
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/{deal_id}/activities", response_model=DealActivityResponse)
async def create_deal_activity(deal_id: int, data: ActivityCreate, db: AsyncSession = Depends(get_db)):
    """Добавить ручную активность (лог коммуникации)"""
    result = await db.execute(select(Deal).where(Deal.id == deal_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Сделка не найдена")

    activity = DealActivity(
        deal_id=deal_id,
        activity_type=data.activity_type,
        description=data.description
    )
    db.add(activity)
    await db.flush()
    await db.refresh(activity)
    return activity

import os
import json
import httpx

@router.post("/{deal_id}/ai/suggest")
async def suggest_ai_reply(deal_id: int, data: AISuggestRequest):
    """Генерация ответов AI"""
    # Simple JSON config fallback
    config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "settings.json")
    api_key = None
    if os.path.exists(config_path):
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                settings = json.load(f)
                api_key = settings.get("openai_api_key")
        except Exception:
            pass

    if not api_key:
        raise HTTPException(status_code=403, detail="API ключ не настроен. Подключите ключ в настройках.")

    prompt = (
        "Ты опытный B2B менеджер и прораб по ремонту квартир. Клиент пишет тебе: "
        f"'{data.client_message}'. "
        "Сгенерируй 3 коротких, профессиональных варианта ответа (максимум по 2-3 предложения каждый). "
        "1. Мягкий и эмпатичный. 2. Экспертный с аргументацией пользы (цена/качество). 3. Закрывающий на следующий шаг (замер/встречу)."
    )

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": "gpt-4o-mini",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.7
                },
                timeout=15.0
            )
            resp.raise_for_status()
            ai_data = resp.json()
            content = ai_data["choices"][0]["message"]["content"]
            # Разбиваем 1, 2, 3 на массив
            suggestions = [line.strip().replace("1. ", "").replace("2. ", "").replace("3. ", "") for line in content.split("\n") if line.strip().startswith(("1.", "2.", "3."))]
            if not suggestions:
                suggestions = [content]
            return {"suggestions": suggestions}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка генерации AI: {str(e)}")

@router.delete("/{deal_id}")
async def delete_deal(deal_id: int, db: AsyncSession = Depends(get_db)):
    """Удалить сделку"""
    result = await db.execute(select(Deal).where(Deal.id == deal_id))
    deal = result.scalar_one_or_none()
    if not deal:
        raise HTTPException(status_code=404, detail="Сделка не найдена")

    await db.delete(deal)
    await db.flush()
    return {"detail": "Сделка удалена"}
