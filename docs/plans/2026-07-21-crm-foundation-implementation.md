# CRM Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a company-isolated, persistent CRM flow from lead creation through idempotent conversion into a client that is ready for project creation.

**Architecture:** Extend the existing FastAPI/SQLAlchemy backend instead of introducing a parallel CRM package. Store leads as first-class database rows, put company-scoped persistence behind repositories, keep business transactions in `CrmService`, and preserve the existing `/api/leads` prefix and legacy conversion endpoint.

**Tech Stack:** Python 3.11+, FastAPI, Pydantic 2, SQLAlchemy 2 async ORM, SQLite/aiosqlite, pytest, pytest-asyncio.

---

## Working-tree safety

The repository already contains user changes in `backend/app/main.py`, `backend/app/models/__init__.py`, and `backend/app/routers/clients.py`. Before every edit:

1. Save `git diff -- <target files>` in the task notes.
2. Apply only narrow patches around the intended symbols.
3. Re-run `git diff -- <target files>` and verify the earlier hunks remain intact.
4. Stage and commit new files independently. Do not stage an already-dirty file wholesale unless its pre-existing diff has been explicitly separated and reviewed.

No new dependency, public API prefix, or destructive database operation is allowed in this plan.

### Task 1: Establish async CRM test infrastructure

**Files:**
- Create: `backend/tests/crm/__init__.py`
- Create: `backend/tests/crm/conftest.py`
- Create: `backend/tests/crm/test_models.py`

**Step 1: Write the failing model contract test**

Create an isolated in-memory SQLite engine per test, enable foreign keys, create metadata, and expose `db_session`, `company`, and `manager` fixtures. Add this initial assertion:

```python
async def test_lead_defaults_to_new_and_belongs_to_company(db_session, company, manager):
    from app.models.lead import Lead, LeadStatus

    lead = Lead(
        company_id=company.id,
        assigned_to=manager.id,
        name="Иван Петров",
        phone="+79990000000",
    )
    db_session.add(lead)
    await db_session.flush()

    assert lead.id is not None
    assert lead.status is LeadStatus.NEW
    assert lead.company_id == company.id
```

The fixtures must import `app.models` before `Base.metadata.create_all` so every relationship is registered.

**Step 2: Run the test and verify RED**

Run from `backend`:

```powershell
py -m pytest tests/crm/test_models.py -q
```

Expected: collection fails with `ModuleNotFoundError: app.models.lead`.

**Step 3: Commit only the new test scaffold**

```powershell
git add backend/tests/crm
git commit -m "test: define CRM lead model contract"
```

### Task 2: Add the persistent Lead model and tenant relationship

**Files:**
- Create: `backend/app/models/lead.py`
- Modify: `backend/app/models/client.py`
- Modify: `backend/app/models/company.py`
- Modify: `backend/app/models/user.py`
- Modify: `backend/app/models/__init__.py`
- Test: `backend/tests/crm/test_models.py`

**Step 1: Implement the minimal Lead model**

Use string-valued enums so SQLite and API payloads remain readable:

```python
class LeadStatus(str, enum.Enum):
    NEW = "new"
    CONTACTED = "contacted"
    QUALIFIED = "qualified"
    PROPOSAL = "proposal"
    CONTRACT = "contract"
    LOST = "lost"


class Lead(Base):
    __tablename__ = "leads"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=True, index=True)
    name = Column(String(500), nullable=False, index=True)
    phone = Column(String(50), nullable=True, index=True)
    email = Column(String(200), nullable=True, index=True)
    description = Column(Text, nullable=True)
    address = Column(String(500), nullable=True)
    expected_budget = Column(Float, nullable=True)
    source = Column(String(100), nullable=False, default="manual")
    external_url = Column(String(1000), nullable=True)
    status = Column(Enum(LeadStatus), nullable=False, default=LeadStatus.NEW, index=True)
    converted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    company = relationship("Company", back_populates="leads")
    manager = relationship("User", foreign_keys=[assigned_to], back_populates="assigned_leads")
    client = relationship("Client", back_populates="source_leads")
```

