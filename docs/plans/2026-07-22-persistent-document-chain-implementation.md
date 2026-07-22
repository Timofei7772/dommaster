# Persistent Document Chain Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a tenant-safe, snapshot-backed chain from an approved estimate through contract, KS-2, KS-3, and M-29 while preserving existing desktop and frontend contracts.

**Architecture:** The FastAPI backend owns workflow state, immutable snapshots, status transitions, and relationships. Existing Contract, KS2, KS3, and M29 models remain the operational records; new workflow tables attach immutable source/output snapshots and audit history without duplicating their business fields. Electron consumes snapshot payloads through compatibility adapters and remains responsible for Windows file rendering.

**Tech Stack:** Python 3.10, FastAPI, SQLAlchemy async, SQLite/aiosqlite, Pydantic v2, pytest/pytest-asyncio, Electron, Node test runner, React/TypeScript.

---

## Mandatory Change Gate

This plan adds database tables and versioned API endpoints. Before Task 1, obtain explicit approval for:

- the idempotent SQLite runtime migration;
- the new `/api/v1/document-chain/*` public API;
- no new third-party dependency.

Do not begin schema or API implementation without that approval.

Because the target workspace contains a large dirty worktree, do not reset, stash, reformat, or stage unrelated files. Review every staged hunk before each commit.

### Task 1: Add immutable workflow persistence models

**Files:**
- Create: `backend/app/models/document_workflow.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/app/schema_migrations.py`
- Test: `backend/tests/document_chain/test_workflow_models.py`
- Test: `backend/tests/document_chain/test_workflow_migrations.py`

**Step 1: Write the failing model test**

Create isolated async fixtures matching `backend/tests/crm/conftest.py`. Test that an estimate revision and a document snapshot can be stored with one company and that duplicate `(estimate_id, revision_number)` values fail.

Use these minimal models:

```python
class EstimateRevision(Base):
    __tablename__ = "estimate_revisions"
    id: int
    company_id: int
    estimate_id: int
    revision_number: int
    payload_json: dict
    payload_hash: str
    created_by: int | None
    approved_at: datetime
    created_at: datetime

class DocumentSnapshot(Base):
    __tablename__ = "document_snapshots"
    id: int
    company_id: int
    project_id: int | None
    estimate_revision_id: int
    document_type: str
    entity_id: int
    version: int
    status: str
    payload_json: dict
    payload_hash: str
    template_version: str | None
    idempotency_key: str | None
    created_by: int | None
    created_at: datetime

class DocumentAuditEvent(Base):
    __tablename__ = "document_audit_events"
    id: int
    snapshot_id: int
    company_id: int
    actor_id: int | None
    previous_status: str | None
    new_status: str
    reason: str | None
    created_at: datetime
```

Required constraints:

- unique revision number per estimate;
- unique snapshot version per `(document_type, entity_id)`;
- unique non-null idempotency key per company;
- indexed `company_id`, source revision, entity identity, and status.

**Step 2: Run the model test to verify RED**

Run:

```powershell
backend\venv\Scripts\python.exe -m pytest backend\tests\document_chain\test_workflow_models.py -q
```

Expected: FAIL because `app.models.document_workflow` does not exist.

**Step 3: Implement the minimal models and register metadata**

Use SQLAlchemy `JSON`, timezone-aware timestamps, explicit foreign keys, and string status values. Do not change legacy document tables in this task.

**Step 4: Write and verify the migration test RED**

Cover clean database creation and two consecutive calls to the runtime migration. Assert all three tables and indexes exist after both calls.

**Step 5: Implement the idempotent migration**

Add `migrate_document_workflow_schema(connection)` and call it from `initialize_database_schema()` before `Base.metadata.create_all`. New tables may be created through metadata; the named migration function must make intent and future upgrades explicit.

**Step 6: Run tests GREEN**

```powershell
backend\venv\Scripts\python.exe -m pytest backend\tests\document_chain\test_workflow_models.py backend\tests\document_chain\test_workflow_migrations.py backend\tests\crm\test_schema_migrations.py -q
```

Expected: PASS.

**Step 7: Commit**

