"""
Роутер для управления графиком платежей по проектам
"""

from datetime import date, datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, Field

from app.database import get_db
from app.models.payment import Payment
from app.models.project import Project
from app.models.user import User
from app.routers.auth import get_current_user
from app.routers.crm_stages import verify_project_access

router = APIRouter()


# --- Схемы данных ---

class PaymentCreate(BaseModel):
    description: str = Field(..., min_length=1, max_length=1000)
    planned_date: date
    planned_amount: float = Field(..., ge=0)


class PaymentUpdate(BaseModel):
    description: Optional[str] = None
    planned_date: Optional[date] = None
    planned_amount: Optional[float] = None
    actual_date: Optional[date] = None
    actual_amount: Optional[float] = None
    status: Optional[str] = None  # planned / paid / delayed


class PaymentConfirmRequest(BaseModel):
    actual_amount: float = Field(..., ge=0)
    actual_date: Optional[date] = None


class PaymentResponse(BaseModel):
    id: int
    project_id: int
    description: str
    planned_date: date
    planned_amount: float
    actual_date: Optional[date] = None
    actual_amount: float
    status: str
    paid_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class PaymentStatsResponse(BaseModel):
    total_planned: float
    total_paid: float
    total_remaining: float
    payments: List[PaymentResponse]


# --- Эндпоинты ---

@router.get("/project/{project_id}", response_model=PaymentStatsResponse)
async def list_payments(
    project_id: int,
    start_date: Optional[date] = Query(None, description="Фильтр по дате с"),
    end_date: Optional[date] = Query(None, description="Фильтр по дате по"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить график платежей по проекту с агрегированной статистикой и фильтрацией по датам"""
    await verify_project_access(project_id, current_user, db)

    query = select(Payment).where(Payment.project_id == project_id)

    if start_date:
        query = query.where(Payment.planned_date >= start_date)
    if end_date:
        query = query.where(Payment.planned_date <= end_date)

    query = query.order_by(Payment.planned_date.asc())
    result = await db.execute(query)
    payments = result.scalars().all()

    # Считаем тоталы
    total_planned = sum(p.planned_amount for p in payments)
    total_paid = sum(p.actual_amount for p in payments if p.status == "paid")
    total_remaining = max(0.0, total_planned - total_paid)

    return {
        "total_planned": total_planned,
        "total_paid": total_paid,
        "total_remaining": total_remaining,
        "payments": payments
    }


@router.post("/project/{project_id}", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
async def create_payment(
    project_id: int,
    data: PaymentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Запланировать новый платеж по проекту"""
    await verify_project_access(project_id, current_user, db)

    payment = Payment(
        project_id=project_id,
        description=data.description,
        planned_date=data.planned_date,
        planned_amount=data.planned_amount,
        status="planned"
    )
    db.add(payment)
    await db.commit()
    return payment


@router.put("/{payment_id}", response_model=PaymentResponse)
async def update_payment(
    payment_id: int,
    data: PaymentUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Обновить информацию о платеже"""
    result = await db.execute(
        select(Payment)
        .where(Payment.id == payment_id)
        .options(selectinload(Payment.project))
    )
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Платеж не найден")

    # Проверка доступа
    if payment.project.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Нет прав доступа")

    update_data = data.model_dump(exclude_unset=True)
    for key, val in update_data.items():
        setattr(payment, key, val)

    # Если статус меняется на paid и не было actual_amount, устанавливаем плановое значение
    if data.status == "paid" and not payment.actual_amount:
        payment.actual_amount = payment.planned_amount
        payment.actual_date = date.today()
        payment.paid_at = datetime.utcnow()

    await db.commit()
    return payment


@router.post("/{payment_id}/confirm", response_model=PaymentResponse)
async def confirm_payment_received(
    payment_id: int,
    data: PaymentConfirmRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Подтвердить получение платежа (перевод в статус paid)"""
    result = await db.execute(
        select(Payment)
        .where(Payment.id == payment_id)
        .options(selectinload(Payment.project))
    )
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Платеж не найден")

    # Проверка доступа
    if payment.project.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Нет прав доступа")

    payment.status = "paid"
    payment.actual_amount = data.actual_amount
    payment.actual_date = data.actual_date or date.today()
    payment.paid_at = datetime.utcnow()

    # Добавляем вspent по проекту, если необходимо, или просто коммитим
    await db.commit()
    return payment


@router.delete("/{payment_id}")
async def delete_payment(
    payment_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Удалить запланированный платеж"""
    result = await db.execute(
        select(Payment)
        .where(Payment.id == payment_id)
        .options(selectinload(Payment.project))
    )
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Платеж не найден")

    # Проверка доступа
    if payment.project.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Нет прав доступа")

    await db.delete(payment)
    await db.commit()
    return {"success": True, "detail": "Платеж удален"}
