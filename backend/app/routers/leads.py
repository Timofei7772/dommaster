"""
API роутер для лидогенерации
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from pydantic import BaseModel

from app.database import get_db
from app.leads.lead_service import LeadService


# Схемы
class LeadSearchRequest(BaseModel):
    query: str = "ремонт квартиры"
    sources: Optional[List[str]] = None
    location: str = "москва"
    limit: int = 20


class ConvertLeadRequest(BaseModel):
    title: str
    description: str
    source: str = "manual"
    url: Optional[str] = None
    price: Optional[float] = None
    contact: Optional[str] = None


router = APIRouter()


@router.post("/search")
async def search_leads(
    request: LeadSearchRequest,
    db: AsyncSession = Depends(get_db),
):
    """Поиск лидов на площадках"""
    service = LeadService(db)
    return await service.search_leads(
        query=request.query,
        sources=request.sources,
        location=request.location,
        limit=request.limit,
    )


@router.get("/sources")
async def get_lead_sources(db: AsyncSession = Depends(get_db)):
    """Доступные источники лидов"""
    service = LeadService(db)
    return service.available_sources()


@router.post("/convert")
async def convert_lead_to_client(
    request: ConvertLeadRequest,
    db: AsyncSession = Depends(get_db),
):
    """Конвертировать лид в клиента"""
    service = LeadService(db)
    client = await service.convert_lead_to_client(request.model_dump())
    return {
        "client_id": client.id,
        "name": client.name,
        "detail": "Клиент создан из лида",
    }
