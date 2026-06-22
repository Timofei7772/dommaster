"""
API роутер для локальных цен Башкортостан
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

from app.database import get_db
from app.models.local_price import LocalPrice

router = APIRouter()


class PriceCreate(BaseModel):
    category: str
    name: str
    unit: str
    price: float
    city: str
    region: str = "Башкортостан"


class PriceUpdate(BaseModel):
    category: Optional[str] = None
    name: Optional[str] = None
    unit: Optional[str] = None
    price: Optional[float] = None
    city: Optional[str] = None


class PriceResponse(BaseModel):
    id: int
    category: str
    name: str
    unit: str
    price: float
    region: str
    city: str
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("/local", response_model=List[PriceResponse])
async def get_local_prices(
    city: str = Query("", description="Фильтр по городу"),
    category: str = Query("", description="Фильтр по категории"),
    search: str = Query("", description="Поиск по названию"),
    limit: int = Query(100, le=500),
    db: AsyncSession = Depends(get_db),
):
    """Получить локальные цены с фильтрацией"""
    query = select(LocalPrice)

    if city and city != "Все":
        query = query.where(LocalPrice.city.ilike(f"%{city}%"))
    if category and category != "Все":
        query = query.where(LocalPrice.category.ilike(f"%{category}%"))
    if search:
        query = query.where(LocalPrice.name.ilike(f"%{search}%"))

    query = query.order_by(LocalPrice.updated_at.desc()).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/local", response_model=PriceResponse)
async def create_local_price(price: PriceCreate, db: AsyncSession = Depends(get_db)):
    """Добавить новую локальную цену"""
    db_price = LocalPrice(**price.model_dump())
    db.add(db_price)
    await db.flush()
    await db.refresh(db_price)
    return db_price


@router.put("/local/{price_id}", response_model=PriceResponse)
async def update_local_price(price_id: int, price: PriceUpdate, db: AsyncSession = Depends(get_db)):
    """Обновить локальную цену"""
    result = await db.execute(select(LocalPrice).where(LocalPrice.id == price_id))
    db_price = result.scalar_one_or_none()
    if not db_price:
        raise HTTPException(status_code=404, detail="Цена не найдена")

    for key, value in price.model_dump(exclude_unset=True).items():
        setattr(db_price, key, value)
    await db.flush()
    await db.refresh(db_price)
    return db_price


@router.get("/local/regions")
async def get_regions(db: AsyncSession = Depends(get_db)):
    """Список доступных городов"""
    result = await db.execute(select(LocalPrice.city).distinct().order_by(LocalPrice.city))
    cities = [row[0] for row in result.all() if row[0]]
    return {"cities": cities or ["Салават", "Стерлитамак", "Ишимбай"], "region": "Башкортостан"}