Add `Client.company_id` with `nullable=False` for fresh databases and relationships `Client.company` and `Client.source_leads`. Add matching `Company.clients`, `Company.leads`, and `User.assigned_leads` relationships. Do not remove `UserRole.CLIENT`.

Export `Lead` and `LeadStatus` from `app.models` without disturbing the existing uncommitted `M29Report` export.

**Step 2: Extend tests**

Add tests proving:

- lead default status is `new`;
- lead connects to manager, company, and converted client;
- a fresh `Client` requires `company_id` at the application fixture level;
- two companies may have clients with the same phone/email.

**Step 3: Run the model tests and verify GREEN**

```powershell
py -m pytest tests/crm/test_models.py -q
```

Expected: all CRM model tests pass.

**Step 4: Run current backend tests**

```powershell
py -m pytest -q
```

Expected: the known document export failure may remain; no new model/import failures are allowed.

**Step 5: Commit safe new files**

Commit `lead.py` separately. Keep already-dirty files unstaged until their combined diff has been reviewed.

### Task 3: Add an idempotent packaged-SQLite schema migration

**Files:**
- Create: `backend/app/schema_migrations.py`
- Create: `backend/tests/crm/test_schema_migrations.py`
- Modify: `backend/app/main.py`

**Step 1: Write failing migration tests**

Create two file-backed temporary SQLite databases:

1. A clean database where `Base.metadata.create_all` produces `clients.company_id` and `leads`.
2. A legacy database with `companies` and `clients` but no `clients.company_id`.

The legacy test must assert that running the migration twice:

- adds `clients.company_id` exactly once;
- creates `ix_clients_company_id`;
- assigns existing clients when exactly one company exists;
- leaves the data intact;
- does not fail on the second run.

**Step 2: Run tests and verify RED**

```powershell
py -m pytest tests/crm/test_schema_migrations.py -q
```

Expected: failure because `app.schema_migrations` does not exist.

**Step 3: Implement the runtime migration**

Expose one function:

```python
async def migrate_crm_schema(connection: AsyncConnection) -> None:
    table_names = await connection.run_sync(
        lambda sync_conn: set(inspect(sync_conn).get_table_names())
    )
    if "clients" not in table_names:
        return

    client_columns = await connection.run_sync(
        lambda sync_conn: {
            item["name"] for item in inspect(sync_conn).get_columns("clients")
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

    company_ids = list((await connection.execute(
        text("SELECT id FROM companies ORDER BY id")
    )).scalars()) if "companies" in table_names else []
    if len(company_ids) == 1:
        await connection.execute(
            text("UPDATE clients SET company_id = :company_id WHERE company_id IS NULL"),
            {"company_id": company_ids[0]},
        )
```

Do not silently assign legacy clients when multiple companies exist. Log a warning with the unassigned row count instead.

In `lifespan`, call `migrate_crm_schema(conn)` before `Base.metadata.create_all`. Preserve all existing seed, Telegram, protected-router, and health-check changes in `main.py`.

**Step 4: Run migration tests and verify GREEN**

```powershell
py -m pytest tests/crm/test_schema_migrations.py -q
```

Expected: all migration tests pass and legacy rows remain present.

**Step 5: Run the migration against a copied database**

Copy a representative DB into a temporary directory, run the migration against the copy, and inspect:

```sql
PRAGMA table_info(clients);
PRAGMA foreign_key_list(clients);
SELECT COUNT(*) FROM clients WHERE company_id IS NULL;
```

Never test the first migration run against the user's only live database.

**Step 6: Commit new migration files**

```powershell
git add backend/app/schema_migrations.py backend/tests/crm/test_schema_migrations.py
git commit -m "feat: add idempotent CRM schema migration"
```

Leave the pre-dirty `main.py` unstaged unless its combined diff is explicitly reviewed.

### Task 4: Add company-scoped repositories

**Files:**
- Create: `backend/app/repositories/__init__.py`
- Create: `backend/app/repositories/lead_repository.py`
- Create: `backend/app/repositories/client_repository.py`
- Create: `backend/tests/crm/test_repositories.py`

**Step 1: Write failing isolation and matching tests**

