"""
API маршруты для ресурсов.
"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Resource, ResourceType

router = APIRouter()


class ResourceCreate(BaseModel):
    name: str
    type: Optional[str] = "worker"
    description: Optional[str] = None
    unit: Optional[str] = "шт"
    quantity_total: Optional[float] = 1.0
    cost_per_unit: Optional[float] = 0.0


class ResourceUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    description: Optional[str] = None
    unit: Optional[str] = None
    quantity_total: Optional[float] = None
    quantity_available: Optional[float] = None
    cost_per_unit: Optional[float] = None


@router.get("/")
async def list_resources(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Resource).order_by(Resource.created_at.desc()))
    return [
        {
            "id": str(r.id), "name": r.name, "type": r.type.value,
            "quantity_total": r.quantity_total, "quantity_available": r.quantity_available,
            "cost_per_unit": r.cost_per_unit,
        }
        for r in result.scalars().all()
    ]


@router.post("/")
async def create_resource(data: ResourceCreate, db: AsyncSession = Depends(get_db)):
    r = Resource(
        name=data.name,
        type=ResourceType(data.type) if data.type else ResourceType.WORKER,
        description=data.description, unit=data.unit,
        quantity_total=data.quantity_total, cost_per_unit=data.cost_per_unit,
    )
    db.add(r)
    await db.flush()
    return {"id": str(r.id), "name": r.name}


@router.get("/{resource_id}")
async def get_resource(resource_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Resource).where(Resource.id == uuid.UUID(resource_id)))
    r = result.scalar_one_or_none()
    if not r:
        raise HTTPException(404, "Ресурс не найден")
    return {"id": str(r.id), "name": r.name, "type": r.type.value,
            "description": r.description, "unit": r.unit,
            "quantity_total": r.quantity_total, "quantity_available": r.quantity_available,
            "cost_per_unit": r.cost_per_unit}


@router.put("/{resource_id}")
async def update_resource(resource_id: str, data: ResourceUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Resource).where(Resource.id == uuid.UUID(resource_id)))
    r = result.scalar_one_or_none()
    if not r:
        raise HTTPException(404, "Ресурс не найден")
    for field, value in data.model_dump(exclude_unset=True).items():
        if field == "type" and value:
            setattr(r, field, ResourceType(value))
        elif value is not None:
            setattr(r, field, value)
    await db.flush()
    return {"id": str(r.id), "status": "updated"}


@router.delete("/{resource_id}")
async def delete_resource(resource_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Resource).where(Resource.id == uuid.UUID(resource_id)))
    r = result.scalar_one_or_none()
    if not r:
        raise HTTPException(404, "Ресурс не найден")
    await db.delete(r)
    await db.flush()
    return {"status": "deleted"}
