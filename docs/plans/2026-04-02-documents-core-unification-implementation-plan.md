# Documents Core Unification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Unify the internal `SmetaAI` document pipeline behind one canonical document context and self-healing starter-db bootstrap while keeping the visible interface unchanged.

**Architecture:** The implementation introduces a hidden document kernel plus compatibility adapters so existing UI calls continue to work without renderer redesign. Startup catalog bootstrap becomes verification-based, and additional agreement templates are integrated into the same backend document family rather than remaining isolated assets.

**Tech Stack:** Electron, React, TypeScript, sql.js, existing IPC bridge, ExcelJS, DOCX template generation, Electron Builder.

---

### Task 1: Lock down the no-UI-change document adapter boundary

**Files:**
- Modify: `desktop/preload.js`
- Modify: `frontend/src/lib/electron.ts`
- Modify: `frontend/src/lib/api.ts`
- Test: `desktop/tests/document-bridge-contract.test.js`

**Step 1: Write the failing test**

Create `desktop/tests/document-bridge-contract.test.js` to assert:

- `docs.generateEstimate`, `generateKS2`, `generateKS3`, `generateContract`, `generateM29`, `generateFOT`, `generateMaterialRequest`, `generateCommercialOffer`, and `generatePackage` are still present
- `docs.generateAgreement` is exposed through preload
- duplicate namespace collisions do not erase `fot` behavior

**Step 2: Run test to verify it fails**

Run:

```powershell
node --test desktop/tests/document-bridge-contract.test.js
```

Expected: FAIL because the current bridge contract is inconsistent and `fot` is duplicated.

**Step 3: Write minimal implementation**

Normalize the bridge and adapter layers:

- remove duplicated `fot` namespace collisions in `desktop/preload.js`
- keep the current renderer signatures intact
- expose `generateAgreement` in `frontend/src/lib/electron.ts`
- add a hidden `generateAgreement` adapter in `frontend/src/lib/api.ts`

Do not modify any visible UI files in this task.

**Step 4: Run test to verify it passes**

Run:

```powershell
node --test desktop/tests/document-bridge-contract.test.js
```

Expected: PASS.

**Step 5: Run project checks**

Run:

```powershell
npm run build
```

Working directory: `frontend`

Expected: PASS.

### Task 2: Add a canonical DocumentContext contract for all document families

**Files:**
- Create: `desktop/src/document-kernel.js`
- Modify: `desktop/src/document-context.js`
- Modify: `desktop/main.js`
- Modify: `frontend/src/lib/electron.ts`
- Test: `desktop/tests/document-context.test.js`

**Step 1: Write the failing test**

Create `desktop/tests/document-context.test.js` to assert the normalized context contains:

- project/object
- estimate header/totals
- sections
- normalized rows
- normalized `DocumentType` / `AdditionalAgreementType` support points
- company/customer fields
- derived material summary
- derived labor summary
- `meta.version`, `createdAt`, and `updatedAt`

**Step 2: Run test to verify it fails**

Run:

```powershell
node --test desktop/tests/document-context.test.js
```

Expected: FAIL because the current context is not unified enough for every document family.

**Step 3: Write minimal implementation**

Create `desktop/src/document-kernel.js` and extend `desktop/src/document-context.js` so one shared context builder is used by:

- estimate
- contract
- KS-2
- KS-3
- FOT
- M-29
- material request
- commercial offer
- package

Keep context internal; do not leak a new shape into the current UI beyond additive typing support.

Inside the kernel, standardize:

- `DocumentType`
- `AdditionalAgreementType`
- normalized `AgreementData`
- one internal `generateDocument({ type, context, options })` entry

**Step 4: Run test to verify it passes**

Run:

```powershell
node --test desktop/tests/document-context.test.js
```

Expected: PASS.

**Step 5: Run project checks**

Run:

```powershell
node --test desktop/tests/document-bridge-contract.test.js desktop/tests/document-context.test.js
```

Expected: PASS.

### Task 3: Make starter-db bootstrap self-healing instead of count-based

**Files:**
- Modify: `desktop/src/catalog-bootstrap.js`
- Modify: `desktop/src/database.js`
- Test: `desktop/tests/catalog-bootstrap-recovery.test.js`

**Step 1: Write the failing test**

Create `desktop/tests/catalog-bootstrap-recovery.test.js` to cover:

- partial catalog state with works but missing materials
- missing bundled `db` files but available `starter-db/full`
- final fallback to `starter-db/quick`

**Step 2: Run test to verify it fails**

Run:

```powershell
node --test desktop/tests/catalog-bootstrap-recovery.test.js
```

Expected: FAIL because startup import only trusts `work_catalog` count.

**Step 3: Write minimal implementation**

Update bootstrap logic to:

- validate works/materials/links separately
- re-import when the catalog is incomplete
- prefer packaged `db` assets
- fall back to `starter-db/full`
- fall back to `starter-db/quick`
- return diagnostic information about the chosen source

**Step 4: Run test to verify it passes**

Run:

```powershell
node --test desktop/tests/catalog-bootstrap-recovery.test.js
```

Expected: PASS.

**Step 5: Run project checks**

Run:

```powershell
node --test desktop/tests/catalog-bootstrap-recovery.test.js desktop/tests/document-context.test.js desktop/tests/document-bridge-contract.test.js
```

Expected: PASS.

### Task 4: Route legacy document handlers through one hidden document kernel

**Files:**
- Modify: `desktop/main.js`
- Modify: `desktop/src/documents.js`
- Modify: `desktop/src/commercial-offer.js`
- Test: `desktop/tests/document-kernel-routing.test.js`

**Step 1: Write the failing test**

