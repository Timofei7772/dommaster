import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import Base, get_db
from app.models.license import License, LicenseAuditLog


@pytest.fixture()
def app_with_license(tmp_path):
    from app.routers.license import router

    db_path = tmp_path / 'license-single.db'
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def seed():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        async with session_maker() as session:
            session.add(
                License(
                    license_key="ZARU-ABCD-EFGH-JKLM-NPQR",
                    license_type="standard",
                    max_pcs=1,
                    issued_date=datetime.now(timezone.utc),
                    expires_at=datetime.now(timezone.utc) + timedelta(days=365),
                )
            )
            await session.commit()

    asyncio.run(seed())

    app = FastAPI()
    app.include_router(router, prefix="/api/license")

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
        yield app
    finally:
        asyncio.run(engine.dispose())


@pytest.fixture()
def app_with_double_license(tmp_path):
    from app.routers.license import router

    db_path = tmp_path / 'license-double.db'
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def seed():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        async with session_maker() as session:
            session.add(
                License(
                    license_key="ZARU-AAAA-BBBB-CCCC-DDDD",
                    license_type="double",
                    max_pcs=2,
                    issued_date=datetime.now(timezone.utc),
                    expires_at=datetime.now(timezone.utc) + timedelta(days=365),
                )
            )
            await session.commit()

    asyncio.run(seed())

    app = FastAPI()
    app.include_router(router, prefix="/api/license")

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
        yield app
    finally:
        asyncio.run(engine.dispose())


def test_activate_endpoint_is_idempotent_for_same_hardware(app_with_license):
    client = TestClient(app_with_license)
    payload = {
        "license_key": "ZARU-ABCD-EFGH-JKLM-NPQR",
        "hardware_fingerprint": "fp-1",
        "hardware_components": {"cpu": "cpu-1"},
        "device_name": "OFFICE-PC",
        "force_deactivate_previous": False,
        "app_version": "1.0.0",
    }

    first = client.post("/api/license/activate", json=payload)
    second = client.post("/api/license/activate", json=payload)

    assert first.json()["success"] is True
    assert second.json()["success"] is True
    assert second.json()["device_slot_id"] == 1


def test_activate_endpoint_returns_limit_reached_when_slots_are_full(app_with_double_license):
    client = TestClient(app_with_double_license)

    client.post(
        "/api/license/activate",
        json={
            "license_key": "ZARU-AAAA-BBBB-CCCC-DDDD",
            "hardware_fingerprint": "fp-1",
            "hardware_components": {},
            "device_name": "PC-1",
            "force_deactivate_previous": False,
            "app_version": "1.0.0",
        },
    )
    client.post(
        "/api/license/activate",
        json={
            "license_key": "ZARU-AAAA-BBBB-CCCC-DDDD",
            "hardware_fingerprint": "fp-2",
            "hardware_components": {},
            "device_name": "PC-2",
            "force_deactivate_previous": False,
            "app_version": "1.0.0",
        },
    )
    third = client.post(
        "/api/license/activate",
        json={
            "license_key": "ZARU-AAAA-BBBB-CCCC-DDDD",
            "hardware_fingerprint": "fp-3",
            "hardware_components": {},
            "device_name": "PC-3",
            "force_deactivate_previous": False,
            "app_version": "1.0.0",
        },
    )

    assert third.json()["error_code"] == "ACTIVATION_LIMIT_REACHED"
    assert third.json()["max_pcs"] == 2


def test_status_endpoint_returns_demo_state_without_license_key(app_with_license):
    client = TestClient(app_with_license)

    response = client.get("/api/license/status")

    assert response.status_code == 200
    assert response.json() == {
        "success": True,
        "is_active": False,
        "plan": None,
        "expires_at": None,
        "license_key": None,
    }


def test_status_endpoint_returns_backend_status_for_existing_license(app_with_license):
    client = TestClient(app_with_license)

    response = client.get(
        "/api/license/status",
        params={"license_key": "ZARU-ABCD-EFGH-JKLM-NPQR"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["is_active"] is True
    assert data["plan"] == "standard"
    assert data["license_key"] == "ZARU-ABCD-EFGH-JKLM-NPQR"
    assert data["expires_at"]


def test_admin_issue_endpoint_creates_license_for_buyer(app_with_license, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "LICENSE_ADMIN_SECRET", "super-secret")
    client = TestClient(app_with_license)

    response = client.post(
        "/api/license/admin/issue",
        json={"email": "buyer@example.com", "plan": "double"},
        headers={"X-Admin-Secret": "super-secret"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["license_key"].startswith("ZARU-")
    assert data["plan"] == "double"
    assert data["max_pcs"] == 2

    session_factory = app_with_license.dependency_overrides[get_db]

    async def fetch_created_license():
        async for session in session_factory():
            result = await session.execute(select(License).where(License.license_key == data["license_key"]))
            created_license = result.scalar_one()
            audit_result = await session.execute(
                select(LicenseAuditLog).where(LicenseAuditLog.license_id == created_license.id)
            )
            audit_logs = audit_result.scalars().all()
            return created_license, audit_logs
        raise AssertionError("Database session override did not yield a session")

    created_license, audit_logs = asyncio.run(fetch_created_license())
    assert created_license.client_email == "buyer@example.com"
    assert created_license.license_type == "double"
    assert {log.event_type for log in audit_logs} >= {"license_issued", "payment_processed"}


def test_admin_issue_endpoint_rejects_invalid_secret(app_with_license, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "LICENSE_ADMIN_SECRET", "super-secret")
    client = TestClient(app_with_license)

    response = client.post(
        "/api/license/admin/issue",
        json={"email": "buyer@example.com", "plan": "standard"},
        headers={"X-Admin-Secret": "wrong-secret"},
    )

    assert response.status_code == 403
