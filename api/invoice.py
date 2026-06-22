"""
API маршруты для счетов.
"""
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Invoice, InvoiceItem, InvoiceStatus

router = APIRouter()


class InvoiceItemCreate(BaseModel):
    description: str
    quantity: float = 1.0
    unit_price: float = 0.0


class InvoiceCreate(BaseModel):
    project_id: str
    client_id: str
    number: str
    due_date: Optional[datetime] = None
    notes: Optional[str] = None
    items: Optional[list[InvoiceItemCreate]] = None


class InvoiceUpdate(BaseModel):
    number: Optional[str] = None
    due_date: Optional[datetime] = None
    status: Optional[str] = None
    notes: Optional[str] = None


@router.get("/")
async def list_invoices(project_id: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    query = select(Invoice)
    if project_id:
        query = query.where(Invoice.project_id == uuid.UUID(project_id))
    query = query.order_by(Invoice.date_issued.desc())
    return [
        {
            "id": str(i.id), "number": i.number,
            "project_id": str(i.project_id), "client_id": str(i.client_id),
            "status": i.status.value, "total_amount": i.total_amount,
            "date_issued": i.date_issued.isoformat(),
        }
        for i in (await db.execute(query)).scalars().all()
    ]


@router.post("/")
async def create_invoice(data: InvoiceCreate, db: AsyncSession = Depends(get_db)):
    inv = Invoice(
        project_id=uuid.UUID(data.project_id),
        client_id=uuid.UUID(data.client_id),
        number=data.number,
        due_date=data.due_date,
        notes=data.notes,
    )
    if data.items:
        for item_data in data.items:
            item = InvoiceItem(
                invoice=inv,
                description=item_data.description,
                quantity=item_data.quantity,
                unit_price=item_data.unit_price,
                total_price=item_data.quantity * item_data.unit_price,
            )
            db.add(item)
        inv.total_amount = sum(item.total_price for item in inv.items)
    db.add(inv)
    await db.flush()
    return {"id": str(inv.id), "number": inv.number}


@router.get("/{invoice_id}")
async def get_invoice(invoice_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Invoice).where(Invoice.id == uuid.UUID(invoice_id)))
    inv = result.scalar_one_or_none()
    if not inv:
        raise HTTPException(404, "Счёт не найден")
    return {
        "id": str(inv.id), "number": inv.number,
        "project_id": str(inv.project_id), "client_id": str(inv.client_id),
        "status": inv.status.value, "total_amount": inv.total_amount,
        "date_issued": inv.date_issued.isoformat(),
        "due_date": inv.due_date.isoformat() if inv.due_date else None,
        "notes": inv.notes,
        "items": [
            {"id": str(it.id), "description": it.description,
             "quantity": it.quantity, "unit_price": it.unit_price,
             "total_price": it.total_price}
            for it in inv.items
        ],
    }


@router.put("/{invoice_id}")
async def update_invoice(invoice_id: str, data: InvoiceUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Invoice).where(Invoice.id == uuid.UUID(invoice_id)))
    inv = result.scalar_one_or_none()
    if not inv:
        raise HTTPException(404, "Счёт не найден")
    for field, value in data.model_dump(exclude_unset=True).items():
        if field == "status" and value:
            setattr(inv, field, InvoiceStatus(value))
        elif value is not None:
            setattr(inv, field, value)
    await db.flush()
    return {"id": str(inv.id), "status": "updated"}


@router.delete("/{invoice_id}")
async def delete_invoice(invoice_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Invoice).where(Invoice.id == uuid.UUID(invoice_id)))
    inv = result.scalar_one_or_none()
    if not inv:
        raise HTTPException(404, "Счёт не найден")
    await db.delete(inv)
    await db.flush()
    return {"status": "deleted"}
