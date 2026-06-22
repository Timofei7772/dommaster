"""
API для работы со справочником работ
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from typing import List, Optional
from pydantic import BaseModel

from app.database import get_db
from app.models.work import Work, WorkCategory


class WorkResponse(BaseModel):
    """Ответ с данными работы"""
    id: int
    code: Optional[str]
    name: str
    full_name: Optional[str]
    unit: str
    materials_price: float
    labor_price: float
    machines_price: float
    total_price: float
    source: Optional[str]
    
    class Config:
        from_attributes = True


class WorkCategoryResponse(BaseModel):
    """Ответ с категорией работ"""
    id: int
    code: Optional[str]
    name: str
    level: int
    
    class Config:
        from_attributes = True


class WorkSearchResult(BaseModel):
    """Результат поиска работ"""
    items: List[WorkResponse]
    total: int
    query: str


router = APIRouter()


@router.get("/search", response_model=WorkSearchResult)
async def search_works(
    q: str = Query(..., min_length=2, description="Поисковый запрос"),
    category_id: Optional[int] = None,
    source: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db)
):
    """
    Поиск работ по названию или коду
    
    Примеры запросов:
    - "укладка плитки"
    - "ТЕР11-01-001"
    - "штукатурка стен"
    """
    query = select(Work).where(Work.is_active == True)
    
    # Поиск по имени и коду
    search_terms = q.split()
    conditions = []
    for term in search_terms:
        term_pattern = f"%{term}%"
        conditions.append(
            or_(
                Work.name.ilike(term_pattern),
                Work.code.ilike(term_pattern),
                Work.full_name.ilike(term_pattern)
            )
        )
    
    if conditions:
        query = query.where(*conditions)
    
    # Фильтр по категории
    if category_id:
        query = query.where(Work.category_id == category_id)
    
    # Фильтр по источнику
    if source:
        query = query.where(Work.source == source)
    
    # Сначала популярные, потом по релевантности
    query = query.order_by(Work.is_popular.desc(), Work.name)
    query = query.limit(limit)
    
    result = await db.execute(query)
    works = result.scalars().all()
    
    return WorkSearchResult(
        items=[WorkResponse.model_validate(w) for w in works],
        total=len(works),
        query=q
    )


@router.get("/categories", response_model=List[WorkCategoryResponse])
async def get_categories(
    parent_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Получить категории работ
    """
    query = select(WorkCategory)
    
    if parent_id is not None:
        query = query.where(WorkCategory.parent_id == parent_id)
    else:
        query = query.where(WorkCategory.parent_id == None)
    
    query = query.order_by(WorkCategory.code)
    
    result = await db.execute(query)
    categories = result.scalars().all()
    
    return [WorkCategoryResponse.model_validate(c) for c in categories]


@router.get("/{work_id}", response_model=WorkResponse)
async def get_work(
    work_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Получить работу по ID
    """
    result = await db.execute(
        select(Work).where(Work.id == work_id)
    )
    work = result.scalar_one_or_none()
    
    if not work:
        raise HTTPException(status_code=404, detail="Работа не найдена")
    
    return WorkResponse.model_validate(work)


@router.get("/popular/list", response_model=List[WorkResponse])
async def get_popular_works(
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db)
):
    """
    Получить популярные работы (часто используемые)
    """
    query = select(Work).where(
        Work.is_active == True,
        Work.is_popular == True
    ).limit(limit)
    
    result = await db.execute(query)
    works = result.scalars().all()
    
    return [WorkResponse.model_validate(w) for w in works]


@router.post("/{work_id}/mark-popular")
async def mark_as_popular(
    work_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Отметить работу как популярную
    """
    result = await db.execute(
        select(Work).where(Work.id == work_id)
    )
    work = result.scalar_one_or_none()
    
    if not work:
        raise HTTPException(status_code=404, detail="Работа не найдена")
    
    work.is_popular = True
    await db.flush()
    
    return {"message": "Работа отмечена как популярная", "id": work_id}
