"""
API для работы со справочником материалов
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from typing import List, Optional
from pydantic import BaseModel

from app.database import get_db
from app.models.material import Material, MaterialCategory


class MaterialResponse(BaseModel):
    """Ответ с данными материала"""
    id: int
    code: Optional[str]
    name: str
    full_name: Optional[str]
    unit: str
    base_price: float
    current_price: float
    supplier: Optional[str]
    article: Optional[str]
    
    class Config:
        from_attributes = True


class MaterialCategoryResponse(BaseModel):
    """Категория материалов"""
    id: int
    code: Optional[str]
    name: str
    level: int
    
    class Config:
        from_attributes = True


class MaterialSearchResult(BaseModel):
    """Результат поиска материалов"""
    items: List[MaterialResponse]
    total: int
    query: str


router = APIRouter()


@router.get("/search", response_model=MaterialSearchResult)
async def search_materials(
    q: str = Query(..., min_length=2),
    category_id: Optional[int] = None,
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db)
):
    """
    Поиск материалов по названию или коду
    """
    query = select(Material).where(Material.is_active == True)
    
    # Поиск
    search_terms = q.split()
    conditions = []
    for term in search_terms:
        term_pattern = f"%{term}%"
        conditions.append(
            or_(
                Material.name.ilike(term_pattern),
                Material.code.ilike(term_pattern),
                Material.article.ilike(term_pattern)
            )
        )
    
    if conditions:
        query = query.where(*conditions)
    
    if category_id:
        query = query.where(Material.category_id == category_id)
    
    query = query.order_by(Material.is_popular.desc(), Material.name)
    query = query.limit(limit)
    
    result = await db.execute(query)
    materials = result.scalars().all()
    
    return MaterialSearchResult(
        items=[MaterialResponse.model_validate(m) for m in materials],
        total=len(materials),
        query=q
    )


@router.get("/categories", response_model=List[MaterialCategoryResponse])
async def get_categories(
    parent_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Получить категории материалов
    """
    query = select(MaterialCategory)
    
    if parent_id is not None:
        query = query.where(MaterialCategory.parent_id == parent_id)
    else:
        query = query.where(MaterialCategory.parent_id == None)
    
    query = query.order_by(MaterialCategory.name)
    
    result = await db.execute(query)
    categories = result.scalars().all()
    
    return [MaterialCategoryResponse.model_validate(c) for c in categories]


@router.get("/{material_id}", response_model=MaterialResponse)
async def get_material(
    material_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Получить материал по ID
    """
    result = await db.execute(
        select(Material).where(Material.id == material_id)
    )
    material = result.scalar_one_or_none()
    
    if not material:
        raise HTTPException(status_code=404, detail="Материал не найден")
    
    return MaterialResponse.model_validate(material)


@router.put("/{material_id}/price")
async def update_material_price(
    material_id: int,
    new_price: float,
    source: Optional[str] = "manual",
    db: AsyncSession = Depends(get_db)
):
    """
    Обновить цену материала
    """
    result = await db.execute(
        select(Material).where(Material.id == material_id)
    )
    material = result.scalar_one_or_none()
    
    if not material:
        raise HTTPException(status_code=404, detail="Материал не найден")
    
    material.current_price = new_price
    
    await db.flush()
    
    return {
        "message": "Цена обновлена",
        "id": material_id,
        "new_price": new_price
    }


@router.get("/popular/list", response_model=List[MaterialResponse])
async def get_popular_materials(
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db)
):
    """
    Получить популярные материалы
    """
    query = select(Material).where(
        Material.is_active == True,
        Material.is_popular == True
    ).limit(limit)
    
    result = await db.execute(query)
    materials = result.scalars().all()
    
    return [MaterialResponse.model_validate(m) for m in materials]
