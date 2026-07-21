"""Isolated async database fixtures for CRM tests."""

import pytest_asyncio
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401 - registers all model metadata
from app.database import Base
from app.models.company import Company
from app.models.user import User, UserRole


@pytest_asyncio.fixture
async def db_engine():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine.sync_engine, "connect")
    def enable_foreign_keys(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    try:
        yield engine
    finally:
        await engine.dispose()


@pytest_asyncio.fixture
async def db_session(db_engine):
    session_factory = async_sessionmaker(
        db_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    async with session_factory() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def company(db_session):
    company = Company(name="CRM Test Company")
    db_session.add(company)
    await db_session.flush()
    return company


@pytest_asyncio.fixture
async def manager(db_session, company):
    manager = User(
        email="manager@example.test",
        hashed_password="not-used-in-model-tests",
        full_name="CRM Manager",
        role=UserRole.MANAGER,
        company_id=company.id,
        is_active=True,
    )
    db_session.add(manager)
    await db_session.flush()
    return manager
