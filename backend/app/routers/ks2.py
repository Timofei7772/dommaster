"""
API для работы с актами КС-2
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional
from pydantic import BaseModel
from datetime import date, datetime

from app.database import get_db
from app.models.ks2 import KS2Act, KS2Item, KS2Status
from app.models.estimate import Estimate, EstimateItem


class KS2ItemCreate(BaseModel):
    """Создание позиции КС-2"""
    estimate_item_id: Optional[int] = None
    item_number: Optional[str] = None
    justification: Optional[str] = None
    name: str
    unit: str = "шт"
    quantity_total: float = 0.0
    quantity_done: float = 0.0
    quantity_prev: float = 0.0
    unit_price: float = 0.0


class KS2ItemResponse(BaseModel):
    """Ответ с позицией КС-2"""
    id: int
    item_number: Optional[str]
    justification: Optional[str]
    name: str
    unit: str
    quantity_total: float
    quantity_done: float
    quantity_prev: float
    unit_price: float
    total: float
    
    class Config:
        from_attributes = True


class KS2Create(BaseModel):
    """Создание акта КС-2"""
    number: str
    act_date: date
    period_start: date
    period_end: date
    estimate_id: int
    contract_id: Optional[int] = None
    customer: Optional[str] = None
    contractor: Optional[str] = None
    object_name: Optional[str] = None
    object_address: Optional[str] = None


class KS2Response(BaseModel):
    """Ответ с данными КС-2"""
    id: int
    number: str
    act_date: date
    period_start: date
    period_end: date
    estimate_id: int
    customer: Optional[str]
    contractor: Optional[str]
    object_name: Optional[str]
    total_without_vat: float
    vat_amount: float
    total_with_vat: float
    status: KS2Status
    created_at: datetime
    
    class Config:
        from_attributes = True


class KS2ListResponse(BaseModel):
    """Список актов КС-2"""
    items: List[KS2Response]
    total: int


router = APIRouter()


@router.get("/", response_model=KS2ListResponse)
async def list_ks2_acts(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    estimate_id: Optional[int] = None,
    status: Optional[KS2Status] = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Список актов КС-2
    """
    query = select(KS2Act)
    
    if estimate_id:
        query = query.where(KS2Act.estimate_id == estimate_id)
    if status:
        query = query.where(KS2Act.status == status)
    
    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query)
    
    query = query.offset((page - 1) * per_page).limit(per_page)
    query = query.order_by(KS2Act.act_date.desc())
    
    result = await db.execute(query)
    acts = result.scalars().all()
    
    return KS2ListResponse(
        items=[KS2Response.model_validate(a) for a in acts],
        total=total or 0
    )


@router.post("/", response_model=KS2Response)
async def create_ks2_act(
    data: KS2Create,
    db: AsyncSession = Depends(get_db)
):
    """
    Создать акт КС-2
    """
    # Проверяем смету
    result = await db.execute(
        select(Estimate).where(Estimate.id == data.estimate_id)
    )
    estimate = result.scalar_one_or_none()
    if not estimate:
        raise HTTPException(status_code=404, detail="Смета не найдена")
    
    act = KS2Act(**data.model_dump())
    db.add(act)
    await db.flush()
    await db.refresh(act)
    
    return KS2Response.model_validate(act)


