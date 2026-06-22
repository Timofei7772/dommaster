# License Payment Flow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a minimal commercial flow for SmetaAI: create YooMoney payment, process webhook idempotently, issue a backend license record, expose current license status, and wire the first frontend purchase/license guards without changing the existing activation flow.

**Architecture:** Keep `LicenseService` as the activation source of truth. Add a new internal issuance service that creates a `License` record in the current key format and stores payment processing in the existing `license_audit_log` table to avoid a schema migration. Add payment endpoints in a separate router, then consume them from the activation page and a lightweight `useLicense()` hook.

**Tech Stack:** FastAPI, SQLAlchemy async, existing license models/services, React, existing Electron license bridge, YooMoney HTTP redirects/webhook, pytest, node test/eslint/build.

---

### Task 1: Lock the backend contract with failing tests

**Files:**
- Modify: `backend/tests/test_license_api.py`
- Create: `backend/tests/test_payment_api.py`

**Step 1: Write failing tests**

- Add license API coverage for:
  - `GET /api/license/status` returning inactive demo state when no local key is provided
  - `GET /api/license/status?license_key=...` returning current backend status
- Add payment API coverage for:
  - `POST /api/payment/create` returning a redirect URL with encoded email/plan metadata
  - `POST /api/payment/webhook` issuing one license for a paid event
  - repeated webhook for the same `payment_id` staying idempotent
  - invalid webhook amount/status being rejected

**Step 2: Run tests to verify they fail**

Run: `python -m pytest -q backend/tests/test_license_api.py backend/tests/test_payment_api.py`

**Step 3: Commit**

Do not commit yet; keep changes local until the backend turns green.

### Task 2: Implement backend issuance and payment flow

**Files:**
- Create: `backend/app/services/license_generator.py`
- Create: `backend/app/routers/payment.py`
- Modify: `backend/app/services/license_service.py`
- Modify: `backend/app/routers/license.py`
- Modify: `backend/app/config.py`
- Modify: `backend/app/main.py`

**Step 1: Add minimal issuance service**

- Create `issue_license(...)` that:
  - generates `ZARU-XXXX-XXXX-XXXX-XXXX`
  - creates a `License` row
  - stores `client_email`, `license_type`, `expires_at`, `max_pcs`
  - returns issued key + record metadata

**Step 2: Add payment router**

- Add `POST /api/payment/create`
  - accepts `email` + `plan`
  - validates known plan
  - builds YooMoney payment URL from env-backed config
- Add `POST /api/payment/webhook`
  - verifies webhook secret/token if configured
  - validates `status`, `amount`, and `plan`
  - checks `payment_id` idempotently through `LicenseAuditLog`
  - calls `issue_license(...)`
  - logs send/delivery action for now

**Step 3: Add current status endpoint**

- Extend `license.py` with `GET /status`
  - no key: return inactive/default payload
  - with `license_key`: proxy to current `LicenseService.status(...)`

**Step 4: Run backend tests**

Run: `python -m pytest -q backend/tests/test_license_api.py backend/tests/test_payment_api.py`

### Task 3: Wire frontend purchase flow and first guard

**Files:**
- Modify: `frontend/src/pages/Activation.tsx`
- Create: `frontend/src/hooks/useLicense.ts`
- Modify: `frontend/src/components/KPPreviewModal.tsx`

**Step 1: Add `useLicense()`**

- Read current desktop license info through `window.electronAPI.license.check()` when available
- Expose `isActive`, `licenseInfo`, `refresh`, and `requireLicense(action)`

**Step 2: Wire activation page purchase**

- Add “Купить” handler on `Activation.tsx`
- Call `/api/payment/create` with email and selected plan
- Redirect user to returned `payment_url`

**Step 3: Add first paywall guard**

- In `KPPreviewModal.tsx`, wrap PDF/Excel export buttons through `requireLicense(...)`
- Show a concise toast/paywall message instead of mutating export logic

**Step 4: Run frontend checks**

Run:
- `node --test .\\src\\hooks\\useEstimateFinance.test.ts .\\src\\lib\\smartPricing.test.ts`
- `npx eslint .\\src\\pages\\Activation.tsx .\\src\\hooks\\useLicense.ts .\\src\\components\\KPPreviewModal.tsx --max-warnings 0`
- `npm run build`

### Task 4: Final verification

**Files:**
- No new files expected unless verification reveals a missing fixture/helper.

**Step 1: Run full changed-surface verification**

Run:
- `python -m pytest -q backend/tests/test_license_api.py backend/tests/test_payment_api.py`
- `node --test .\\src\\hooks\\useEstimateFinance.test.ts .\\src\\lib\\smartPricing.test.ts`
- `npx eslint .\\src\\pages\\Activation.tsx .\\src\\hooks\\useLicense.ts .\\src\\components\\KPPreviewModal.tsx .\\src\\lib\\smartPricing.ts --max-warnings 0`
- `npm run build`

**Step 2: Document known follow-ups**

- Manual YooMoney sandbox/live verification
- Optional admin-protected manual issuance endpoint
- Email delivery implementation beyond structured logging
