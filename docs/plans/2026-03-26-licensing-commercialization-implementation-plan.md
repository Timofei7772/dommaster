# Licensing Commercialization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship the existing SmetaAI Electron desktop application as a commercially licensable Windows product with hybrid license validation, hardware-bound activation slots, demo/full feature gating, admin signing tooling, and release documentation, without redesigning the current UI.

**Architecture:** The implementation keeps the existing Electron + React + Python/FastAPI structure. License truth moves into the Electron main process and backend license API. The renderer becomes UI-only for activation flows. The server stores licenses plus activation slots, signs canonical payloads with an RSA private key, and the desktop app validates those payloads offline for up to 7 days using the embedded public key.

**Tech Stack:** Electron, Node.js, React/TypeScript, FastAPI, SQLAlchemy, pytest, Node test runner, NSIS via electron-builder.

---

**Workspace note:** `C:\Projects\SmetaAI` is not currently a git worktree. Replace normal commit checkpoints with manual checkpoints recorded in the task notes until git is initialized.

### Task 1: Add backend license models and persistence tests first

**Files:**
- Create: `C:\Projects\SmetaAI\backend\app\models\license.py`
- Modify: `C:\Projects\SmetaAI\backend\app\models\__init__.py`
- Create: `C:\Projects\SmetaAI\backend\tests\test_license_models.py`
- Verify: `C:\Projects\SmetaAI\backend\app\models\estimate.py`
- Verify: `C:\Projects\SmetaAI\docs\plans\2026-03-26-licensing-commercialization-design.md`

**Step 1: Write the failing test**

Create `backend/tests/test_license_models.py` with tests that assert:

```python
from datetime import datetime, timedelta, timezone


def test_license_defaults_include_expected_status_and_limits():
    from app.models.license import License

    license_obj = License(
        license_key="ZARU-ABCD-EFGH-JKLM-NPQR",
        license_type="standard",
        max_pcs=1,
        issued_date=datetime.now(timezone.utc),
        expires_at=datetime.now(timezone.utc) + timedelta(days=365),
    )

    assert license_obj.status == "active"
    assert license_obj.max_pcs == 1


def test_activation_model_supports_slot_and_hardware_fingerprint():
    from app.models.license import LicenseActivation

    activation = LicenseActivation(
        device_slot_id=1,
        hardware_fingerprint="abc123",
        status="active",
    )

    assert activation.device_slot_id == 1
    assert activation.hardware_fingerprint == "abc123"
```

**Step 2: Run test to verify it fails**

Run:

```powershell
python -m pytest -q tests/test_license_models.py
```

Expected: FAIL because the license models do not exist yet.

**Step 3: Write minimal implementation**

Implement SQLAlchemy models for:
- `License`
- `LicenseActivation`
- `LicenseAuditLog`

Ensure the models cover:
- license key, tariff, status, expiry, max slots;
- activation slot number and hardware fingerprint;
- audit events for activation, replacement, and violations.

Export the new models through `backend/app/models/__init__.py`.

**Step 4: Run test to verify it passes**

Run:

```powershell
python -m pytest -q tests/test_license_models.py
```

Expected: PASS.

**Step 5: Manual checkpoint**

Record that backend persistence now supports commercial licenses, activation slots, and audit history.

### Task 2: Implement FastAPI license endpoints with slot logic and signed payloads

**Files:**
- Create: `C:\Projects\SmetaAI\backend\app\routers\license.py`
- Create: `C:\Projects\SmetaAI\backend\app\services\license_service.py`
- Modify: `C:\Projects\SmetaAI\backend\app\routers\__init__.py`
- Modify: `C:\Projects\SmetaAI\backend\app\main.py`
- Create: `C:\Projects\SmetaAI\backend\tests\test_license_api.py`
- Verify: `C:\Projects\SmetaAI\backend\app\routers\estimates.py`

**Step 1: Write the failing test**

Create `backend/tests/test_license_api.py` with coverage for:

```python
from fastapi.testclient import TestClient


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

    client.post("/api/license/activate", json={"license_key": "ZARU-AAAA-BBBB-CCCC-DDDD", "hardware_fingerprint": "fp-1", "hardware_components": {}, "device_name": "PC-1", "force_deactivate_previous": False, "app_version": "1.0.0"})
    client.post("/api/license/activate", json={"license_key": "ZARU-AAAA-BBBB-CCCC-DDDD", "hardware_fingerprint": "fp-2", "hardware_components": {}, "device_name": "PC-2", "force_deactivate_previous": False, "app_version": "1.0.0"})
    third = client.post("/api/license/activate", json={"license_key": "ZARU-AAAA-BBBB-CCCC-DDDD", "hardware_fingerprint": "fp-3", "hardware_components": {}, "device_name": "PC-3", "force_deactivate_previous": False, "app_version": "1.0.0"})

    assert third.json()["error_code"] == "ACTIVATION_LIMIT_REACHED"
    assert third.json()["max_pcs"] == 2
```