@router.post("/from-estimate/{estimate_id}", response_model=KS2Response)
async def create_ks2_from_estimate(
    estimate_id: int,
    act_date: date,
    period_start: date,
    period_end: date,
    db: AsyncSession = Depends(get_db)
):
    """
    Создать КС-2 на основе сметы (с копированием всех позиций)
    """
    # Загружаем смету
    result = await db.execute(
        select(Estimate).where(Estimate.id == estimate_id)
    )
    estimate = result.scalar_one_or_none()
    if not estimate:
        raise HTTPException(status_code=404, detail="Смета не найдена")
    
    # Генерируем номер акта
    count = await db.scalar(
        select(func.count()).select_from(KS2Act).where(KS2Act.estimate_id == estimate_id)
    )
    act_number = f"КС2-{estimate.number}-{(count or 0) + 1}"
    
    # Создаём акт
    act = KS2Act(
        number=act_number,
        act_date=act_date,
        period_start=period_start,
        period_end=period_end,
        estimate_id=estimate_id,
        object_name=estimate.name,
    )
    db.add(act)
    await db.flush()
    
    # Загружаем позиции сметы
    items_result = await db.execute(
        select(EstimateItem).where(EstimateItem.estimate_id == estimate_id)
    )
    estimate_items = items_result.scalars().all()
    
    # Создаём позиции КС-2
    for idx, est_item in enumerate(estimate_items, 1):
        ks2_item = KS2Item(
            act_id=act.id,
            estimate_item_id=est_item.id,
            item_number=str(idx),
            justification=est_item.justification,
            name=est_item.name,
            unit=est_item.unit,
            quantity_total=est_item.quantity,
            quantity_done=0,  # По умолчанию 0, заполняется пользователем
            quantity_prev=0,
            unit_price=est_item.total / est_item.quantity if est_item.quantity else 0,
        )
        db.add(ks2_item)
    
    await db.flush()
    await db.refresh(act)
    
    return KS2Response.model_validate(act)


@router.get("/{act_id}", response_model=KS2Response)
async def get_ks2_act(
    act_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Получить акт КС-2 по ID
    """
    result = await db.execute(
        select(KS2Act).where(KS2Act.id == act_id)
    )
    act = result.scalar_one_or_none()
    
    if not act:
        raise HTTPException(status_code=404, detail="Акт КС-2 не найден")
    
    return KS2Response.model_validate(act)


@router.get("/{act_id}/items", response_model=List[KS2ItemResponse])
async def get_ks2_items(
    act_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Получить позиции акта КС-2
    """
    result = await db.execute(
        select(KS2Item)
        .where(KS2Item.act_id == act_id)
        .order_by(KS2Item.order_index)
    )
    items = result.scalars().all()
    
    return [KS2ItemResponse.model_validate(item) for item in items]


@router.put("/{act_id}/items/{item_id}")
async def update_ks2_item(
    act_id: int,
    item_id: int,
    quantity_done: float,
    db: AsyncSession = Depends(get_db)
):
    """
    Обновить выполненный объём в позиции КС-2
    """
    result = await db.execute(
        select(KS2Item).where(
            KS2Item.id == item_id,
            KS2Item.act_id == act_id
        )
    )
    item = result.scalar_one_or_none()
    
    if not item:
        raise HTTPException(status_code=404, detail="Позиция не найдена")
    
    item.quantity_done = quantity_done
    item.total = quantity_done * item.unit_price
    
    await db.flush()
    
    return {"message": "Объём обновлён", "total": item.total}


@router.post("/{act_id}/recalculate", response_model=KS2Response)
async def recalculate_ks2(
    act_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Пересчитать итоги акта КС-2
    """
    result = await db.execute(
        select(KS2Act).where(KS2Act.id == act_id)
    )
    act = result.scalar_one_or_none()
    
    if not act:
        raise HTTPException(status_code=404, detail="Акт КС-2 не найден")
    
    # Загружаем позиции
    items_result = await db.execute(
        select(KS2Item).where(KS2Item.act_id == act_id)
    )
    items = items_result.scalars().all()
    
    # Пересчитываем
    act.total_without_vat = sum(item.total or 0 for item in items)
    act.vat_amount = act.total_without_vat * 0.20
    act.total_with_vat = act.total_without_vat + act.vat_amount
    
    await db.flush()
    await db.refresh(act)
    
    return KS2Response.model_validate(act)


@router.post("/{act_id}/sign")
async def sign_ks2_act(
    act_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Подписать акт КС-2
    """
    result = await db.execute(
        select(KS2Act).where(KS2Act.id == act_id)
    )
    act = result.scalar_one_or_none()
    
    if not act:
        raise HTTPException(status_code=404, detail="Акт КС-2 не найден")
    
    act.status = KS2Status.SIGNED
    act.signed_at = datetime.utcnow()
    
    await db.flush()
    
    return {"message": "Акт КС-2 подписан", "id": act_id}
