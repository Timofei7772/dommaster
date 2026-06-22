"""API лицензирования коммерческой версии SmetaAI."""

from __future__ import annotations

import secrets
from uuid import uuid4
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.services.license_generator import LicenseIssuer
from app.services.license_service import LicenseService


class ActivateLicenseRequest(BaseModel):
    license_key: str
    hardware_fingerprint: str
    hardware_components: dict[str, Any] = Field(default_factory=dict)
    device_name: str | None = None
    force_deactivate_previous: bool = False
    app_version: str | None = None


class DeactivateLicenseRequest(BaseModel):
    license_key: str
    device_slot_id: int | None = None
    hardware_fingerprint: str | None = None
    reason: str = "user_request"


class ValidateLicenseRequest(BaseModel):
    license_key: str
    hardware_fingerprint: str
    current_payload: dict[str, Any] | None = None


class AdminIssueLicenseRequest(BaseModel):
    email: str = Field(min_length=3)
    plan: str = Field(min_length=3)


router = APIRouter()


def require_admin_secret(x_admin_secret: str | None = Header(default=None)) -> None:
    configured_secret = settings.LICENSE_ADMIN_SECRET
    if not configured_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="License admin secret is not configured",
        )

    if not x_admin_secret or not secrets.compare_digest(x_admin_secret, configured_secret):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid admin secret",
        )


@router.get('/status')
async def get_current_license_status(
    license_key: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    if not license_key:
        return {
            "success": True,
            "is_active": False,
            "plan": None,
            "expires_at": None,
            "license_key": None,
        }

    data = await LicenseService(db).status(license_key)
    if not data.get("success"):
        return data

    license_data = data["license"]
    return {
        "success": True,
        "is_active": license_data["status"] == "active",
        "plan": license_data["type"],
        "expires_at": license_data["expires_at"],
        "license_key": license_data["key"],
    }


@router.post('/activate')
async def activate_license(data: ActivateLicenseRequest, db: AsyncSession = Depends(get_db)):
    return await LicenseService(db).activate(data.model_dump())


@router.post('/deactivate')
async def deactivate_license(data: DeactivateLicenseRequest, db: AsyncSession = Depends(get_db)):
    return await LicenseService(db).deactivate(data.model_dump())


@router.get('/devices/{license_key}')
async def get_license_devices(license_key: str, db: AsyncSession = Depends(get_db)):
    return await LicenseService(db).get_devices(license_key)


@router.post('/validate')
async def validate_license(data: ValidateLicenseRequest, db: AsyncSession = Depends(get_db)):
    return await LicenseService(db).validate(data.model_dump())


@router.get('/status/{license_key}')
async def get_license_status(license_key: str, db: AsyncSession = Depends(get_db)):
    return await LicenseService(db).status(license_key)


@router.post('/admin/issue')
async def admin_issue_license(
    data: AdminIssueLicenseRequest,
    _: None = Depends(require_admin_secret),
    db: AsyncSession = Depends(get_db),
):
    issuer = LicenseIssuer(db)
    issued = await issuer.issue_license(
        client_email=data.email.strip(),
        plan_code=data.plan.strip().lower(),
        payment_id=f"admin-{uuid4().hex}",
        order_id=f"manual-{uuid4().hex}",
    )
    return {
        "success": True,
        **issued,
    }
