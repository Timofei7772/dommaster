"""
API роутер для лидогенерации
"""

import re
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.leads.lead_service import LeadService
from app.models.lead import LeadStatus
from app.models.user import User, UserRole
from app.repositories.lead_repository import LeadRepository
from app.routers.auth import get_current_user
from app.services.crm_service import (
    CrmError,
    CrmService,
    InvalidLeadTransitionError,
    LeadConversionConflictError,
    LeadNotFoundError,
    MissingCompanyError,
)


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


class LeadCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    description: Optional[str] = None
    address: Optional[str] = None
    expected_budget: Optional[float] = None
    source: str = "manual"
    external_url: Optional[str] = None


class LeadStatusUpdate(BaseModel):
    status: LeadStatus


class LeadResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    assigned_to: Optional[int]
    client_id: Optional[int]
    name: str
    phone: Optional[str]
    email: Optional[str]
    description: Optional[str]
    address: Optional[str]
    expected_budget: Optional[float]
    source: str
    external_url: Optional[str]
    status: LeadStatus
    converted_at: Optional[datetime]
    created_at: datetime
    updated_at: Optional[datetime]


class ClientSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    name: str
    phone: Optional[str]
    email: Optional[str]


class LeadConversionResponse(BaseModel):
    lead: LeadResponse
    client: ClientSummary
    reused_client: bool
    ready_for_project: bool


router = APIRouter()

CRM_WRITE_ROLES = {UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER}


def _company_id(current_user: User) -> int:
    if current_user.company_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пользователь не привязан к компании",
        )
    return current_user.company_id


def _require_crm_write(current_user: User) -> None:
    if current_user.role not in CRM_WRITE_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав для изменения CRM",
        )


def _raise_crm_http(error: CrmError) -> None:
    if isinstance(error, MissingCompanyError):
        code = status.HTTP_400_BAD_REQUEST
    elif isinstance(error, LeadNotFoundError):
        code = status.HTTP_404_NOT_FOUND
    elif isinstance(error, LeadConversionConflictError):
        code = status.HTTP_409_CONFLICT
    elif isinstance(error, InvalidLeadTransitionError):
        code = status.HTTP_400_BAD_REQUEST
    else:
        code = status.HTTP_400_BAD_REQUEST
    raise HTTPException(status_code=code, detail=str(error)) from error


def _conversion_response(result) -> LeadConversionResponse:
    return LeadConversionResponse(
        lead=LeadResponse.model_validate(result.lead),
        client=ClientSummary.model_validate(result.client),
        reused_client=result.reused_client,
        ready_for_project=result.ready_for_project,
    )


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
    current_user: User = Depends(get_current_user),
):
    """Legacy conversion path backed by the persistent CRM flow."""
    _require_crm_write(current_user)
    company_id = _company_id(current_user)

    contact = (request.contact or "").strip()
    digits = re.sub(r"\D", "", contact)
    phone = contact if len(digits) >= 7 else None
    email = contact if "@" in contact else None
    name = request.title if phone or email or not contact else contact

    lead = await LeadRepository(db).create(
        company_id=company_id,
        assigned_to=current_user.id,
        name=name,
        phone=phone,
        email=email,
        description=request.description,
        source=request.source,
        external_url=request.url,
        expected_budget=request.price,
    )
    try:
        result = await CrmService(db).convert_lead(
            company_id=company_id,
            lead_id=lead.id,
            user_id=current_user.id,
        )
    except CrmError as error:
        _raise_crm_http(error)

    return {
        "lead_id": result.lead.id,
        "client_id": result.client.id,
        "name": result.client.name,
        "detail": "Клиент создан из лида",
        "client": ClientSummary.model_validate(result.client).model_dump(),
        "reused_client": result.reused_client,
        "ready_for_project": result.ready_for_project,
    }


@router.post("/", response_model=LeadResponse, status_code=status.HTTP_201_CREATED)
async def create_lead(
    request: LeadCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a persistent lead inside the authenticated company."""
    _require_crm_write(current_user)
    company_id = _company_id(current_user)
    lead = await LeadRepository(db).create(
        company_id=company_id,
        assigned_to=current_user.id,
        **request.model_dump(),
    )
    return lead


@router.get("/", response_model=list[LeadResponse])
async def list_leads(
    lead_status: Optional[LeadStatus] = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List leads visible to the authenticated company."""
    company_id = _company_id(current_user)
    return await LeadRepository(db).list(company_id, lead_status)


@router.patch("/{lead_id}/status", response_model=LeadResponse)
async def change_lead_status(
    lead_id: int,
    request: LeadStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Move a lead through the approved CRM funnel."""
    _require_crm_write(current_user)
    try:
        return await CrmService(db).change_status(
            company_id=_company_id(current_user),
            lead_id=lead_id,
            new_status=request.status,
            user_id=current_user.id,
        )
    except CrmError as error:
        _raise_crm_http(error)


@router.post("/{lead_id}/convert", response_model=LeadConversionResponse)
async def convert_persisted_lead(
    lead_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Convert one persistent lead without creating duplicate clients."""
    _require_crm_write(current_user)
    try:
        result = await CrmService(db).convert_lead(
            company_id=_company_id(current_user),
            lead_id=lead_id,
            user_id=current_user.id,
        )
    except CrmError as error:
        _raise_crm_http(error)
    return _conversion_response(result)