```powershell
git add backend/app/models/document_workflow.py backend/app/models/__init__.py backend/app/schema_migrations.py backend/tests/document_chain
git commit -m "feat: add document workflow persistence"
```

### Task 2: Build canonical estimate revision snapshots

**Files:**
- Create: `backend/app/services/snapshot_service.py`
- Create: `backend/app/repositories/document_workflow_repository.py`
- Test: `backend/tests/document_chain/test_snapshot_service.py`

**Step 1: Write failing tests**

Test real SQLAlchemy models and an isolated database:

- approving a draft estimate creates revision 1;
- repeated approval with the same idempotency key returns the same revision;
- rows and sections are deterministically ordered;
- payload contains project, parties, coefficients, VAT, totals, and calculation schema version;
- changing the estimate after revision 1 does not mutate revision 1;
- approving a foreign-company estimate returns not found at the service boundary.

Expected service API:

```python
revision = await SnapshotService(db).approve_estimate(
    estimate_id=estimate_id,
    company_id=user.company_id,
    actor_id=user.id,
    idempotency_key="approve-estimate-123",
)
```

**Step 2: Run RED**

```powershell
backend\venv\Scripts\python.exe -m pytest backend\tests\document_chain\test_snapshot_service.py -q
```

Expected: FAIL because the service does not exist.

**Step 3: Implement deterministic serialization**

Normalize numbers before hashing. Serialize with sorted keys and compact separators, then compute SHA-256. Never accept `company_id` inside the estimate payload; derive it from the authenticated service call and tenant-scoped project/estimate query.

**Step 4: Run GREEN**

Run the same test and then:

```powershell
backend\venv\Scripts\python.exe -m pytest backend\tests\document_chain backend\tests\crm -q
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add backend/app/services/snapshot_service.py backend/app/repositories/document_workflow_repository.py backend/tests/document_chain/test_snapshot_service.py
git commit -m "feat: snapshot approved estimate revisions"
```

### Task 3: Add contract creation from an approved revision

**Files:**
- Create: `backend/app/services/document_chain_service.py`
- Test: `backend/tests/document_chain/test_contract_chain.py`

**Step 1: Write failing tests**

Cover:

- draft estimate revision is rejected;
- contract copies project/customer/object and exact approved total;
- contract source snapshot is stored as `document_type="contract"`;
- repeated idempotency key returns the same contract;
- foreign revision ID is not visible.

Expected API:

```python
contract = await DocumentChainService(db).create_contract(
    estimate_revision_id=revision.id,
    company_id=user.company_id,
    actor_id=user.id,
    contract_data={"number": "Д-001", "contract_date": date.today()},
    idempotency_key="contract-revision-1",
)
```

**Step 2: Run RED**

```powershell
backend\venv\Scripts\python.exe -m pytest backend\tests\document_chain\test_contract_chain.py -q
```

**Step 3: Implement one atomic transaction**

Create the legacy `Contract`, flush it, create its immutable `DocumentSnapshot`, and append an audit event. On failure, allow the request transaction to roll back all records.

**Step 4: Run GREEN and regression tests**

```powershell
backend\venv\Scripts\python.exe -m pytest backend\tests\document_chain\test_contract_chain.py backend\tests\test_license_api.py -q
```

**Step 5: Commit**

```powershell
git add backend/app/services/document_chain_service.py backend/tests/document_chain/test_contract_chain.py
git commit -m "feat: create contracts from estimate revisions"
```

### Task 4: Add KS-2 remaining-quantity workflow

**Files:**
- Modify: `backend/app/services/document_chain_service.py`
- Test: `backend/tests/document_chain/test_ks2_chain.py`

**Step 1: Write failing tests**

Create an approved revision with two rows. Verify:

- KS-2 rows are selected only from the revision snapshot;
- `quantity_prev` equals prior approved/signed KS-2 quantities;
- `quantity_done` cannot exceed remaining quantity;
- draft KS-2 does not consume remaining quantity until approval;
- approval creates/finalizes a snapshot and audit event;
- repeated approval is idempotent;
- amounts use snapshot unit prices and VAT rules.

**Step 2: Run RED**

```powershell
backend\venv\Scripts\python.exe -m pytest backend\tests\document_chain\test_ks2_chain.py -q
```

