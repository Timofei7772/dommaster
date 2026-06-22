"""
API маршруты для смет.
"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from services.estimate_service import EstimateService
from services.estimate_validator import EstimateValidator
from services.autosave_service import AutoSaveService

router = APIRouter()


class EstimateCreate(BaseModel):
    project_id: str
    name: str
    overhead_percent: float = 15.0
    profit_percent: float = 20.0
    vat_percent: float = 0.0


class ItemCreate(BaseModel):
    section_id: str
    name: str
    unit: str = "м²"
    quantity: float = 0.0
    price_work: float = 0.0
    price_material: float = 0.0
    work_id: Optional[str] = None


class ItemUpdate(BaseModel):
    name: Optional[str] = None
    quantity: Optional[float] = None
    price_work: Optional[float] = None
    price_material: Optional[float] = None


class SectionCreate(BaseModel):
    name: str
    order_index: int = 0


@router.post("/")
async def create_estimate(data: EstimateCreate, db: AsyncSession = Depends(get_db)):
    svc = EstimateService(db)
    estimate = await svc.create_estimate(
        project_id=uuid.UUID(data.project_id),
        name=data.name,
        overhead_percent=data.overhead_percent,
        profit_percent=data.profit_percent,
        vat_percent=data.vat_percent,
    )
    return {"id": str(estimate.id), "number": estimate.estimate_number}


@router.get("/{estimate_id}")
async def get_estimate(estimate_id: str, db: AsyncSession = Depends(get_db)):
    svc = EstimateService(db)
    estimate = await svc.get_estimate(uuid.UUID(estimate_id))
    if not estimate:
        raise HTTPException(404, "Смета не найдена")

    return {
        "id": str(estimate.id),
        "number": estimate.estimate_number,
        "name": estimate.name,
        "version": estimate.version,
        "status": estimate.status.value,
        "total_works": estimate.total_works,
        "total_materials": estimate.total_materials,
        "total_cost": estimate.total_cost,
        "overhead_percent": estimate.overhead_percent,
        "profit_percent": estimate.profit_percent,
        "final_price": estimate.final_price,
        "ai_generated": estimate.ai_generated,
        "sections": [
            {
                "id": str(s.id),
                "name": s.name,
                "total_cost": s.total_cost,
                "items": [
                    {
                        "id": str(i.id),
                        "name": i.name,
                        "unit": i.unit,
                        "quantity": i.quantity,
                        "price_work": i.price_work,
                        "price_material": i.price_material,
                        "total_work": i.total_work,
                        "total_material": i.total_material,
                        "total_cost": i.total_cost,
                    }
                    for i in s.items
                ],
            }
            for s in estimate.sections
        ],
    }


@router.get("/project/{project_id}")
async def list_estimates(project_id: str, db: AsyncSession = Depends(get_db)):
    svc = EstimateService(db)
    estimates = await svc.list_estimates(uuid.UUID(project_id))
    return [
        {
            "id": str(e.id),
            "number": e.estimate_number,
            "name": e.name,
            "status": e.status.value,
            "final_price": e.final_price,
            "ai_generated": e.ai_generated,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in estimates
    ]


@router.post("/{estimate_id}/sections")
async def add_section(
    estimate_id: str, data: SectionCreate, db: AsyncSession = Depends(get_db),
):
    svc = EstimateService(db)
    section = await svc.add_section(
        uuid.UUID(estimate_id), data.name, data.order_index,
    )
    return {"id": str(section.id), "name": section.name}


@router.post("/{estimate_id}/items")
async def add_item(
    estimate_id: str, data: ItemCreate, db: AsyncSession = Depends(get_db),
):
    svc = EstimateService(db)
    item = await svc.add_item(
        estimate_id=uuid.UUID(estimate_id),
        section_id=uuid.UUID(data.section_id),
        name=data.name,
        unit=data.unit,
        quantity=data.quantity,
        price_work=data.price_work,
        price_material=data.price_material,
        work_id=uuid.UUID(data.work_id) if data.work_id else None,
    )
    return {
        "id": str(item.id),
        "name": item.name,
        "total_cost": item.total_cost,
    }


@router.put("/items/{item_id}")
async def update_item(
    item_id: str, data: ItemUpdate, db: AsyncSession = Depends(get_db),
):
    svc = EstimateService(db)
    kwargs = data.model_dump(exclude_unset=True)
    item = await svc.update_item(uuid.UUID(item_id), **kwargs)
    return {"id": str(item.id), "total_cost": item.total_cost}


@router.delete("/items/{item_id}")
async def delete_item(item_id: str, db: AsyncSession = Depends(get_db)):
    svc = EstimateService(db)
    await svc.delete_item(uuid.UUID(item_id))
    return {"status": "deleted"}


@router.post("/items/{item_id}/autosave")
async def autosave_item(
    item_id: str, data: ItemUpdate, db: AsyncSession = Depends(get_db),
):
    svc = AutoSaveService(db)
    changes = data.model_dump(exclude_unset=True)
    await svc.schedule_save(uuid.UUID(item_id), changes)
    return {"status": "scheduled"}


@router.post("/{estimate_id}/validate")
async def validate_estimate(estimate_id: str, db: AsyncSession = Depends(get_db)):
    validator = EstimateValidator(db)
    result = await validator.validate(uuid.UUID(estimate_id))
    return {
        "is_valid": result.is_valid,
        "errors": result.errors,
        "warnings": result.warnings,
    }


@router.post("/{estimate_id}/snapshot")
async def create_snapshot(estimate_id: str, db: AsyncSession = Depends(get_db)):
    svc = EstimateService(db)
    version = await svc.create_version_snapshot(uuid.UUID(estimate_id))
    return {"version": version.version_number}