**Step 2: Run test to verify it fails**

Run:

```powershell
python -m pytest -q tests/test_license_api.py
```

Expected: FAIL because the router/service do not exist yet.

**Step 3: Write minimal implementation**

Add FastAPI endpoints for:
- `POST /api/license/activate`
- `POST /api/license/deactivate`
- `GET /api/license/devices/{license_key}`
- `POST /api/license/validate`
- `GET /api/license/status/{license_key}`

Implement slot rules in `license_service.py`:
- same hardware reactivation is idempotent success;
- free slot assignment uses the lowest free slot id;
- `force_deactivate_previous=true` removes the oldest active activation;
- signed payload uses canonical JSON and RSA signature;
- API responses include masked device info for UI use.

Register the router in the app entrypoint.

**Step 4: Run test to verify it passes**

Run:

```powershell
python -m pytest -q tests/test_license_api.py
```

Expected: PASS.

**Step 5: Manual checkpoint**

Record that the backend now acts as the source of truth for activation slots and signed license payloads.

### Task 3: Add admin signing and license generation CLI

**Files:**
- Create: `C:\Projects\SmetaAI\scripts\admin\generate_license.js`
- Create: `C:\Projects\SmetaAI\desktop\tests\generate-license.test.js`
- Verify: `C:\Projects\SmetaAI\docs\plans\2026-03-26-licensing-commercialization-design.md`

**Step 1: Write the failing test**

Create `desktop/tests/generate-license.test.js` with assertions such as:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');

const { LicenseGenerator, canonicalStringify } = require('../../scripts/admin/generate_license');

test('generateKey returns branded key with expected slot count', () => {
  const generator = new LicenseGenerator('test-private-key');
  const result = generator.generateLicense({
    clientName: 'OOO Romashka',
    clientEmail: 'client@example.com',
    licenseType: 'double',
    maxPcs: 2,
    durationDays: 365,
  });

  assert.match(result.license_key, /^ZARU-[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}$/);
  assert.equal(result.payload.max_pcs, 2);
});

test('canonicalStringify is stable for nested objects', () => {
  const a = canonicalStringify({ b: 1, a: { y: 2, x: 1 } });
  const b = canonicalStringify({ a: { x: 1, y: 2 }, b: 1 });
  assert.equal(a, b);
});
```

**Step 2: Run test to verify it fails**

Run:

```powershell
node --test desktop/tests/generate-license.test.js
```

Expected: FAIL because the admin generator module does not exist yet.

**Step 3: Write minimal implementation**

Create the admin CLI to:
- generate `ZARU-XXXX-XXXX-XXXX-XXXX` keys;
- map tariff to `max_pcs` and price;
- build canonical payloads;
- sign payloads with RSA private key loaded from environment or file;
- emit JSON artifacts for admin operations.

Export helpers for testability.

**Step 4: Run test to verify it passes**

Run:

```powershell
node --test desktop/tests/generate-license.test.js
```

Expected: PASS.

**Step 5: Manual checkpoint**

Record that license issuance is now reproducible and cryptographically signed outside the client app.

### Task 4: Build Electron main-process licensing core

**Files:**
- Create: `C:\Projects\SmetaAI\desktop\src\main\hardware-fingerprint.js`
- Create: `C:\Projects\SmetaAI\desktop\src\main\license-storage.js`
- Create: `C:\Projects\SmetaAI\desktop\src\main\security-logger.js`
- Create: `C:\Projects\SmetaAI\desktop\src\main\license-manager.js`
- Create: `C:\Projects\SmetaAI\desktop\tests\license-manager.test.js`
- Verify: `C:\Projects\SmetaAI\desktop\src\license-secure.js`

**Step 1: Write the failing test**

Create `desktop/tests/license-manager.test.js` with tests that assert:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');

const LicenseManager = require('../src/main/license-manager');

test('validateOnStartup returns demo mode when cache is missing', async () => {
  const manager = new LicenseManager({
    storage: { load: async () => null },
    fingerprint: { generate: async () => ({ fingerprint: 'fp', components: {}, tolerance: { required_matches: 3, total_components: 5 } }) },
  });

  const result = await manager.validateOnStartup();
  assert.equal(result.mode, 'DEMO');
});

test('activateLicense uses cached signed payload when offline and within cache window', async () => {
  const manager = new LicenseManager({ /* dependency stubs */ });
  const result = await manager.activateLicense('ZARU-ABCD-EFGH-JKLM-NPQR');
  assert.equal(result.success, true);
  assert.equal(result.offline, true);
});
```

