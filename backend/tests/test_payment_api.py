import asyncio
import hashlib
from datetime import datetime, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import Base, get_db
from app.models.license import License, LicenseAuditLog


def _notification_sha1(payload: dict[str, str], secret: str) -> str:
    parts = [
        payload["notification_type"],
        payload["operation_id"],
        payload["amount"],
        payload["currency"],
        payload["datetime"],
        payload["sender"],
        payload["codepro"],
        secret,
        payload["label"],
    ]
    return hashlib.sha1("&".join(parts).encode("utf-8")).hexdigest()


@pytest.fixture()
def payment_app(tmp_path, monkeypatch):
    from app import config as config_module
    from app.routers.license import router as license_router

    db_path = tmp_path / "payment-flow.db"
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def setup():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    asyncio.run(setup())

    monkeypatch.setattr(config_module.settings, "YOOMONEY_SHOP_ID", "4100111222333", raising=False)
    monkeypatch.setattr(config_module.settings, "YOOMONEY_SECRET", "test-payment-secret", raising=False)
    monkeypatch.setattr(config_module.settings, "YOOMONEY_RETURN_URL", "https://example.com/activation", raising=False)
    monkeypatch.setattr(config_module.settings, "YOOMONEY_WEBHOOK_SECRET", "test-webhook-secret", raising=False)

    from app.routers.payment import router as payment_router

    app = FastAPI()
    app.include_router(license_router, prefix="/api/license")
    app.include_router(payment_router, prefix="/api/payment")

    async def override_get_db():
        async with session_maker() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise
            finally:
                await session.close()

    app.dependency_overrides[get_db] = override_get_db

    try:
        yield {
            "app": app,
            "session_maker": session_maker,
        }
    finally:
        asyncio.run(engine.dispose())


def test_create_payment_returns_yoomoney_form_data(payment_app):
    client = TestClient(payment_app["app"])

    response = client.post(
        "/api/payment/create",
        json={"email": "pro@example.com", "plan": "standard"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["payment_url"] == "https://yoomoney.ru/quickpay/confirm"
    assert data["method"] == "POST"
    assert data["order_id"]
    assert data["form_fields"]["label"] == data["order_id"]
    assert data["form_fields"]["sum"] == "2500.00"
    assert data["form_fields"]["targets"] == "Лицензия SmetaAI: standard"


def test_payment_webhook_issues_license_once_and_is_idempotent(payment_app):
    client = TestClient(payment_app["app"])

    create_response = client.post(
        "/api/payment/create",
        json={"email": "buyer@example.com", "plan": "double"},
    )
    order_id = create_response.json()["order_id"]

    payload = {
        "notification_type": "p2p-incoming",
        "operation_id": "payment-001",
        "amount": "5000.00",
        "currency": "643",
        "datetime": datetime.now(timezone.utc).isoformat(),
        "sender": "4100111222333",
        "codepro": "false",
        "label": order_id,
    }
    payload["sha1_hash"] = _notification_sha1(payload, "test-webhook-secret")

    first = client.post("/api/payment/webhook", data=payload)
    second = client.post("/api/payment/webhook", data=payload)

    assert first.status_code == 200
    assert first.json()["success"] is True
    assert first.json()["issued"] is True
    assert first.json()["license_key"].startswith("ZARU-")

    assert second.status_code == 200
    assert second.json() == {
        "success": True,
        "issued": False,
        "idempotent": True,
        "payment_id": "payment-001",
    }

    async def fetch_records():
        async with payment_app["session_maker"]() as session:
            licenses = (await session.execute(License.__table__.select())).all()
            audit_logs = (await session.execute(LicenseAuditLog.__table__.select())).all()
            return licenses, audit_logs

    licenses, audit_logs = asyncio.run(fetch_records())
    assert len(licenses) == 1
    assert len(audit_logs) >= 2


def test_payment_webhook_rejects_invalid_amount(payment_app):
    client = TestClient(payment_app["app"])

    create_response = client.post(
        "/api/payment/create",
        json={"email": "buyer@example.com", "plan": "standard"},
    )
    order_id = create_response.json()["order_id"]

    payload = {
        "notification_type": "p2p-incoming",
        "operation_id": "payment-amount-mismatch",
        "amount": "1000.00",
        "currency": "643",
        "datetime": datetime.now(timezone.utc).isoformat(),
        "sender": "4100111222333",
        "codepro": "false",
        "label": order_id,
    }
    payload["sha1_hash"] = _notification_sha1(payload, "test-webhook-secret")

    response = client.post("/api/payment/webhook", data=payload)

    assert response.status_code == 400
    assert response.json()["detail"] == "PAYMENT_AMOUNT_MISMATCH"