Cover:

- `LeadRepository.get_by_id(lead_id, company_id)` returns only the active company's lead;
- list filtering never returns another company's rows;
- `ClientRepository.find_match` normalizes phone by digits and email by lowercase/trim;
- matching is limited to one company;
- an email match and phone match that point to different clients is reported as ambiguous rather than guessed.

**Step 2: Run tests and verify RED**

```powershell
py -m pytest tests/crm/test_repositories.py -q
```

Expected: repository imports fail.

**Step 3: Implement repositories**

Repositories receive `AsyncSession` in the constructor, use SQLAlchemy `select`, call `flush` after inserts, and never call `commit`.

Key interfaces:

```python
class LeadRepository:
    async def create(self, *, company_id: int, assigned_to: int | None, **data) -> Lead: ...
    async def get_by_id(self, lead_id: int, company_id: int) -> Lead | None: ...
    async def list(self, company_id: int, status: LeadStatus | None = None) -> list[Lead]: ...


class ClientRepository:
    async def create(self, *, company_id: int, **data) -> Client: ...
    async def get_by_id(self, client_id: int, company_id: int) -> Client | None: ...
    async def find_match(
        self, *, company_id: int, phone: str | None, email: str | None
    ) -> Client | None: ...
```

Define a specific `AmbiguousClientMatchError` for conflicting identity matches.

**Step 4: Run repository tests and verify GREEN**

```powershell
py -m pytest tests/crm/test_repositories.py -q
```

Expected: all repository tests pass.

**Step 5: Commit**

```powershell
git add backend/app/repositories backend/tests/crm/test_repositories.py
git commit -m "feat: add company-scoped CRM repositories"
```

### Task 5: Implement funnel rules in CrmService

**Files:**
- Create: `backend/app/services/crm_service.py`
- Create: `backend/tests/crm/test_crm_service.py`

**Step 1: Write failing transition tests**

Define the allowed transition map:

```python
ALLOWED_TRANSITIONS = {
    LeadStatus.NEW: {LeadStatus.CONTACTED, LeadStatus.LOST},
    LeadStatus.CONTACTED: {LeadStatus.QUALIFIED, LeadStatus.LOST},
    LeadStatus.QUALIFIED: {LeadStatus.PROPOSAL, LeadStatus.LOST},
    LeadStatus.PROPOSAL: {LeadStatus.CONTRACT, LeadStatus.LOST},
    LeadStatus.CONTRACT: set(),
    LeadStatus.LOST: set(),
}
```

Test an allowed move, a skipped move, movement out of `lost`, another company's lead, and missing company context.

**Step 2: Run tests and verify RED**

```powershell
py -m pytest tests/crm/test_crm_service.py -q
```

Expected: `CrmService` is missing.

**Step 3: Implement minimal service errors and transition method**

Use domain errors rather than raising `HTTPException` in the service:

```python
class CrmError(Exception): ...
class LeadNotFoundError(CrmError): ...
class InvalidLeadTransitionError(CrmError): ...
class MissingCompanyError(CrmError): ...
```

`change_status` loads through `LeadRepository`, validates the map, updates the model, writes an audit entry, and flushes. Transaction commit remains owned by the request dependency.

**Step 4: Run tests and verify GREEN**

```powershell
py -m pytest tests/crm/test_crm_service.py -q
```

**Step 5: Commit**

```powershell
git add backend/app/services/crm_service.py backend/tests/crm/test_crm_service.py
git commit -m "feat: enforce CRM funnel transitions"
```

### Task 6: Implement atomic, idempotent lead conversion

**Files:**
- Modify: `backend/app/services/crm_service.py`
- Modify: `backend/tests/crm/test_crm_service.py`

**Step 1: Write failing conversion tests**

Cover these exact outcomes:

- new contact creates one client in the same company;
- matching phone or email reuses the existing client;
- another company's matching client is never reused;
- a second conversion returns the already-linked client and does not create another row;
- conversion sets `lead.client_id`, `converted_at`, and status `contract`;
- ambiguous identity raises a conflict error and changes no rows;
- an injected audit failure rolls the request transaction back.