**Step 3: Implement minimal create/approve methods**

Use decimal-safe rounding at two places: line total and document total. Do not sum frontend-provided totals. Reject negative or zero executed quantities.

**Step 4: Run GREEN**

```powershell
backend\venv\Scripts\python.exe -m pytest backend\tests\document_chain\test_ks2_chain.py backend\tests\document_chain\test_contract_chain.py -q
```

**Step 5: Commit**

```powershell
git add backend/app/services/document_chain_service.py backend/tests/document_chain/test_ks2_chain.py
git commit -m "feat: enforce KS-2 remaining quantities"
```

### Task 5: Aggregate KS-3 only from approved KS-2 acts

**Files:**
- Modify: `backend/app/services/document_chain_service.py`
- Test: `backend/tests/document_chain/test_ks3_chain.py`

**Step 1: Write failing tests**

Verify:

- only approved/signed KS-2 acts are accepted;
- acts must share company, project, contract, and estimate revision;
- duplicate inclusion is rejected;
- `total_current_period` equals selected KS-2 totals;
- cumulative totals include earlier compatible KS-3 certificates once;
- KS3Item records point to their KS2 acts;
- repeated idempotency key returns the same certificate.

**Step 2: Run RED**

```powershell
backend\venv\Scripts\python.exe -m pytest backend\tests\document_chain\test_ks3_chain.py -q
```

**Step 3: Implement minimal aggregation**

The request accepts KS-2 IDs, number, certificate date, and period only. Ignore client-supplied totals. Persist the legacy certificate, link items, snapshot, and audit event atomically.

**Step 4: Run GREEN**

```powershell
backend\venv\Scripts\python.exe -m pytest backend\tests\document_chain\test_ks3_chain.py backend\tests\document_chain\test_ks2_chain.py -q
```

**Step 5: Commit**

```powershell
git add backend/app/services/document_chain_service.py backend/tests/document_chain/test_ks3_chain.py
git commit -m "feat: derive KS-3 from approved KS-2 acts"
```

### Task 6: Generate material-only M-29 reports

**Files:**
- Modify: `backend/app/services/document_chain_service.py`
- Test: `backend/tests/document_chain/test_m29_chain.py`

**Step 1: Write failing tests**

Verify:

- only `material`/`mat` estimate rows appear;
- work, mechanism, comment, and total rows are excluded;
- normative quantity/cost comes from the approved revision;
- actual quantity/cost and deviation reason are explicit inputs;
- report totals are calculated server-side;
- foreign project/revision IDs return not found;
- repeated idempotency key is safe.

**Step 2: Run RED**

```powershell
backend\venv\Scripts\python.exe -m pytest backend\tests\document_chain\test_m29_chain.py -q
```

**Step 3: Implement minimal M-29 creation**

Store material row details in the immutable snapshot payload while continuing to create the existing summary `M29Report` record. Do not add a second material-row table in this batch.

**Step 4: Run GREEN**

```powershell
backend\venv\Scripts\python.exe -m pytest backend\tests\document_chain\test_m29_chain.py -q
```

**Step 5: Commit**

```powershell
git add backend/app/services/document_chain_service.py backend/tests/document_chain/test_m29_chain.py
git commit -m "feat: create material-only M-29 reports"
```

### Task 7: Expose versioned workflow API and chain state

**Files:**
- Create: `backend/app/routers/document_chain.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/document_chain/test_document_chain_api.py`

**Step 1: Write failing API tests**

Use dependency overrides and bearer authentication. Cover:

- `POST /api/v1/document-chain/estimates/{id}/approve`;
- `POST /api/v1/document-chain/contracts`;
- `POST /api/v1/document-chain/ks2`;
- `POST /api/v1/document-chain/ks2/{id}/approve`;
- `POST /api/v1/document-chain/ks3`;
- `POST /api/v1/document-chain/m29`;
- `GET /api/v1/document-chain/estimates/{id}`;
- owner/admin/manager write roles;
- tenant isolation and foreign IDs returning 404;
- `Idempotency-Key` header propagation;
- OpenAPI bearer security on every route.

**Step 2: Run RED**

