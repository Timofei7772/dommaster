"""Runtime schema migration tests for packaged SQLite databases."""

import logging

import pytest
from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import create_async_engine

import app.models  # noqa: F401 - registers full application metadata


async def _schema_snapshot(connection):
    return await connection.run_sync(
        lambda sync_connection: {
            "tables": set(inspect(sync_connection).get_table_names()),
            "client_columns": {
                item["name"]
                for item in inspect(sync_connection).get_columns("clients")
            },
            "client_indexes": {
                item["name"]
                for item in inspect(sync_connection).get_indexes("clients")
            },
            "client_foreign_keys": inspect(sync_connection).get_foreign_keys("clients"),
        }
    )


@pytest.mark.asyncio
async def test_clean_database_creates_tenant_clients_and_leads(tmp_path):
    from app.schema_migrations import initialize_database_schema

    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'clean.db'}")
    try:
        async with engine.begin() as connection:
            await initialize_database_schema(connection)
            schema = await _schema_snapshot(connection)

        assert "leads" in schema["tables"]
        assert "company_id" in schema["client_columns"]
        assert "ix_clients_company_id" in schema["client_indexes"]
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_legacy_migration_is_idempotent_and_backfills_single_company(tmp_path):
    from app.schema_migrations import migrate_crm_schema

    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'legacy.db'}")
    try:
        async with engine.begin() as connection:
            await connection.execute(text(
                "CREATE TABLE companies (id INTEGER PRIMARY KEY, name VARCHAR(500) NOT NULL)"
            ))
            await connection.execute(text(
                "CREATE TABLE clients (id INTEGER PRIMARY KEY, name VARCHAR(500) NOT NULL)"
            ))
            await connection.execute(text(
                "INSERT INTO companies (id, name) VALUES (7, 'Legacy Company')"
            ))
            await connection.execute(text(
                "INSERT INTO clients (id, name) VALUES (11, 'Legacy Client')"
            ))

            await migrate_crm_schema(connection)
            await migrate_crm_schema(connection)
            schema = await _schema_snapshot(connection)
            client_rows = (await connection.execute(text(
                "SELECT id, name, company_id FROM clients ORDER BY id"
            ))).all()

        assert "company_id" in schema["client_columns"]
        assert "ix_clients_company_id" in schema["client_indexes"]
        assert any(
            foreign_key["referred_table"] == "companies"
            and foreign_key["constrained_columns"] == ["company_id"]
            for foreign_key in schema["client_foreign_keys"]
        )
        assert client_rows == [(11, "Legacy Client", 7)]
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_legacy_migration_does_not_guess_between_companies(tmp_path, caplog):
    from app.schema_migrations import migrate_crm_schema

    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'ambiguous.db'}")
    try:
        async with engine.begin() as connection:
            await connection.execute(text(
                "CREATE TABLE companies (id INTEGER PRIMARY KEY, name VARCHAR(500) NOT NULL)"
            ))
            await connection.execute(text(
                "CREATE TABLE clients (id INTEGER PRIMARY KEY, name VARCHAR(500) NOT NULL)"
            ))
            await connection.execute(text(
                "INSERT INTO companies (id, name) VALUES (1, 'One'), (2, 'Two')"
            ))
            await connection.execute(text(
                "INSERT INTO clients (id, name) VALUES (3, 'Unassigned')"
            ))

            with caplog.at_level(logging.WARNING):
                await migrate_crm_schema(connection)
            company_id = (await connection.execute(text(
                "SELECT company_id FROM clients WHERE id = 3"
            ))).scalar_one()

        assert company_id is None
        assert "1 client" in caplog.text
        assert "multiple companies" in caplog.text
    finally:
        await engine.dispose()
