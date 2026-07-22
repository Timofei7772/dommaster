from datetime import datetime, timezone

import pytest
from sqlalchemy.exc import IntegrityError

from app.models.company import Company
from app.models.document_workflow import (
    DocumentAuditEvent,
    DocumentSnapshot,
    EstimateRevision,
)
from app.models.estimate import Estimate


@pytest.mark.asyncio
async def test_workflow_models_persist_revision_snapshot_and_audit(db_session):
    company = Company(name="Workflow Company")
    estimate = Estimate(number="ЛС-WF-1", name="Workflow estimate")
    db_session.add_all([company, estimate])
    await db_session.flush()

    revision = EstimateRevision(
        company_id=company.id,
        estimate_id=estimate.id,
        revision_number=1,
        payload_json={"estimate": {"id": estimate.id}, "rows": []},
        payload_hash="revision-hash",
        approved_at=datetime.now(timezone.utc),
    )
    db_session.add(revision)
    await db_session.flush()

    snapshot = DocumentSnapshot(
        company_id=company.id,
        estimate_revision_id=revision.id,
        document_type="contract",
        entity_id=91,
        version=1,
        status="approved",
        payload_json={"number": "Д-001"},
        payload_hash="snapshot-hash",
        idempotency_key="contract-91-v1",
    )
    db_session.add(snapshot)
    await db_session.flush()

    audit = DocumentAuditEvent(
        snapshot_id=snapshot.id,
        company_id=company.id,
        previous_status=None,
        new_status="approved",
    )
    db_session.add(audit)
    await db_session.flush()

    assert revision.id is not None
    assert snapshot.estimate_revision_id == revision.id
    assert audit.snapshot_id == snapshot.id


@pytest.mark.asyncio
async def test_revision_number_is_unique_per_estimate(db_session):
    company = Company(name="Unique Revision Company")
    estimate = Estimate(number="ЛС-WF-2", name="Unique revision estimate")
    db_session.add_all([company, estimate])
    await db_session.flush()

    values = {
        "company_id": company.id,
        "estimate_id": estimate.id,
        "revision_number": 1,
        "payload_json": {"rows": []},
        "payload_hash": "same-source",
        "approved_at": datetime.now(timezone.utc),
    }
    db_session.add(EstimateRevision(**values))
    await db_session.flush()
    db_session.add(EstimateRevision(**values))

    with pytest.raises(IntegrityError):
        await db_session.flush()


@pytest.mark.asyncio
async def test_revision_idempotency_key_is_unique_per_company(db_session):
    company = Company(name="Idempotent Revision Company")
    first_estimate = Estimate(number="ЛС-WF-3", name="First estimate")
    second_estimate = Estimate(number="ЛС-WF-4", name="Second estimate")
    db_session.add_all([company, first_estimate, second_estimate])
    await db_session.flush()

    common_values = {
        "company_id": company.id,
        "revision_number": 1,
        "payload_json": {"rows": []},
        "payload_hash": "approved-source",
        "idempotency_key": "approve-estimate-request-1",
        "approved_at": datetime.now(timezone.utc),
    }
    db_session.add(EstimateRevision(
        estimate_id=first_estimate.id,
        **common_values,
    ))
    await db_session.flush()
    db_session.add(EstimateRevision(
        estimate_id=second_estimate.id,
        **common_values,
    ))

    with pytest.raises(IntegrityError):
        await db_session.flush()
