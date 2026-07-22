"""Versioned tenant-safe API for the persistent construction document chain."""

from datetime import date

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User, UserRole
from app.routers.auth import get_current_user
from app.services.document_chain_service import (
    DocumentChainError,
    DocumentChainIdempotencyConflictError,
    DocumentChainNotFoundError,
    DocumentChainService,
    InvalidDocumentQuantityError,
    InvalidDocumentSelectionError,
    InvalidSourceRevisionError,
)
from app.services.snapshot_service import (
    SnapshotError,
    SnapshotIdempotencyConflictError,
    SnapshotNotFoundError,
    SnapshotService,
)


router = APIRouter()
WRITE_ROLES = {UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER}


class ContractCreate(BaseModel):
    estimate_revision_id: int
    number: str = Field(min_length=1, max_length=50)
    contract_date: date
    start_date: date | None = None
    end_date: date | None = None
    contract_type: str | None = None
    advance_amount: float = Field(default=0, ge=0)
    advance_percent: float = Field(default=0, ge=0, le=100)
    notes: str | None = None

    @model_validator(mode="after")
    def validate_dates(self):
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date cannot be earlier than start_date")
        return self


class KS2RowCreate(BaseModel):
    source_row_id: int
    quantity_done: float = Field(gt=0)


class KS2Create(BaseModel):
    estimate_revision_id: int
    contract_id: int
    number: str = Field(min_length=1, max_length=50)
    act_date: date
    period_start: date
    period_end: date
    investor: str | None = None
    rows: list[KS2RowCreate] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_period(self):
        if self.period_end < self.period_start:
            raise ValueError("period_end cannot be earlier than period_start")
        return self


class KS3Create(BaseModel):
    ks2_ids: list[int] = Field(min_length=1)
    number: str = Field(min_length=1, max_length=50)
    certificate_date: date
    period_start: date
    period_end: date

    @model_validator(mode="after")
    def validate_period(self):
        if self.period_end < self.period_start:
            raise ValueError("period_end cannot be earlier than period_start")
        return self


class M29RowCreate(BaseModel):
    source_row_id: int
    actual_quantity: float = Field(ge=0)
    actual_cost: float = Field(ge=0)
    deviation_reason: str | None = None


class M29Create(BaseModel):
    estimate_revision_id: int
    project_id: int
    report_number: str = Field(min_length=1, max_length=50)
    report_date: date
    period_start: date | None = None
    period_end: date | None = None
    responsible_name: str | None = None
    notes: str | None = None
    rows: list[M29RowCreate] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_period(self):
        if self.period_start and self.period_end and self.period_end < self.period_start:
            raise ValueError("period_end cannot be earlier than period_start")
        return self


def _company_id(user: User) -> int:
    if user.company_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пользователь не привязан к компании",
        )
    return user.company_id


def _require_write(user: User) -> None:
    if user.role not in WRITE_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав для изменения документов",
        )


def _raise_service_error(error: Exception) -> None:
    if isinstance(error, (DocumentChainNotFoundError, SnapshotNotFoundError)):
        code = status.HTTP_404_NOT_FOUND
    elif isinstance(
        error,
        (DocumentChainIdempotencyConflictError, SnapshotIdempotencyConflictError),
    ):
        code = status.HTTP_409_CONFLICT
    else:
        code = status.HTTP_400_BAD_REQUEST
    raise HTTPException(status_code=code, detail=str(error)) from error


def _revision_response(revision) -> dict:
    return {
        "id": revision.id,
        "estimate_id": revision.estimate_id,
        "revision_number": revision.revision_number,
        "payload_hash": revision.payload_hash,
        "approved_at": revision.approved_at,
    }


def _contract_response(contract) -> dict:
    return {
        "id": contract.id,
        "number": contract.number,
        "contract_date": contract.contract_date,
        "project_id": contract.project_id,
        "customer_name": contract.customer_name,
        "object_name": contract.object_name,
        "total_amount": contract.total_amount,
        "status": contract.status,
    }


def _ks2_response(act) -> dict:
    return {
        "id": act.id,
        "number": act.number,
        "estimate_id": act.estimate_id,
        "contract_id": act.contract_id,
        "status": act.status,
        "total_without_vat": act.total_without_vat,
        "vat_amount": act.vat_amount,
        "total_with_vat": act.total_with_vat,
        "rows": [
            {
                "source_row_id": item.estimate_item_id,
                "quantity_total": item.quantity_total,
                "quantity_prev": item.quantity_prev,
                "quantity_done": item.quantity_done,
                "unit_price": item.unit_price,
                "total": item.total,
            }
            for item in act.items
        ],
    }