**Step 2: Run test to verify it fails**

Run:

```powershell
node --test desktop/tests/license-manager.test.js
```

Expected: FAIL because the modules do not exist yet.

**Step 3: Write minimal implementation**

Implement:
- multi-source fingerprint collection with `wmic` + PowerShell/CIM fallback;
- recursive canonical payload verification with the embedded public key;
- AES-256-GCM cache storage with Windows-friendly local key derivation fallback;
- 7-day offline cache window;
- startup validation, activation, device listing, and deactivation orchestration;
- local security log entries for mismatches and invalid signatures.

Make the manager dependency-injectable enough for test stubbing.

**Step 4: Run test to verify it passes**

Run:

```powershell
node --test desktop/tests/license-manager.test.js
```

Expected: PASS.

**Step 5: Manual checkpoint**

Record that the Electron main process now owns license truth locally and can safely operate offline for 7 days.

### Task 5: Refactor the existing Electron facade and IPC bridge without breaking the UI contract

**Files:**
- Modify: `C:\Projects\SmetaAI\desktop\src\license-secure.js`
- Modify: `C:\Projects\SmetaAI\desktop\main.js`
- Modify: `C:\Projects\SmetaAI\desktop\preload.js`
- Create: `C:\Projects\SmetaAI\desktop\tests\license-ipc.test.js`
- Verify: `C:\Projects\SmetaAI\frontend\src\pages\Activation.tsx`

**Step 1: Write the failing test**

Create `desktop/tests/license-ipc.test.js` with assertions such as:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');

const createFacade = require('../src/license-secure');

test('facade keeps legacy methods and exposes new device methods', async () => {
  const facade = new createFacade({
    manager: {
      validateOnStartup: async () => ({ valid: true, mode: 'FULL', license: { features: { export_pdf: true } } }),
      activateLicense: async () => ({ success: true }),
      getActiveDevices: async () => ({ success: true, devices: [] }),
      deactivateDevice: async () => ({ success: true }),
    },
  });

  assert.equal(typeof facade.checkLicense, 'function');
  assert.equal(typeof facade.activateLicense, 'function');
  assert.equal(typeof facade.getActiveDevices, 'function');
  assert.equal(typeof facade.deactivateDevice, 'function');
});
```

**Step 2: Run test to verify it fails**

Run:

```powershell
node --test desktop/tests/license-ipc.test.js
```

Expected: FAIL because the facade/IPC bridge are not updated yet.

**Step 3: Write minimal implementation**

Update the existing desktop layer so that:
- `desktop/src/license-secure.js` becomes a facade over the new manager;
- legacy methods keep their existing names for compatibility;
- preload exports add `getActiveDevices`, `deactivateDevice`, and `getStatus`;
- main-process IPC handlers route to the facade without changing renderer call sites.

**Step 4: Run test to verify it passes**

Run:

```powershell
node --test desktop/tests/license-ipc.test.js
```

Expected: PASS.

**Step 5: Manual checkpoint**

Record that the new licensing core is fully wired into the existing Electron shell without breaking the current activation UI contract.

### Task 6: Move demo/full feature enforcement into protected paths

**Files:**
- Modify: `C:\Projects\SmetaAI\desktop\main.js`
- Modify: `C:\Projects\SmetaAI\backend\app\services\document_generator.py`
- Modify: `C:\Projects\SmetaAI\backend\app\services\estimate_template_builder.py`
- Create: `C:\Projects\SmetaAI\desktop\tests\feature-gating.test.js`
- Verify: current AI request handlers and export handlers in the desktop/backend integration layer

**Step 1: Write the failing test**

Create `desktop/tests/feature-gating.test.js` with assertions such as:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');

const { canCreateEstimate, canUsePdfExport, canUseAiRequest } = require('../src/main/license-manager');

test('demo mode blocks pdf export', async () => {
  const result = await canUsePdfExport({ mode: 'DEMO' });
  assert.equal(result.allowed, false);
});

test('demo mode allows only three estimates', async () => {
  const result = await canCreateEstimate({ mode: 'DEMO', estimatesCount: 3 });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /лимит/i);
});
```

