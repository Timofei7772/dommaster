"""Сервис управления коммерческими лицензиями."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any, Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.license import License, LicenseActivation, LicenseAuditLog

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def canonical_stringify(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


@lru_cache(maxsize=1)
def _get_private_key():
    key_value = os.getenv("LICENSE_PRIVATE_KEY")

    if key_value:
        if key_value.strip().startswith("-----BEGIN"):
            pem = key_value.encode("utf-8")
        elif os.path.exists(key_value):
            with open(key_value, "rb") as handle:
                pem = handle.read()
        else:
            pem = key_value.encode("utf-8")
        return serialization.load_pem_private_key(pem, password=None)

    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


class LicenseService:
    """Бизнес-логика активации, деактивации и валидации лицензий."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def activate(self, data: dict[str, Any]) -> dict[str, Any]:
        license_obj = await self._get_license(data["license_key"])
        if not license_obj:
            return self._error("Лицензия не найдена", "LICENSE_NOT_FOUND")

        if license_obj.status != "active":
            return self._error("Лицензия недоступна", "LICENSE_BLOCKED")

        expires_at = _as_utc(license_obj.expires_at)
        if expires_at and expires_at <= _utcnow():
            license_obj.status = "expired"
            await self.db.flush()
            return self._error("Срок действия лицензии истёк", "LICENSE_EXPIRED")

        active_devices = await self._get_active_activations(license_obj.id)
        same_device = next(
            (item for item in active_devices if item.hardware_fingerprint == data["hardware_fingerprint"]),
            None,
        )
        if same_device:
            same_device.last_validated_at = _utcnow()
            await self._add_audit_log(license_obj.id, "activation_reuse", {"slot": same_device.device_slot_id})
            await self.db.commit()
            refreshed_devices = await self._get_active_activations(license_obj.id)
            payload = self._build_payload(license_obj, same_device)
            return self._success_response(payload, refreshed_devices)

        slot_id = self._next_available_slot(license_obj.max_pcs, active_devices)
        if slot_id is None:
            if data.get("force_deactivate_previous"):
                oldest = min(active_devices, key=lambda item: _as_utc(item.activated_at) or _utcnow())
                oldest.status = "replaced"
                oldest.deactivated_at = _utcnow()
                oldest.deactivation_reason = "forced_replacement"
                slot_id = oldest.device_slot_id
                await self._add_audit_log(
                    license_obj.id,
                    "forced_replacement",
                    {
                        "replaced_slot": oldest.device_slot_id,
                        "old_hardware_fingerprint": oldest.hardware_fingerprint,
                    },
                )
                await self.db.flush()
            else:
                return {
                    "success": False,
                    "error": "Все слоты активации заняты",
                    "error_code": "ACTIVATION_LIMIT_REACHED",
                    "active_devices_count": len(active_devices),
                    "max_pcs": license_obj.max_pcs,
                    "active_devices": self._serialize_devices(active_devices),
                    "suggestion": "Деактивируйте старое устройство или используйте force_deactivate_previous=true",
                }

        activation = LicenseActivation(
            license_id=license_obj.id,
            device_slot_id=slot_id,
            hardware_fingerprint=data["hardware_fingerprint"],
            hardware_components_json=data.get("hardware_components") or {},
            device_name=data.get("device_name"),
            status="active",
            last_validated_at=_utcnow(),
        )
        self.db.add(activation)
        await self.db.flush()
        await self.db.refresh(activation)

        await self._add_audit_log(
            license_obj.id,
            "activation",
            {
                "slot": activation.device_slot_id,
                "hardware_fingerprint": activation.hardware_fingerprint,
                "device_name": activation.device_name,
            },
        )
        await self.db.commit()

        refreshed_devices = await self._get_active_activations(license_obj.id)
        payload = self._build_payload(license_obj, activation)
        return self._success_response(payload, refreshed_devices)

    async def deactivate(self, data: dict[str, Any]) -> dict[str, Any]:
        license_obj = await self._get_license(data["license_key"])
        if not license_obj:
            return self._error("Лицензия не найдена", "LICENSE_NOT_FOUND")

        query = select(LicenseActivation).where(
            LicenseActivation.license_id == license_obj.id,
            LicenseActivation.status == "active",
        )
        if data.get("device_slot_id") is not None:
            query = query.where(LicenseActivation.device_slot_id == data["device_slot_id"])
        elif data.get("hardware_fingerprint"):
            query = query.where(LicenseActivation.hardware_fingerprint == data["hardware_fingerprint"])
        else:
            return self._error("Не указан слот или hardware fingerprint", "INVALID_REQUEST")

        result = await self.db.execute(query)
        activation = result.scalar_one_or_none()
        if not activation:
            return self._error("Активное устройство не найдено", "DEVICE_NOT_FOUND")

        activation.status = "inactive"
        activation.deactivated_at = _utcnow()
        activation.deactivation_reason = data.get("reason") or "user_request"
        await self._add_audit_log(
            license_obj.id,
            "deactivation",
            {"slot": activation.device_slot_id, "reason": activation.deactivation_reason},
        )
        await self.db.commit()
        return {"success": True, "message": "Устройство деактивировано", "freed_slot": activation.device_slot_id}

    async def get_devices(self, license_key: str) -> dict[str, Any]:
        license_obj = await self._get_license(license_key)
        if not license_obj:
            return self._error("Лицензия не найдена", "LICENSE_NOT_FOUND")

        active_devices = await self._get_active_activations(license_obj.id)
        return {
            "success": True,
            "license_key": license_obj.license_key,
            "max_pcs": license_obj.max_pcs,
            "active_devices": self._serialize_devices(active_devices),
        }

    async def validate(self, data: dict[str, Any]) -> dict[str, Any]:
        license_obj = await self._get_license(data["license_key"])
        if not license_obj:
            return self._error("Лицензия не найдена", "LICENSE_NOT_FOUND")

        active_devices = await self._get_active_activations(license_obj.id)
        activation = next(
            (item for item in active_devices if item.hardware_fingerprint == data["hardware_fingerprint"]),
            None,
        )
        if not activation:
            return self._error("Лицензия привязана к другому устройству", "HARDWARE_MISMATCH")

        activation.last_validated_at = _utcnow()
        await self.db.commit()
        payload = self._build_payload(license_obj, activation)
        signature = self._sign_payload(payload)
        return {"success": True, "valid": True, "payload": payload, "signature": signature}

    async def status(self, license_key: str) -> dict[str, Any]:
        license_obj = await self._get_license(license_key)
        if not license_obj:
            return self._error("Лицензия не найдена", "LICENSE_NOT_FOUND")

        active_devices = await self._get_active_activations(license_obj.id)
        return {
            "success": True,
            "license": {
                "key": license_obj.license_key,
                "type": license_obj.license_type,
                "status": license_obj.status,
                "expires_at": _as_utc(license_obj.expires_at).isoformat() if _as_utc(license_obj.expires_at) else None,
                "max_pcs": license_obj.max_pcs,
                "active_devices_count": len(active_devices),
                "issued_date": _as_utc(license_obj.issued_date).isoformat() if _as_utc(license_obj.issued_date) else None,
            },
        }

    async def _get_license(self, license_key: str) -> License | None:
        result = await self.db.execute(select(License).where(License.license_key == license_key))
        return result.scalar_one_or_none()

    async def _get_active_activations(self, license_id: str) -> list[LicenseActivation]:
        result = await self.db.execute(
            select(LicenseActivation)
            .where(
                LicenseActivation.license_id == license_id,
                LicenseActivation.status == "active",
            )
            .order_by(LicenseActivation.device_slot_id.asc(), LicenseActivation.activated_at.asc())
        )
        return list(result.scalars().all())

    async def _add_audit_log(self, license_id: str, event_type: str, event_data: dict[str, Any]) -> None:
        self.db.add(
            LicenseAuditLog(
                license_id=license_id,
                event_type=event_type,
                event_data=event_data,
            )
        )
        await self.db.flush()

    def _build_payload(self, license_obj: License, activation: LicenseActivation) -> dict[str, Any]:
        return {
            "license_key": license_obj.license_key,
            "license_type": license_obj.license_type,
            "max_pcs": license_obj.max_pcs,
            "issued_date": _as_utc(license_obj.issued_date).isoformat() if _as_utc(license_obj.issued_date) else None,
            "expiry_date": _as_utc(license_obj.expires_at).isoformat() if _as_utc(license_obj.expires_at) else None,
            "device_slot_id": activation.device_slot_id,
            "hardware_fingerprint": activation.hardware_fingerprint,
            "device_name": activation.device_name,
            "features": self._default_features(license_obj),
            "is_active": license_obj.status == "active",
            "public_key_id": license_obj.public_key_id or "v1",
        }

    def _success_response(self, payload: dict[str, Any], active_devices: Iterable[LicenseActivation]) -> dict[str, Any]:
        signature = self._sign_payload(payload)
        return {
            "success": True,
            "payload": payload,
            "signature": signature,
            "device_slot_id": payload["device_slot_id"],
            "active_devices": self._serialize_devices(active_devices),
        }

    def _sign_payload(self, payload: dict[str, Any]) -> str:
        signer = _get_private_key()
        signature = signer.sign(
            canonical_stringify(payload).encode("utf-8"),
            padding.PKCS1v15(),
            hashes.SHA256(),
        )
        return signature.hex()

    def _default_features(self, license_obj: License) -> dict[str, Any]:
        if license_obj.features_json:
            return dict(license_obj.features_json)
        return {
            "export_pdf": True,
            "export_excel": True,
            "ai_scanner": True,
            "ai_requests_limit": None,
        }

    def _serialize_devices(self, devices: Iterable[LicenseActivation]) -> list[dict[str, Any]]:
        return [
            {
                "slot": device.device_slot_id,
                "hardware_fingerprint": self._mask_fingerprint(device.hardware_fingerprint),
                "device_name": device.device_name,
                "activated_at": _as_utc(device.activated_at).isoformat() if _as_utc(device.activated_at) else None,
            }
            for device in devices
        ]

    def _mask_fingerprint(self, fingerprint: str | None) -> str | None:
        if not fingerprint:
            return None
        if len(fingerprint) <= 8:
            return fingerprint
        return f"{fingerprint[:6]}..."

    def _next_available_slot(self, max_pcs: int, active_devices: Iterable[LicenseActivation]) -> int | None:
        used_slots = {device.device_slot_id for device in active_devices}
        for slot_id in range(1, max_pcs + 1):
            if slot_id not in used_slots:
                return slot_id
        return None

    def _error(self, message: str, code: str) -> dict[str, Any]:
        return {"success": False, "error": message, "error_code": code}