```powershell
backend\venv\Scripts\python.exe -m pytest backend\tests\document_chain\test_document_chain_api.py -q
```

Expected: 404 because the router is absent.

**Step 3: Implement thin route handlers**

Pydantic request models validate dates, periods, non-empty row selections, and positive quantities. Handlers delegate all financial and tenant logic to services. Register the router once under `/api/v1/document-chain`.

**Step 4: Run GREEN**

```powershell
backend\venv\Scripts\python.exe -m pytest backend\tests\document_chain\test_document_chain_api.py -q
```

**Step 5: Commit**

Stage `backend/app/main.py` selectively because it contains unrelated user changes.

```powershell
git add backend/app/routers/document_chain.py backend/tests/document_chain/test_document_chain_api.py
git add -p backend/app/main.py
git commit -m "feat: expose persistent document chain API"
```

### Task 8: Add the full backend success scenario

**Files:**
- Create: `backend/tests/document_chain/test_document_chain_success_scenario.py`

**Step 1: Write the end-to-end test**

Through HTTP only:

1. Create/seed project and estimate with work and material rows.
2. Approve revision 1.
3. Create contract.
4. Create and approve two partial KS-2 acts.
5. Create KS-3 from both acts.
6. Create M-29 and assert only material rows exist.
7. Fetch chain state and verify all IDs and statuses.
8. Modify the source estimate, approve revision 2, and prove revision-1 snapshot hashes/payloads are unchanged.
9. Repeat idempotent commands and prove no duplicates.

**Step 2: Run RED, then implement only missing integration glue**

```powershell
backend\venv\Scripts\python.exe -m pytest backend\tests\document_chain\test_document_chain_success_scenario.py -q
```

**Step 3: Run the complete backend suite**

```powershell
backend\venv\Scripts\python.exe -m pytest backend\tests -q
```

Expected: all tests pass. Existing `pytest-asyncio` deprecation warnings may remain, but no failures or errors are allowed.

**Step 4: Commit**

```powershell
git add backend/tests/document_chain/test_document_chain_success_scenario.py
git commit -m "test: cover persistent document chain success scenario"
```

### Task 9: Add Electron snapshot compatibility adapter

**Files:**
- Create: `desktop/src/main/backend-snapshot-adapter.js`
- Modify: `desktop/src/main/document-package.js`
- Test: `desktop/tests/backend-snapshot-adapter.test.js`

**Step 1: Write failing adapter tests**

Verify a backend snapshot maps to the existing `DocumentContext` fields for estimate, contract, KS-2, KS-3, and M-29 without changing renderer-facing method names.

**Step 2: Run RED**

```powershell
node --test desktop/tests/backend-snapshot-adapter.test.js
```

**Step 3: Implement pure mapping functions**

No HTTP calls inside the mapper. The launcher/API layer supplies snapshot JSON; the adapter only validates schema version and maps data to the existing kernel contract.

**Step 4: Run GREEN and desktop regression suite**

```powershell
node --test desktop/tests/backend-snapshot-adapter.test.js
node --test desktop/tests
```

**Step 5: Commit**

```powershell
git add desktop/src/main/backend-snapshot-adapter.js desktop/src/main/document-package.js desktop/tests/backend-snapshot-adapter.test.js
git commit -m "feat: render backend document snapshots in Electron"
```

### Task 10: Final verification and release checkpoint

**Files:**
- Verify only unless a test exposes a defect.

**Step 1: Backend verification**

```powershell
backend\venv\Scripts\python.exe -m pytest backend\tests -q
```

**Step 2: Desktop verification**

```powershell
node --test
```

Working directory: `desktop`.

**Step 3: Frontend production build**

```powershell
npm run build
```

Working directory: `frontend`.

**Step 4: Packaging decision**

Run `npm run build:win` only if backend executable, Electron runtime, renderer resources, or packaging configuration changed. If only backend source changed, rebuild the backend executable before packaging.

**Step 5: Review dirty-worktree boundaries**

Run:

```powershell
git diff --check
git status --short
git log -12 --oneline
```

Confirm no unrelated user file was staged or overwritten.

**Step 6: Record release evidence**

Report exact test counts, build exit codes, installer path if rebuilt, SHA-256, signature status, and rollback commits.