**Step 2: Run focused tests and verify RED**

```powershell
py -m pytest tests/crm/test_crm_service.py -k convert -q
```

**Step 3: Implement conversion**

Return a result object that distinguishes reuse:

```python
@dataclass(frozen=True)
class LeadConversionResult:
    lead: Lead
    client: Client
    reused_client: bool
    ready_for_project: bool = True
```

If `lead.client_id` exists, resolve it within the same company and return it. Otherwise find or create a client, link it, set timestamps/status, write audit entries, and flush. Do not call `commit` inside the service.

**Step 4: Run all service tests and verify GREEN**

```powershell
py -m pytest tests/crm/test_crm_service.py -q
```

**Step 5: Commit**

```powershell
git add backend/app/services/crm_service.py backend/tests/crm/test_crm_service.py
git commit -m "feat: convert leads into clients atomically"
```

### Task 7: Expose the persistent lead API and keep legacy compatibility

**Files:**
- Modify: `backend/app/routers/leads.py`
- Create: `backend/tests/crm/test_leads_api.py`

**Step 1: Write failing API tests**

Build a small FastAPI test app that mounts `leads.router`, overrides `get_db` and `get_current_user`, and tests:

- owner/manager can create and list leads;
- estimator/viewer receives `403` on writes;
- list is company-scoped;
- invalid transition returns `400`;
- foreign-company lead returns `404`;
- conversion returns `client`, `reused_client`, and `ready_for_project`;
- legacy `POST /convert` creates a persistent lead then delegates to the same conversion path.

**Step 2: Run tests and verify RED**

```powershell
py -m pytest tests/crm/test_leads_api.py -q
```

**Step 3: Add Pydantic 2 schemas and handlers**

Keep parser search at `/search` and source discovery at `/sources`. Add:

```python
@router.post("/", response_model=LeadResponse, status_code=201)
async def create_lead(...): ...

@router.get("/", response_model=list[LeadResponse])
async def list_leads(...): ...

@router.patch("/{lead_id}/status", response_model=LeadResponse)
async def change_lead_status(...): ...

@router.post("/{lead_id}/convert", response_model=LeadConversionResponse)
async def convert_persisted_lead(...): ...
```

Resolve domain errors centrally in small router helper functions. Require `current_user.company_id` and allow CRM writes only for owner, admin, or manager. Do not add `/api/v1` in this sprint.

**Step 4: Run API tests and verify GREEN**

```powershell
py -m pytest tests/crm/test_leads_api.py -q
```

**Step 5: Run all CRM tests**

```powershell
py -m pytest tests/crm -q
```

Expected: all CRM tests pass.

**Step 6: Commit**

```powershell
git add backend/app/routers/leads.py backend/tests/crm/test_leads_api.py
git commit -m "feat: expose persistent CRM lead API"
```

### Task 8: Tenant-scope the existing Client API

**Files:**
- Modify: `backend/app/routers/clients.py`
- Create: `backend/tests/crm/test_clients_api.py`

**Step 1: Write failing client isolation tests**

Test list, detail, create, update, and delete using two companies. Every operation must be limited to `current_user.company_id`; foreign records return `404`. Creating a client without a company-bound user returns `400`.

**Step 2: Run tests and verify RED**

```powershell
py -m pytest tests/crm/test_clients_api.py -q
```

**Step 3: Route all persistence through ClientRepository**

Add `current_user: User = Depends(get_current_user)` to each handler. Set `company_id` from the authenticated user, never from the request body. Preserve the user's existing `ConfigDict(from_attributes=True)` change.

**Step 4: Run tests and verify GREEN**

```powershell
py -m pytest tests/crm/test_clients_api.py -q
```

**Step 5: Run CRM regression suite**

```powershell
py -m pytest tests/crm -q
```

Expected: all CRM tests pass.

**Step 6: Review rather than blindly commit the dirty router**

Compare the new diff with the pre-task diff. Commit the new test file independently. Stage the router only after confirming its prior Pydantic change remains intact and no unrelated hunk is included.

### Task 9: Verify application integration and fix only discovered CRM regressions

