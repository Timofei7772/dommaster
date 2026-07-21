"""
API роутер для клиентов
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from pydantic import ConfigDict, BaseModel, Field
from datetime import datetime

from app.database import get_db
from app.models.user import User
from app.repositories.client_repository import ClientRepository
from app.routers.auth import get_current_user
from app.services.audit_service import AuditService


# Схемы
class ClientCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=500)
    phone: Optional[str] = None
    email: Optional[str] = None
    company: Optional[str] = None
    inn: Optional[str] = None
    kpp: Optional[str] = None
    legal_address: Optional[str] = None
    actual_address: Optional[str] = None
    bank_name: Optional[str] = None
    bik: Optional[str] = None
    checking_account: Optional[str] = None
    corr_account: Optional[str] = None
    contact_person: Optional[str] = None
    contact_position: Optional[str] = None
    client_type: str = "individual"
    lead_source: Optional[str] = None
    notes: Optional[str] = None


class ClientUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    company: Optional[str] = None
    inn: Optional[str] = None
    kpp: Optional[str] = None
    legal_address: Optional[str] = None
    actual_address: Optional[str] = None
    bank_name: Optional[str] = None
    bik: Optional[str] = None
    checking_account: Optional[str] = None
    corr_account: Optional[str] = None
    contact_person: Optional[str] = None
    contact_position: Optional[str] = None
    client_type: Optional[str] = None
    lead_source: Optional[str] = None
    notes: Optional[str] = None


class ClientResponse(BaseModel):
    id: int
    name: str
    phone: Optional[str]
    email: Optional[str]
    company: Optional[str]
    inn: Optional[str]
    client_type: str
    lead_source: Optional[str]
    is_active: bool
    created_at: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)


router = APIRouter()


def _company_id(current_user: User) -> int:
    if current_user.company_id is None:
        raise HTTPException(
            status_code=400,
            detail="Пользователь не привязан к компании",
        )
    return current_user.company_id


@router.get("/", response_model=List[ClientResponse])
async def list_clients(
    search: Optional[str] = Query(None, description="Поиск по имени/компании"),
    client_type: Optional[str] = Query(None, description="Тип: individual/company"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Список клиентов"""
    return await ClientRepository(db).list(
        company_id=_company_id(current_user),
        search=search,
        client_type=client_type,
        limit=limit,
        offset=offset,
    )


@router.get("/{client_id}", response_model=ClientResponse)
async def get_client(
    client_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Получить клиента по ID"""
    client = await ClientRepository(db).get_by_id(
        client_id,
        _company_id(current_user),
    )
    if not client:
        raise HTTPException(status_code=404, detail="Клиент не найден")
    return client


@router.post("/", response_model=ClientResponse, status_code=201)
async def create_client(
    data: ClientCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Создать клиента"""
    client = await ClientRepository(db).create(
        company_id=_company_id(current_user),
        **data.model_dump(exclude_none=True),
    )

    audit = AuditService(db)
    await audit.log_create(
        "client",
        client.id,
        data.model_dump(),
        user_id=current_user.id,
    )

    return client


@router.patch("/{client_id}", response_model=ClientResponse)
async def update_client(
    client_id: int,
    data: ClientUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Обновить клиента"""
    client = await ClientRepository(db).get_by_id(
        client_id,
        _company_id(current_user),
    )
    if not client:
        raise HTTPException(status_code=404, detail="Клиент не найден")

    update_data = data.model_dump(exclude_none=True)
    for field, value in update_data.items():
        setattr(client, field, value)

    audit = AuditService(db)
    await audit.log_update(
        "client",
        client_id,
        new_data=update_data,
        user_id=current_user.id,
    )

    await db.flush()
    return client


@router.delete("/{client_id}")
async def delete_client(
    client_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Удалить (деактивировать) клиента"""
    client = await ClientRepository(db).get_by_id(
        client_id,
        _company_id(current_user),
    )
    if not client:
        raise HTTPException(status_code=404, detail="Клиент не найден")

    client.is_active = False

    audit = AuditService(db)
    await audit.log_delete("client", client_id, user_id=current_user.id)

    return {"detail": "Клиент удалён"}