**Step 2: Run test to verify it fails**

Run:

```powershell
node --test desktop/tests/feature-gating.test.js
```

Expected: FAIL because the protected-path enforcement does not exist yet.

**Step 3: Write minimal implementation**

Move enforcement into trusted code paths:
- gate estimate creation after 3 demo documents;
- block PDF export in demo mode;
- add demo watermark in the protected export path;
- cap demo AI usage at 5 requests;
- ensure feature checks are made in the main process or backend service, not only in the renderer.

Reuse existing document-generation/export entrypoints instead of adding duplicate logic.

**Step 4: Run test to verify it passes**

Run:

```powershell
node --test desktop/tests/feature-gating.test.js
```

Expected: PASS.

**Step 5: Manual checkpoint**

Record that demo restrictions are now enforced in trusted execution paths and cannot be bypassed by renderer-only edits.

### Task 7: Update the activation UI without redesigning it

**Files:**
- Modify: `C:\Projects\SmetaAI\frontend\src\pages\Activation.tsx`
- Create: `C:\Projects\SmetaAI\frontend\src\components\ActiveDevices.tsx`
- Modify: `C:\Projects\SmetaAI\frontend\src\lib\electron.ts`
- Verify: `C:\Projects\SmetaAI\frontend\src\pages\LicensePage.tsx` or equivalent existing license container

**Step 1: Write the failing test or verification target**

If the frontend already has a test harness, add assertions for:
- tariff cards show `2500 / 5000 / 10000`;
- activation errors render slot/device information;
- active device list renders when the server returns `ACTIVATION_LIMIT_REACHED`.

If no frontend test harness exists, use the build as the first verification target.

Run:

```powershell
npm run build
```

from `C:\Projects\SmetaAI\frontend`.

Expected: either FAIL due to missing new component wiring or PASS before changes as a baseline.

**Step 2: Write minimal implementation**

Update the activation UI so that:
- it no longer trusts `localStorage` as the license source of truth;
- it fetches license status through Electron IPC;
- it shows the approved tariffs:
  - `Standard` — `1 ПК` — `2 500 ₽`
  - `Double` — `2 ПК` — `5 000 ₽`
  - `Enterprise` — `5 ПК` — `10 000 ₽`
- it displays approved warnings about hardware binding and activation-slot limits;
- it embeds an `ActiveDevices` component inside the existing license flow without adding new navigation.

Do not redesign the UI structure or route layout.

**Step 3: Run verification**

Run:

```powershell
npm run build
```

from `C:\Projects\SmetaAI\frontend`.

Expected: PASS.

**Step 4: Manual checkpoint**

Record that the renderer now reflects the hardened licensing flow while preserving the existing UI structure.

### Task 8: Prepare packaging configuration, docs, and release verification

**Files:**
- Modify: `C:\Projects\SmetaAI\desktop\package.json`
- Create: `C:\Projects\SmetaAI\docs\admin\license_management.md`
- Create: `C:\Projects\SmetaAI\docs\client\getting_started.md`
- Create: `C:\Projects\SmetaAI\docs\client\README.txt`
- Create: `C:\Projects\SmetaAI\docs\security\licensing_test_report.md`
- Verify: `C:\Projects\SmetaAI\desktop\dist`

**Step 1: Write documentation and packaging acceptance targets**

Define acceptance criteria covering:
- NSIS artifact naming and included resources;
- admin instructions for issuing and revoking licenses;
- client getting-started steps with Telegram-only support;
- security test report for slot limits, invalid signatures, offline expiry, and hardware mismatches.

**Step 2: Write minimal implementation**

Update the packaging and docs so that:
- Electron Builder is configured for the commercial installer naming convention;
- the client package docs match the approved Russian-language commercial messaging;
- the admin doc explains issuance, activation slots, and forced device replacement;
- the security report records tested scenarios and their expected outcomes.

**Step 3: Run end-to-end verification**

Run the following after the feature work is complete:

```powershell
python -m pytest -q tests/test_license_models.py tests/test_license_api.py
node --test desktop/tests/generate-license.test.js desktop/tests/license-manager.test.js desktop/tests/license-ipc.test.js desktop/tests/feature-gating.test.js
npm run build
npm run build:win
```

Use the backend, frontend, and desktop working directories as appropriate.

Expected: PASS, with `desktop/dist/SmetaAI_Setup_<version>.exe` produced.

**Step 4: Manual checkpoint**

Record that the commercial packaging, operational docs, and verification evidence are ready for release review.