**Files:**
- Modify only if required: `backend/app/main.py`
- Modify only if required: `backend/app/models/__init__.py`
- Test: all `backend/tests/crm/`

**Step 1: Import the production application**

```powershell
py -c "from app.main import app; print(len(app.routes))"
```

Expected: successful import and a positive route count.

**Step 2: Verify OpenAPI contracts**

Use `app.openapi()` in a focused test and assert paths for lead creation, listing, status change, persisted conversion, and legacy conversion. Assert protected routes still have bearer authentication metadata.

**Step 3: Run complete backend tests**

```powershell
py -m pytest -q
```

Expected: CRM tests pass. Fix the already-observed `test_generate_estimate_export_returns_xlsx_path` failure separately only if it remains the sole failure; do not hide or mark it xfail.

**Step 4: Run Ruff on changed CRM files**

```powershell
py -m ruff check app/models/lead.py app/repositories app/services/crm_service.py app/routers/leads.py app/routers/clients.py tests/crm
```

Expected: no errors.

**Step 5: Create an integration checkpoint**

Commit only reviewed CRM hunks and new files. Confirm with:

```powershell
git status --short
git diff --check
```

Pre-existing unrelated modifications must still be present and unstaged.

### Task 10: Exercise the Sprint 1 success scenario against a clean database

**Files:**
- Create: `backend/tests/crm/test_success_scenario.py`
- Optional docs update: `README.md` only after tests pass

**Step 1: Write the end-to-end test**

The test must:

1. register or fixture an owner/manager in a company;
2. create a lead through HTTP;
3. move it through the supported funnel;
4. convert it;
5. fetch the resulting client;
6. assert `ready_for_project` and that `Project.client_id` can reference that client in a flush-only integration check;
7. repeat conversion and assert the same client ID is returned.

**Step 2: Run the scenario**

```powershell
py -m pytest tests/crm/test_success_scenario.py -q
```

Expected: one passing end-to-end scenario with no network access.

**Step 3: Run all backend verification**

```powershell
py -m pytest -q
py -m ruff check app tests/crm
```

Expected: both commands exit zero.

**Step 4: Commit the scenario test**

```powershell
git add backend/tests/crm/test_success_scenario.py
git commit -m "test: cover CRM lead-to-client success scenario"
```

### Task 11: Validate the CRM inside the Windows release contour

**Files:**
- No source changes unless a test exposes a defect
- Follow-up release work will use a separate installer-stabilization plan

**Step 1: Rebuild the frontend**

```powershell
cd frontend
npm run build
```

Expected: TypeScript and Vite build pass.

**Step 2: Run desktop tests**

```powershell
cd desktop
node --test tests/*.test.js
```

Expected: all current desktop tests pass (86 at plan creation time, plus any later additions).

**Step 3: Build the packaged backend**

```powershell
cd backend
pyinstaller --clean --noconfirm dommaster-server.spec
```

Expected: `backend/dist/dommaster-server.exe` exists and starts with a temporary local database.

**Step 4: Record the known installer blocker**

The current `desktop/package.json` copies the backend executable to an extensionless `resources/backend`, causing `spawn ...\\resources\\backend ENOENT`. Do not publish the installer until the separate release task changes the resource layout to `resources/backend/dommaster-server.exe`, adds a packaged smoke test, and produces a clean NSIS build.

**Step 5: Produce the Sprint 1 checkpoint report**

Report:

- CRM tests and full backend result;
- migration result on a copied legacy DB;
- frontend build and desktop test result;
- remaining unrelated failures;
- installer blocker status;
- exact commits and rollback commands.

---

## Definition of Done

- A lead is stored and tenant-scoped.
- Only authorized employees can mutate CRM state.
- Status transitions follow the approved funnel.
- Conversion is atomic and idempotent.
- A client cannot leak across companies.
- Legacy conversion callers continue to work.
- Existing desktop data is preserved by an idempotent migration.
- The full Sprint 1 success scenario passes without internet access.
- No pre-existing user changes are lost or accidentally committed.
- The CRM checkpoint is not advertised as a release installer until the known backend packaging defect is fixed and smoke-tested.

