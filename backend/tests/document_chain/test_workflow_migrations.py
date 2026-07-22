import pytest
from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import create_async_engine

from app.schema_migrations import (
    initialize_database_schema,
    migrate_document_workflow_schema,
)


@pytest.mark.asyncio
async def test_document_workflow_migration_is_idempotent(tmp_path):
    database_path = tmp_path / "document-workflow.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{database_path}")

    try:
        async with engine.begin() as connection:
            await migrate_document_workflow_schema(connection)
            await initialize_database_schema(connection)
            await initialize_database_schema(connection)

            tables = await connection.run_sync(
                lambda sync_connection: set(
                    inspect(sync_connection).get_table_names()
                )
            )
            indexes = await connection.run_sync(
                lambda sync_connection: {
                    table: {
                        index["name"]
                        for index in inspect(sync_connection).get_indexes(table)
                    }
                    for table in (
                        "estimate_revisions",
                        "document_snapshots",
                        "document_audit_events",
                    )
                }
            )
    finally:
        await engine.dispose()

    assert {
        "estimate_revisions",
        "document_snapshots",
        "document_audit_events",
    }.issubset(tables)
    assert "ix_estimate_revisions_estimate_id" in indexes["estimate_revisions"]
    assert "ix_document_snapshots_entity" in indexes["document_snapshots"]
    assert "ix_document_audit_events_snapshot_id" in indexes["document_audit_events"]
