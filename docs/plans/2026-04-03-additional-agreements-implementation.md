# Additional Agreements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Добавить автоматическую генерацию трёх типов допсоглашений из существующего договора через текущий document pipeline, с disabled UI без договора и writable user template path.

**Architecture:** Допсоглашения подключаются поверх уже существующей связки `document-kernel -> document-template-adapters -> docxtemplater`. Источник истины для генерации — существующий договор и его связанная смета. Шаблоны используются из writable user directory, а UI расширяется только одной компактной секцией во вкладке `Документы`.

**Tech Stack:** Electron main/preload, React frontend, Node test runner, `docxtemplater`, локальные `.dotx` шаблоны.

---

### Task 1: Add failing backend tests for agreement contract requirement

**Files:**
- Modify: `desktop/tests/document-template-adapters.test.js`
- Create or Modify: `desktop/tests/additional-agreements.test.js`

**Step 1: Write the failing test**

Add tests for:
- generation without contract rejects with `AGREEMENT_CONTRACT_REQUIRED`
- generation with contract chooses correct agreement pipeline

**Step 2: Run test to verify it fails**

Run:

```bash
node --test desktop/tests/additional-agreements.test.js
```

Expected: FAIL because handler/kernel path does not yet enforce the contract-gated behavior.

**Step 3: Commit**

Do not commit yet. Continue after implementation is green.

### Task 2: Add failing adapter tests for agreement mapping and template resolution

**Files:**
- Modify: `desktop/tests/document-template-adapters.test.js`

**Step 1: Write the failing test**

Add minimal tests for:
- `additional` + `person`
- `additional` + `company`
- `independent`
- `replacement`

Verify:
- selected template id/path
- presence of `contract.number`, `contract.date`, `agreement.reason`, `agreement.total`

**Step 2: Run test to verify it fails**

Run:

```bash
node --test desktop/tests/document-template-adapters.test.js
```

Expected: FAIL because mapping/template resolution is incomplete.

### Task 3: Implement kernel support for agreement payload

**Files:**
- Modify: `desktop/src/document-kernel.js`

**Step 1: Write minimal implementation**

Add/verify a single builder path for:
- `additional_agreement`
- `independent_agreement`
- `replacement_agreement`

The builder must:
- require an existing contract context
- derive agreement meta from `options.agreementType`
- return stable payload sections `contract`, `project`, `estimate`, `client`, `agreement`

**Step 2: Run focused tests**

Run:

```bash
node --test desktop/tests/additional-agreements.test.js
```

Expected: backend tests move closer to green or fail at adapter/runtime layer.

### Task 4: Implement adapter mapping and template selection

**Files:**
- Modify: `desktop/src/document-template-adapters.js`

**Step 1: Write minimal implementation**

Add:
- `mapAdditionalAgreement(...)`
- template resolver for:
  - `additional`
  - `independent`
  - `replacement`
  - each split by `person/company`

Use stable output keys only. No UI logic here.

**Step 2: Run focused tests**

Run:

```bash
node --test desktop/tests/document-template-adapters.test.js desktop/tests/additional-agreements.test.js
```

Expected: mapping/template tests pass or fail only on runtime/template path.

### Task 5: Add writable template-path bootstrap

**Files:**
- Modify: `desktop/src/templates.js`
- Create if needed: `desktop/src/main/agreement-template-paths.js`
- Add tests: `desktop/tests/agreement-template-paths.test.js`

**Step 1: Write the failing test**

Test that:
- templates are resolved from writable user dir
- missing local copy is bootstrapped from bundled source
- no read/write dependency on `Program Files`

**Step 2: Run test to verify it fails**

Run:

```bash
node --test desktop/tests/agreement-template-paths.test.js
```

Expected: FAIL before implementation.

**Step 3: Write minimal implementation**

Add a helper that:
- resolves bundled DopSogl template source
- resolves writable user target dir
- copies missing templates on demand
- returns the local writable template path

**Step 4: Run tests**

Run:

```bash
node --test desktop/tests/agreement-template-paths.test.js
```

Expected: PASS

### Task 6: Connect trusted main-process handler

**Files:**
- Modify: `desktop/main.js`

**Step 1: Write minimal implementation**

Add/adjust trusted handler for agreement generation:
- require existing contract
- if missing, throw `AGREEMENT_CONTRACT_REQUIRED`
- call kernel + adapter + docx runtime

Do not change unrelated document handlers.

**Step 2: Run focused tests**

Run:

```bash
node --test desktop/tests/additional-agreements.test.js desktop/tests/document-template-adapters.test.js
```

Expected: PASS

### Task 7: Add disabled UI section in Documents

**Files:**
- Modify: `frontend/src/pages/Documents.tsx`
- Modify or Create: `frontend/src/lib/documents-support-actions.ts`
- Add tests: `frontend/src/lib/documents-support-actions.test.ts`

**Step 1: Write the failing test**

Test:
- no contract -> buttons disabled + helper text rendered
- contract exists -> buttons enabled and call correct API

**Step 2: Run test to verify it fails**

Run:

```bash
node --experimental-strip-types --test frontend/src/lib/documents-support-actions.test.ts
```

Expected: FAIL before implementation.

**Step 3: Write minimal implementation**

Add a compact section:

```text
Доп. соглашения
- Доп. к смете
- Отдельное
- Замена
```

No new screen, no redesign.

**Step 4: Run tests**

Run:

```bash
node --experimental-strip-types --test frontend/src/lib/documents-support-actions.test.ts
```

Expected: PASS

### Task 8: Run targeted regression suite

**Files:**
- No code changes unless regression fails

**Step 1: Run backend tests**

```bash
node --test desktop/tests/additional-agreements.test.js desktop/tests/document-template-adapters.test.js desktop/tests/agreement-template-paths.test.js
```

Expected: PASS

**Step 2: Run existing document suite**

```bash
node --test desktop/tests/document-kernel-generation.test.js desktop/tests/document-template-adapters.test.js desktop/tests/document-context.test.js desktop/tests/document-package.test.js
```

Expected: PASS

**Step 3: Run frontend tests**

```bash
node --experimental-strip-types --test frontend/src/lib/documents-support-actions.test.ts
```

Expected: PASS

### Task 9: Build verification

**Files:**
- No source changes unless build fails

**Step 1: Build frontend**

```bash
cd frontend && npm run build
```

Expected: success

**Step 2: Build desktop**

```bash
cd desktop && npm run build:win
```

Expected: success

### Task 10: Manual acceptance check

**Files:**
- No code changes

**Step 1: Verify no-contract state**

In `Документы`:
- section visible
- buttons disabled
- message shown

**Step 2: Verify contract state**

With an estimate that already has a contract:
- generate `Доп. к смете`
- generate `Отдельное`
- generate `Замена`

Expected:
- files created as `.docx`
- no `undefined`
- correct contract and agreement fields

**Step 3: Verify template path**

Confirm working templates are read from writable user directory, not `Program Files`.

### Task 11: Commit

```bash
git add docs/plans/2026-04-03-additional-agreements-design.md docs/plans/2026-04-03-additional-agreements-implementation.md
git commit -m "docs: plan additional agreement automation"
```

If implementation is completed in the same branch, extend the commit set with the touched source and tests.
