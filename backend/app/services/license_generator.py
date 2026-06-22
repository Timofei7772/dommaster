"""Выдача новых коммерческих лицензий без изменения existing activation flow."""

from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.license import License, LicenseAuditLog


LICENSE_KEY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


@dataclass(frozen=True)
class LicensePlanConfig:
    code: str
    amount: Decimal
    max_pcs: int
    duration_days: int
    features: dict[str, bool]


PLAN_CONFIGS: dict[str, LicensePlanConfig] = {
    "standard": LicensePlanConfig(
        code="standard",
        amount=Decimal("2500.00"),
        max_pcs=1,
        duration_days=365,
        features={
            "export_pdf": True,
            "export_excel": True,
            "ai_scanner": True,
        },
    ),
    "double": LicensePlanConfig(
        code="double",
        amount=Decimal("5000.00"),
        max_pcs=2,
        duration_days=365,
        features={
            "export_pdf": True,
            "export_excel": True,
            "ai_scanner": True,
        },
    ),
    "enterprise": LicensePlanConfig(
        code="enterprise",
        amount=Decimal("10000.00"),
        max_pcs=5,
        duration_days=365,
        features={
            "export_pdf": True,
            "export_excel": True,
            "ai_scanner": True,
        },
    ),
}


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def get_plan_config(plan_code: str) -> LicensePlanConfig:
    try:
        return PLAN_CONFIGS[plan_code]
    except KeyError as exc:
        raise ValueError(f"Unknown license plan: {plan_code}") from exc


def format_amount(amount: Decimal) -> str:
    return f"{amount.quantize(Decimal('0.01'))}"


def generate_license_key() -> str:
    def block() -> str:
        return "".join(random.choice(LICENSE_KEY_ALPHABET) for _ in range(4))

    return f"ZARU-{block()}-{block()}-{block()}-{block()}"


class LicenseIssuer:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def issue_license(
        self,
        *,
        client_email: str,
        plan_code: str,
        payment_id: str,
        order_id: str,
    ) -> dict[str, str | int | None]:
        plan = get_plan_config(plan_code)
        license_key = await self._generate_unique_key()
        issued_at = utcnow()
        expires_at = issued_at + timedelta(days=plan.duration_days)

        license_obj = License(
            license_key=license_key,
            license_type=plan.code,
            max_pcs=plan.max_pcs,
            client_email=client_email,
            issued_date=issued_at,
            expires_at=expires_at,
            status="active",
            features_json=plan.features,
            notes=f"issued_from_payment:{payment_id}",
        )
        self.db.add(license_obj)
        await self.db.flush()

        self.db.add(
            LicenseAuditLog(
                license_id=license_obj.id,
                event_type="license_issued",
                event_data={
                    "plan": plan.code,
                    "email": client_email,
                    "payment_id": payment_id,
                    "order_id": order_id,
                },
            )
        )
        self.db.add(
            LicenseAuditLog(
                license_id=license_obj.id,
                event_type="payment_processed",
                event_data={
                    "payment_id": payment_id,
                    "order_id": order_id,
                    "plan": plan.code,
                    "amount": format_amount(plan.amount),
                    "email": client_email,
                },
            )
        )
        await self.db.commit()
        await self.db.refresh(license_obj)

        return {
            "license_key": license_obj.license_key,
            "expires_at": expires_at.isoformat(),
            "plan": plan.code,
            "max_pcs": license_obj.max_pcs,
        }

    async def _generate_unique_key(self) -> str:
        while True:
            candidate = generate_license_key()
            existing = await self.db.execute(select(License.id).where(License.license_key == candidate))
            if existing.scalar_one_or_none() is None:
                return candidate