def _ks3_response(certificate) -> dict:
    return {
        "id": certificate.id,
        "number": certificate.number,
        "contract_id": certificate.contract_id,
        "status": certificate.status,
        "total_from_start": certificate.total_from_start,
        "total_current_period": certificate.total_current_period,
        "vat_amount": certificate.vat_amount,
        "total_with_vat": certificate.total_with_vat,
        "ks2_ids": [item.ks2_act_id for item in certificate.items],
    }


def _m29_response(report) -> dict:
    return {
        "id": report.id,
        "report_number": report.report_number,
        "project_id": report.project_id,
        "status": report.status,
        "total_norm_cost": report.total_norm_cost,
        "total_actual_cost": report.total_actual_cost,
    }


@router.post("/estimates/{estimate_id}/approve")
async def approve_estimate(
    estimate_id: int,
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=1, max_length=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_write(user)
    try:
        revision = await SnapshotService(db).approve_estimate(
            estimate_id=estimate_id,
            company_id=_company_id(user),
            actor_id=user.id,
            idempotency_key=idempotency_key,
        )
    except SnapshotError as error:
        _raise_service_error(error)
    return _revision_response(revision)


@router.post("/contracts", status_code=status.HTTP_201_CREATED)
async def create_contract(
    request: ContractCreate,
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=1, max_length=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_write(user)
    try:
        contract = await DocumentChainService(db).create_contract(
            estimate_revision_id=request.estimate_revision_id,
            company_id=_company_id(user),
            actor_id=user.id,
            contract_data=request.model_dump(exclude={"estimate_revision_id"}),
            idempotency_key=idempotency_key,
        )
    except DocumentChainError as error:
        _raise_service_error(error)
    return _contract_response(contract)


@router.post("/ks2", status_code=status.HTTP_201_CREATED)
async def create_ks2(
    request: KS2Create,
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=1, max_length=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_write(user)
    data = request.model_dump()
    try:
        act = await DocumentChainService(db).create_ks2(
            estimate_revision_id=data.pop("estimate_revision_id"),
            contract_id=data.pop("contract_id"),
            company_id=_company_id(user),
            actor_id=user.id,
            rows=data.pop("rows"),
            act_data=data,
            idempotency_key=idempotency_key,
        )
    except DocumentChainError as error:
        _raise_service_error(error)
    return _ks2_response(act)


@router.post("/ks2/{ks2_id}/approve")
async def approve_ks2(
    ks2_id: int,
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=1, max_length=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_write(user)
    try:
        act = await DocumentChainService(db).approve_ks2(
            ks2_id=ks2_id,
            company_id=_company_id(user),
            actor_id=user.id,
            idempotency_key=idempotency_key,
        )
    except DocumentChainError as error:
        _raise_service_error(error)
    return _ks2_response(act)


@router.post("/ks3", status_code=status.HTTP_201_CREATED)
async def create_ks3(
    request: KS3Create,
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=1, max_length=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_write(user)
    data = request.model_dump()
    try:
        certificate = await DocumentChainService(db).create_ks3(
            ks2_ids=data.pop("ks2_ids"),
            company_id=_company_id(user),
            actor_id=user.id,
            certificate_data=data,
            idempotency_key=idempotency_key,
        )
    except DocumentChainError as error:
        _raise_service_error(error)
    return _ks3_response(certificate)


@router.post("/m29", status_code=status.HTTP_201_CREATED)
async def create_m29(
    request: M29Create,
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=1, max_length=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_write(user)
    data = request.model_dump()
    try:
        report = await DocumentChainService(db).create_m29(
            estimate_revision_id=data.pop("estimate_revision_id"),
            project_id=data.pop("project_id"),
            company_id=_company_id(user),
            actor_id=user.id,
            rows=data.pop("rows"),
            report_data=data,
            idempotency_key=idempotency_key,
        )
    except DocumentChainError as error:
        _raise_service_error(error)
    return _m29_response(report)


@router.get("/estimates/{estimate_id}")
async def get_estimate_chain(
    estimate_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return await DocumentChainService(db).get_estimate_chain(
            estimate_id=estimate_id,
            company_id=_company_id(user),
        )
    except DocumentChainError as error:
        _raise_service_error(error)
