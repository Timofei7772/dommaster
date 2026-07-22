"""Idempotent runtime migrations for packaged SQLite databases."""

import logging

from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import AsyncConnection

from app.database import Base

logger = logging.getLogger(__name__)

DOCUMENT_WORKFLOW_TABLES = (
    "estimate_revisions",
    "document_snapshots",
    "document_audit_events",
)


async def migrate_crm_schema(connection: AsyncConnection) -> None:
    """Add CRM tenant columns without modifying or deleting existing rows."""
    table_names = await connection.run_sync(
        lambda sync_connection: set(inspect(sync_connection).get_table_names())
    )
    if "clients" not in table_names:
        return

    client_columns = await connection.run_sync(
        lambda sync_connection: {
            item["name"]
            for item in inspect(sync_connection).get_columns("clients")
        }
    )
    if "company_id" not in client_columns:
        await connection.execute(text(
            "ALTER TABLE clients ADD COLUMN company_id "
            "INTEGER REFERENCES companies(id)"
        ))

    await connection.execute(text(
        "CREATE INDEX IF NOT EXISTS ix_clients_company_id "
        "ON clients (company_id)"
    ))

    company_ids = []
    if "companies" in table_names:
        company_ids = list((await connection.execute(
            text("SELECT id FROM companies ORDER BY id")
        )).scalars())

    if len(company_ids) == 1:
        await connection.execute(
            text(
                "UPDATE clients SET company_id = :company_id "
                "WHERE company_id IS NULL"
            ),
            {"company_id": company_ids[0]},
        )
        return

    unassigned_count = (await connection.execute(text(
        "SELECT COUNT(*) FROM clients WHERE company_id IS NULL"
    ))).scalar_one()
    if unassigned_count and len(company_ids) > 1:
        logger.warning(
            "%d client rows remain unassigned because multiple companies exist",
            unassigned_count,
        )


async def migrate_document_workflow_schema(connection: AsyncConnection) -> None:
    """Create persistent document-chain tables without touching existing rows."""
    workflow_tables = [
        Base.metadata.tables[table_name]
        for table_name in DOCUMENT_WORKFLOW_TABLES
    ]
    await connection.run_sync(
        lambda sync_connection: Base.metadata.create_all(
            sync_connection,
            tables=workflow_tables,
            checkfirst=True,
        )
    )


async def initialize_database_schema(connection: AsyncConnection) -> None:
    """Migrate an existing schema, then create any tables missing from it."""
    await migrate_crm_schema(connection)
    await migrate_document_workflow_schema(connection)
    await connection.run_sync(Base.metadata.create_all)
