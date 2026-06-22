"""
API для работы со справками КС-3
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional
from pydantic import BaseModel
from datetime import date, datetime

from app.database import get_db
from app.models.ks3 import KS3Certificate, KS3Item, KS3Status
from app.models.ks2 import KS2Act


class KS3ItemCreate(BaseModel):
    """Создание позиции КС-3"""
    ks2_act_id: int
    item_number: Optional[str] = None
    name: str
    total_from_start: float = 0.0
    total_from_year_start: float = 0.0
    total_current_period: float = 0.0


class KS3ItemResponse(BaseModel):
    """Ответ с позицией КС-3"""
    id: int
    ks2_act_id: int
    item_number: Optional[str]
    name: str
    total_from_start: float
    total_from_year_start: float
    total_current_period: float
    
    class Config:
        from_attributes = True


class KS3Create(BaseModel):
    """Создание справки КС-3"""
    number: str
    certificate_date: date
    period_start: date
    period_end: date
    contract_id: Optional[int] = None
    customer: Optional[str] = None
    contractor: Optional[str] = None
    object_name: Optional[str] = None
    total_contract: float = 0.0


class KS3Response(BaseModel):
    """Ответ с данными КС-3"""
    id: int
    number: str
    certificate_date: date
    period_start: date
    period_end: date
    customer: Optional[str]
    contractor: Optional[str]
    object_name: Optional[str]
    total_contract: float
    total_from_start: float
    total_from_year_start: float
    total_current_period: float
    vat_amount: float
    total_with_vat: float
    status: KS3Status
    created_at: datetime
    
    class Config:
        from_attributes = True


router = APIRouter()


@router.get("/", response_model=List[KS3Response])
async def list_ks3_certificates(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    contract_id: Optional[int] = None,
    status: Optional[KS3Status] = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Список справок КС-3
    """
    query = select(KS3Certificate)
    
    if contract_id:
        query = query.where(KS3Certificate.contract_id == contract_id)
    if status:
        query = query.where(KS3Certificate.status == status)
    
    query = query.offset((page - 1) * per_page).limit(per_page)
    query = query.order_by(KS3Certificate.certificate_date.desc())
    
    result = await db.execute(query)
    certs = result.scalars().all()
    
    return [KS3Response.model_validate(c) for c in certs]


@router.post("/", response_model=KS3Response)
async def create_ks3_certificate(
    data: KS3Create,
    db: AsyncSession = Depends(get_db)
):
    """
    Создать справку КС-3
    """
    cert = KS3Certificate(**data.model_dump())
    db.add(cert)
    await db.flush()
    await db.refresh(cert)
    
    return KS3Response.model_validate(cert)


@router.post("/from-ks2-acts", response_model=KS3Response)
async def create_ks3_from_ks2(
    ks2_act_ids: List[int],
    certificate_date: date,
    period_start: date,
    period_end: date,
    contract_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Создать КС-3 на основе нескольких актов КС-2
    """
    # Загружаем акты КС-2
    result = await db.execute(
        select(KS2Act).where(KS2Act.id.in_(ks2_act_ids))
    )
    ks2_acts = result.scalars().all()
    
    if not ks2_acts:
        raise HTTPException(status_code=404, detail="Акты КС-2 не найдены")
    
    # Генерируем номер
    count = await db.scalar(select(func.count()).select_from(KS3Certificate))
    cert_number = f"КС3-{(count or 0) + 1:04d}"
    
    # Рассчитываем суммы
    total_current = sum(act.total_with_vat or 0 for act in ks2_acts)
    
    # Создаём справку
    cert = KS3Certificate(
        number=cert_number,
        certificate_date=certificate_date,
        period_start=period_start,
        period_end=period_end,
        contract_id=contract_id,
        customer=ks2_acts[0].customer if ks2_acts else None,
        contractor=ks2_acts[0].contractor if ks2_acts else None,
        object_name=ks2_acts[0].object_name if ks2_acts else None,
        total_current_period=total_current,
    )
    db.add(cert)
    await db.flush()
    
    # Создаём связи с КС-2
    for idx, act in enumerate(ks2_acts, 1):
        item = KS3Item(
            certificate_id=cert.id,
            ks2_act_id=act.id,
            item_number=str(idx),
            name=f"Акт КС-2 №{act.number} от {act.act_date}",
            total_current_period=act.total_with_vat or 0,
        )
        db.add(item)
    
    await db.flush()
    await db.refresh(cert)
    
    return KS3Response.model_validate(cert)


@router.get("/{cert_id}", response_model=KS3Response)
async def get_ks3_certificate(
    cert_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Получить справку КС-3 по ID
    """
    result = await db.execute(
        select(KS3Certificate).where(KS3Certificate.id == cert_id)
    )
    cert = result.scalar_one_or_none()
    
    if not cert:
        raise HTTPException(status_code=404, detail="Справка КС-3 не найдена")
    
    return KS3Response.model_validate(cert)


@router.get("/{cert_id}/items", response_model=List[KS3ItemResponse])
async def get_ks3_items(
    cert_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Получить позиции справки КС-3
    """
    result = await db.execute(
        select(KS3Item)
        .where(KS3Item.certificate_id == cert_id)
        .order_by(KS3Item.order_index)
    )
    items = result.scalars().all()
    
    return [KS3ItemResponse.model_validate(item) for item in items]


@router.post("/{cert_id}/recalculate", response_model=KS3Response)
async def recalculate_ks3(
    cert_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Пересчитать итоги справки КС-3
    """
    result = await db.execute(
        select(KS3Certificate).where(KS3Certificate.id == cert_id)
    )
    cert = result.scalar_one_or_none()
    
    if not cert:
        raise HTTPException(status_code=404, detail="Справка КС-3 не найдена")
    
    # Загружаем позиции
    items_result = await db.execute(
        select(KS3Item).where(KS3Item.certificate_id == cert_id)
    )
    items = items_result.scalars().all()
    
    # Пересчитываем
    cert.total_current_period = sum(item.total_current_period or 0 for item in items)
    cert.total_from_start = sum(item.total_from_start or 0 for item in items)
    cert.total_from_year_start = sum(item.total_from_year_start or 0 for item in items)
    
    cert.vat_amount = cert.total_current_period * 0.20 / 1.20  # НДС из суммы с НДС
    cert.total_with_vat = cert.total_current_period
    
    await db.flush()
    await db.refresh(cert)
    
    return KS3Response.model_validate(cert)


@router.post("/{cert_id}/sign")
async def sign_ks3_certificate(
    cert_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Подписать справку КС-3
    """
    result = await db.execute(
        select(KS3Certificate).where(KS3Certificate.id == cert_id)
    )
    cert = result.scalar_one_or_none()
    
    if not cert:
        raise HTTPException(status_code=404, detail="Справка КС-3 не найдена")
    
    cert.status = KS3Status.SIGNED
    cert.signed_at = datetime.utcnow()
    
    await db.flush()
    
    return {"message": "Справка КС-3 подписана", "id": cert_id}
