"""Минимальный платежный поток YooMoney -> webhook -> issue_license."""

from __future__ import annotations

import hashlib
from decimal import Decimal, InvalidOperation
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.license import LicenseAuditLog
from app.services.license_generator import LicenseIssuer, format_amount, get_plan_config


router = APIRouter()


class PaymentCreateRequest(BaseModel):
    email: str
    plan: str


def _resolve_webhook_secret() -> str:
    secret = settings.YOOMONEY_WEBHOOK_SECRET or settings.YOOMONEY_SECRET
    if not secret:
        raise HTTPException(status_code=500, detail="YOOMONEY_WEBHOOK_SECRET_NOT_CONFIGURED")
    return secret


def _build_quickpay_fields(*, order_id: str, email: str, plan: str) -> dict[str, str]:
    plan_config = get_plan_config(plan)
    if not settings.YOOMONEY_SHOP_ID:
        raise HTTPException(status_code=500, detail="YOOMONEY_SHOP_ID_NOT_CONFIGURED")
    if not settings.YOOMONEY_RETURN_URL:
        raise HTTPException(status_code=500, detail="YOOMONEY_RETURN_URL_NOT_CONFIGURED")

    return {
        "receiver": settings.YOOMONEY_SHOP_ID,
        "quickpay-form": "shop",
        "targets": f"Лицензия SmetaAI: {plan}",
        "paymentType": "AC",
        "sum": format_amount(plan_config.amount),
        "label": order_id,
        "successURL": settings.YOOMONEY_RETURN_URL,
        "comment": email,
    }


async def _find_audit_log_by_json_field(
    db: AsyncSession,
    *,
    event_type: str,
    json_path: str,
    value: str,
) -> LicenseAuditLog | None:
    result = await db.execute(
        select(LicenseAuditLog)
        .where(
            LicenseAuditLog.event_type == event_type,
            func.json_extract(LicenseAuditLog.event_data, json_path) == value,
        )
        .order_by(LicenseAuditLog.created_at.desc())
    )
    return result.scalars().first()


def _verify_notification_signature(payload: dict[str, str], secret: str) -> bool:
    received_hash = payload.get("sha1_hash", "")
    if not received_hash:
        return False

    signature_payload = "&".join(
        [
            payload.get("notification_type", ""),
            payload.get("operation_id", ""),
            payload.get("amount", ""),
            payload.get("currency", ""),
            payload.get("datetime", ""),
            payload.get("sender", ""),
            payload.get("codepro", ""),
            secret,
            payload.get("label", ""),
        ]
    )
    expected_hash = hashlib.sha1(signature_payload.encode("utf-8")).hexdigest()
    return expected_hash == received_hash


def _parse_amount(value: str | None) -> Decimal:
    try:
        return Decimal(str(value or "0")).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError) as exc:
        raise HTTPException(status_code=400, detail="PAYMENT_AMOUNT_INVALID") from exc


@router.post("/create")
async def create_payment(data: PaymentCreateRequest, db: AsyncSession = Depends(get_db)):
    plan_config = get_plan_config(data.plan)
    order_id = f"payment-{uuid4().hex[:16]}"
    form_fields = _build_quickpay_fields(order_id=order_id, email=data.email, plan=data.plan)

    db.add(
        LicenseAuditLog(
            event_type="payment_created",
            event_data={
                "order_id": order_id,
                "email": data.email,
                "plan": data.plan,
                "amount": format_amount(plan_config.amount),
            },
        )
    )
    await db.commit()

    return {
        "success": True,
        "payment_url": "https://yoomoney.ru/quickpay/confirm",
        "method": "POST",
        "order_id": order_id,
        "form_fields": form_fields,
    }


@router.post("/webhook")
async def payment_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    form = await request.form()
    payload = {key: str(value) for key, value in form.items()}
    payment_id = payload.get("operation_id")
    order_id = payload.get("label")

    if not payment_id or not order_id:
        raise HTTPException(status_code=400, detail="PAYMENT_FIELDS_MISSING")

    if payload.get("status") not in {None, "", "success", "succeeded"}:
        raise HTTPException(status_code=400, detail="PAYMENT_NOT_COMPLETED")

    if not _verify_notification_signature(payload, _resolve_webhook_secret()):
        raise HTTPException(status_code=400, detail="INVALID_WEBHOOK_SIGNATURE")

    processed_log = await _find_audit_log_by_json_field(
        db,
        event_type="payment_processed",
        json_path="$.payment_id",
        value=payment_id,
    )
    if processed_log:
        return {
            "success": True,
            "issued": False,
            "idempotent": True,
            "payment_id": payment_id,
        }

    created_log = await _find_audit_log_by_json_field(
        db,
        event_type="payment_created",
        json_path="$.order_id",
        value=order_id,
    )
    if created_log is None:
        raise HTTPException(status_code=404, detail="PAYMENT_ORDER_NOT_FOUND")

    order_data = dict(created_log.event_data or {})
    expected_amount = _parse_amount(order_data.get("amount"))
    actual_amount = _parse_amount(payload.get("amount"))
    if actual_amount != expected_amount:
        raise HTTPException(status_code=400, detail="PAYMENT_AMOUNT_MISMATCH")

    issued = await LicenseIssuer(db).issue_license(
        client_email=str(order_data.get("email") or ""),
        plan_code=str(order_data.get("plan") or ""),
        payment_id=payment_id,
        order_id=order_id,
    )
    print(f"[payment] issued license {issued['license_key']} to {order_data.get('email', '')}")

    return {
        "success": True,
        "issued": True,
        **issued,
    }
