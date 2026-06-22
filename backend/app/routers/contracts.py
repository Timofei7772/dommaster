"""
API для работы с договорами
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional
from pydantic import BaseModel
from datetime import date, datetime

from app.database import get_db
from app.models.contract import Contract, ContractType, ContractStatus, AdditionalAgreement


class ContractCreate(BaseModel):
    """Создание договора"""
    number: str
    contract_date: date
    contract_type: ContractType
    customer_name: str
    customer_address: Optional[str] = None
    customer_inn: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_email: Optional[str] = None
    customer_passport: Optional[str] = None
    object_name: Optional[str] = None
    object_address: Optional[str] = None
    total_amount: float = 0.0
    advance_percent: float = 0.0
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    notes: Optional[str] = None


class ContractResponse(BaseModel):
    """Ответ с данными договора"""
    id: int
    number: str
    contract_date: date
    contract_type: ContractType
    status: ContractStatus
    customer_name: str
    customer_address: Optional[str]
    customer_inn: Optional[str]
    customer_phone: Optional[str]
    object_name: Optional[str]
    object_address: Optional[str]
    total_amount: float
    advance_amount: float
    advance_percent: float
    start_date: Optional[date]
    end_date: Optional[date]
    created_at: datetime
    
    class Config:
        from_attributes = True


class ContractListResponse(BaseModel):
    """Список договоров"""
    items: List[ContractResponse]
    total: int
    page: int
    pages: int


class AdditionalAgreementCreate(BaseModel):
    """Создание дополнительного соглашения"""
    number: str
    agreement_date: date
    agreement_type: str  # additional, replacement, independent
    description: Optional[str] = None
    amount_change: float = 0.0


class AdditionalAgreementResponse(BaseModel):
    """Ответ с доп. соглашением"""
    id: int
    contract_id: int
    number: str
    agreement_date: date
    agreement_type: str
    description: Optional[str]
    amount_change: float
    created_at: datetime
    
    class Config:
        from_attributes = True


router = APIRouter()


@router.get("/", response_model=ContractListResponse)
async def list_contracts(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    contract_type: Optional[ContractType] = None,
    status: Optional[ContractStatus] = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Список договоров
    """
    query = select(Contract)
    
    if search:
        query = query.where(
            Contract.customer_name.ilike(f"%{search}%") |
            Contract.number.ilike(f"%{search}%") |
            Contract.object_name.ilike(f"%{search}%")
        )
    if contract_type:
        query = query.where(Contract.contract_type == contract_type)
    if status:
        query = query.where(Contract.status == status)
    
    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query)
    
    query = query.offset((page - 1) * per_page).limit(per_page)
    query = query.order_by(Contract.contract_date.desc())
    
    result = await db.execute(query)
    contracts = result.scalars().all()
    
    return ContractListResponse(
        items=[ContractResponse.model_validate(c) for c in contracts],
        total=total or 0,
        page=page,
        pages=(total or 0 + per_page - 1) // per_page
    )


@router.post("/", response_model=ContractResponse)
async def create_contract(
    data: ContractCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Создать договор
    """
    contract = Contract(**data.model_dump())
    
    # Расчёт аванса
    if contract.advance_percent > 0:
        contract.advance_amount = contract.total_amount * (contract.advance_percent / 100)
    
    db.add(contract)
    await db.flush()
    await db.refresh(contract)
    
    return ContractResponse.model_validate(contract)


@router.get("/{contract_id}", response_model=ContractResponse)
async def get_contract(
    contract_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Получить договор по ID
    """
    result = await db.execute(
        select(Contract).where(Contract.id == contract_id)
    )
    contract = result.scalar_one_or_none()
    
    if not contract:
        raise HTTPException(status_code=404, detail="Договор не найден")
    
    return ContractResponse.model_validate(contract)


@router.put("/{contract_id}", response_model=ContractResponse)
async def update_contract(
    contract_id: int,
    data: ContractCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Обновить договор
    """
    result = await db.execute(
        select(Contract).where(Contract.id == contract_id)
    )
    contract = result.scalar_one_or_none()
    
    if not contract:
        raise HTTPException(status_code=404, detail="Договор не найден")
    
    for key, value in data.model_dump().items():
        setattr(contract, key, value)
    
    # Пересчёт аванса
    if contract.advance_percent > 0:
        contract.advance_amount = contract.total_amount * (contract.advance_percent / 100)
    
    await db.flush()
    await db.refresh(contract)
    
    return ContractResponse.model_validate(contract)


@router.delete("/{contract_id}")
async def delete_contract(
    contract_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Удалить договор
    """
    result = await db.execute(
        select(Contract).where(Contract.id == contract_id)
    )
    contract = result.scalar_one_or_none()
    
    if not contract:
        raise HTTPException(status_code=404, detail="Договор не найден")
    
    await db.delete(contract)
    
    return {"message": "Договор удалён", "id": contract_id}


# Дополнительные соглашения
@router.get("/{contract_id}/agreements", response_model=List[AdditionalAgreementResponse])
async def get_additional_agreements(
    contract_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Получить дополнительные соглашения к договору
    """
    result = await db.execute(
        select(AdditionalAgreement)
        .where(AdditionalAgreement.contract_id == contract_id)
        .order_by(AdditionalAgreement.agreement_date)
    )
    agreements = result.scalars().all()
    
    return [AdditionalAgreementResponse.model_validate(a) for a in agreements]


@router.post("/{contract_id}/agreements", response_model=AdditionalAgreementResponse)
async def create_additional_agreement(
    contract_id: int,
    data: AdditionalAgreementCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Создать дополнительное соглашение
    """
    # Проверяем договор
    result = await db.execute(
        select(Contract).where(Contract.id == contract_id)
    )
    contract = result.scalar_one_or_none()
    
    if not contract:
        raise HTTPException(status_code=404, detail="Договор не найден")
    
    agreement = AdditionalAgreement(
        contract_id=contract_id,
        **data.model_dump()
    )
    db.add(agreement)
    
    # Обновляем сумму договора
    if data.amount_change != 0:
        contract.total_amount += data.amount_change
    
    await db.flush()
    await db.refresh(agreement)
    
    return AdditionalAgreementResponse.model_validate(agreement)


@router.post("/{contract_id}/complete")
async def complete_contract(
    contract_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Завершить договор
    """
    result = await db.execute(
        select(Contract).where(Contract.id == contract_id)
    )
    contract = result.scalar_one_or_none()
    
    if not contract:
        raise HTTPException(status_code=404, detail="Договор не найден")
    
    contract.status = ContractStatus.COMPLETED
    await db.flush()
    
    return {"message": "Договор завершён", "id": contract_id}