Create `desktop/tests/document-kernel-routing.test.js` to assert the existing handlers:

- `docs:generateEstimate`
- `docs:generateKS2`
- `docs:generateKS3`
- `docs:generateContract`
- `docs:generateM29`
- `docs:generateFOT`
- `docs:generateMaterialRequest`
- `docs:generateCommercialOffer`
- `docs:generatePackage`

all resolve context through the same kernel entry points.

**Step 2: Run test to verify it fails**

Run:

```powershell
node --test desktop/tests/document-kernel-routing.test.js
```

Expected: FAIL because generation is currently fragmented.

**Step 3: Write minimal implementation**

Refactor handlers so the old IPC names remain intact, but they delegate to shared context and dispatcher helpers inside the new kernel.

Do not change renderer-visible contracts.

**Step 4: Run test to verify it passes**

Run:

```powershell
node --test desktop/tests/document-kernel-routing.test.js
```

Expected: PASS.

**Step 5: Run project checks**

Run:

```powershell
node --test desktop/tests/document-bridge-contract.test.js desktop/tests/document-context.test.js desktop/tests/catalog-bootstrap-recovery.test.js desktop/tests/document-kernel-routing.test.js
```

Expected: PASS.

### Task 5: Integrate additional agreements into the document family without UI changes

**Files:**
- Modify: `desktop/main.js`
- Modify: `desktop/src/templates.js`
- Modify: `frontend/src/lib/electron.ts`
- Modify: `frontend/src/lib/api.ts`
- Test: `desktop/tests/agreement-generation.test.js`

**Step 1: Write the failing test**

Create `desktop/tests/agreement-generation.test.js` to assert:

- `additional`, `independent`, and `replacement` agreement types are accepted
- customer-type template resolution is deterministic
- generation returns a document path through the same backend family

**Step 2: Run test to verify it fails**

Run:

```powershell
node --test desktop/tests/agreement-generation.test.js
```

Expected: FAIL because the templates exist, but the document family is not fully normalized.

**Step 3: Write minimal implementation**

Normalize agreement generation so it uses the same context and template-selection rules as contracts and other document outputs.

Expose hidden adapter methods only; do not add new buttons or forms in the current UI.

Validation must normalize a minimal `AgreementData` schema rather than passing raw `any` through the kernel.

**Step 4: Run test to verify it passes**

Run:

```powershell
node --test desktop/tests/agreement-generation.test.js
```

Expected: PASS.

**Step 5: Run project checks**

Run:

```powershell
node --test desktop/tests/agreement-generation.test.js desktop/tests/document-kernel-routing.test.js desktop/tests/document-context.test.js
```

Expected: PASS.

### Task 6: Verify the current Documents tab works on the old UI contract

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Test: `desktop/tests/document-tab-smoke.test.js`
- Verify: `frontend/src/pages/Documents.tsx`

**Step 1: Write the failing test**

Create `desktop/tests/document-tab-smoke.test.js` to assert that the current UI-facing document actions can still:

- create KS-2
- create KS-3
- create contract
- export estimate PDF

using the old public adapter names and simple payloads.

**Step 2: Run test to verify it fails**

Run:

```powershell
node --test desktop/tests/document-tab-smoke.test.js
```

Expected: FAIL if any adapter or contract shape drifted.

**Step 3: Write minimal implementation**

Patch only the adapter layer needed to preserve the current tab behavior.

Do not edit `frontend/src/pages/Documents.tsx` unless a type-only change is unavoidable for build stability.

**Step 4: Run test to verify it passes**

Run:

```powershell
node --test desktop/tests/document-tab-smoke.test.js
```

Expected: PASS.

**Step 5: Run project checks**

Run:

```powershell
npm run build
```

Working directory: `frontend`

Expected: PASS.

### Task 7: Run the full document-core verification batch

**Files:**
- Verify only:
  - `desktop/tests/document-bridge-contract.test.js`
  - `desktop/tests/document-context.test.js`
  - `desktop/tests/catalog-bootstrap-recovery.test.js`
  - `desktop/tests/document-kernel-routing.test.js`
  - `desktop/tests/agreement-generation.test.js`
  - `desktop/tests/document-tab-smoke.test.js`
  - existing document-related desktop tests

**Step 1: Run desktop regression suite**

Run:

```powershell
node --test desktop/tests/document-bridge-contract.test.js desktop/tests/document-context.test.js desktop/tests/catalog-bootstrap-recovery.test.js desktop/tests/document-kernel-routing.test.js desktop/tests/agreement-generation.test.js desktop/tests/document-tab-smoke.test.js desktop/tests/commercial-offer.test.js desktop/tests/pdf-runtime.test.js desktop/tests/client-release-copy.test.js
```

Expected: PASS.

**Step 2: Run frontend build**

Run:

```powershell
npm run build
```

Working directory: `frontend`

Expected: PASS.

**Step 3: Optional packaging verification if resource handling changed**

Run:

```powershell
npm run build:win
```

Working directory: `desktop`

Expected: PASS and packaged resources still include `db`, `docs/client`, and `starter-db`.

**Step 4: Commit**

```bash
git add desktop/main.js desktop/preload.js desktop/src/catalog-bootstrap.js desktop/src/database.js desktop/src/document-context.js desktop/src/document-kernel.js desktop/src/documents.js desktop/src/templates.js frontend/src/lib/api.ts frontend/src/lib/electron.ts desktop/tests/document-bridge-contract.test.js desktop/tests/document-context.test.js desktop/tests/catalog-bootstrap-recovery.test.js desktop/tests/document-kernel-routing.test.js desktop/tests/agreement-generation.test.js desktop/tests/document-tab-smoke.test.js
git commit -m "feat: unify document core without UI changes"
```
