# Document Workflow Parity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild the internal `SmetaAI` document engine so the desktop app produces a near-parity document chain from approved reference templates while keeping the visible interface unchanged and preserving the existing license system.

**Architecture:** The implementation keeps the current frontend screens and Electron entry points, but replaces the fragmented document generation path with a canonical snapshot-based pipeline. Spreadsheet-first template renderers become the parity source, downstream PDFs derive from parity outputs, and a separate trial build mode limits usage to one estimate without changing the license engine itself.

**Tech Stack:** Electron, React, TypeScript, React Query, sql.js, ExcelJS, DOCX templates, Electron Builder, existing desktop IPC layer.

---

### Task 1: Capture the golden master manifest from approved reference files

**Files:**
- Create: `desktop/scripts/extract-document-golden-master.js`
- Create: `desktop/scripts/verify-document-golden-master.js`
- Create: `docs/reference/document-golden-master.md`
- Verify: `C:\Users\User\OneDrive\Desktop\сметы нов\*.xlsx`
- Verify: `C:\Users\User\OneDrive\Desktop\сметы нов\*.pdf`
- Verify: `C:\Users\User\OneDrive\Desktop\сметы нов\*.docx`

**Step 1: Write the failing test**

Create a verification script that reads the approved reference files and asserts the project already has a complete manifest for:

- workbook sheet names
- row/column dimensions
- merged ranges
- formula counts
- extracted PDF text anchors
- DOCX paragraph anchors

**Step 2: Run test to verify it fails**

Run:

```powershell
node desktop/scripts/verify-document-golden-master.js
```

Expected: FAIL because the parity manifest does not exist yet.

**Step 3: Write minimal implementation**

Create:

- `desktop/scripts/extract-document-golden-master.js`
- `docs/reference/document-golden-master.md`

The extractor should emit a stable manifest for the approved references and store the document signatures needed for future parity checks.

**Step 4: Run test to verify it passes**

Run:

```powershell
node desktop/scripts/extract-document-golden-master.js
node desktop/scripts/verify-document-golden-master.js
```

Expected: PASS.

**Step 5: Run project checks**

Docs/scripts only for this step; no frontend or desktop build required yet.

### Task 2: Introduce a canonical document snapshot contract

**Files:**
- Create: `desktop/src/document-context.js`
- Create: `desktop/src/document-snapshots.js`
- Modify: `desktop/main.js`
- Modify: `desktop/src/database.js`
- Modify: `frontend/src/lib/electron.ts`
- Modify: `frontend/src/lib/api.ts`

**Step 1: Write the failing test**

Create a focused script that asks the desktop layer for a document context for one estimate and asserts it returns:

- estimate header
- project/customer data
- company data
- sections
- normalized rows
- coefficients
- template-ready totals

**Step 2: Run test to verify it fails**

Run:

```powershell
node desktop/scripts/verify-estimate-core.js
```

Expected: FAIL or incomplete shape because there is no dedicated snapshot contract yet.

**Step 3: Write minimal implementation**

Create `desktop/src/document-context.js` to centralize `getEstimateContext()` style logic and `desktop/src/document-snapshots.js` to build durable document snapshots.

Update:

- `desktop/main.js` to use the shared snapshot builder
- `desktop/src/database.js` to persist snapshot-friendly data
- `frontend/src/lib/electron.ts` and `frontend/src/lib/api.ts` to expose the normalized contract

**Step 4: Run test to verify it passes**

Run:

```powershell
node desktop/scripts/verify-estimate-core.js
```

Expected: PASS with a stable snapshot shape.

**Step 5: Run project checks**

Run:

```powershell
npm run build
```

Working directory: `frontend`

Expected: PASS.

### Task 3: Normalize defect sheet and estimate parity around template-driven workbook output

**Files:**
- Create: `desktop/src/document-mappers/defektovka.js`
- Create: `desktop/src/document-mappers/estimate.js`
- Modify: `desktop/main.js`
- Modify: `desktop/src/documents.js`
- Modify: `desktop/src/database.js`
- Modify: `frontend/src/components/DefektovkaInlineEditor.tsx`
- Modify: `frontend/src/pages/EstimateDetail.tsx`
- Modify: `frontend/src/pages/ImportData.tsx`

**Step 1: Write the failing test**

Create a verification script that compares generated defect sheet and estimate workbook metadata against the golden master manifest.

**Step 2: Run test to verify it fails**

Run:

```powershell
node desktop/scripts/verify-document-golden-master.js defektovka
node desktop/scripts/verify-document-golden-master.js estimate
```

Expected: FAIL because the current outputs do not match the approved workbook structure.

**Step 3: Write minimal implementation**

Add dedicated mappers for:

- defect sheet rows, coefficients, totals, and section formatting
- estimate rows, totals, VAT block, signatures, and print layout

Replace ad hoc generation paths in `desktop/src/documents.js` with the new mappers while keeping the same frontend buttons.

**Step 4: Run test to verify it passes**

Run:

```powershell
node desktop/scripts/verify-document-golden-master.js defektovka
node desktop/scripts/verify-document-golden-master.js estimate
```

Expected: PASS or only approved, documented deltas.

**Step 5: Run project checks**

Run:

```powershell
npm run build
```

Working directory: `frontend`

Expected: PASS.

### Task 4: Rebuild KS-2 generation against the approved workbook and PDF layout

**Files:**
- Create: `desktop/src/document-mappers/ks2.js`
- Modify: `desktop/main.js`
- Modify: `desktop/src/documents.js`
- Modify: `frontend/src/components/CreateKS2Modal.tsx`
- Modify: `frontend/src/pages/EstimateDetail.tsx`
- Modify: `frontend/src/pages/KS2List.tsx`
- Modify: `frontend/src/hooks/useSettings.ts`

**Step 1: Write the failing test**

Add a verification script that checks:

- KS-2 workbook structure
- required header fields
- section/row ordering
- total block
- PDF text anchors against `Кс-2 пдф.pdf`

**Step 2: Run test to verify it fails**

Run:

```powershell
node desktop/scripts/verify-document-golden-master.js ks2
```

Expected: FAIL with mismatched layout/content.

**Step 3: Write minimal implementation**

Implement a dedicated KS-2 mapper and generator path in `desktop/src/documents.js`.

Update UI callers only to pass the richer data needed for the parity form; do not change visible screen structure.

**Step 4: Run test to verify it passes**

Run:

```powershell
node desktop/scripts/verify-document-golden-master.js ks2
```

Expected: PASS or only approved deltas.

**Step 5: Run project checks**

Run:

```powershell
npm run build
```

Working directory: `frontend`

Expected: PASS.

### Task 5: Unify KS-3 creation flow and rebuild the parity renderer

**Files:**
- Create: `desktop/src/document-mappers/ks3.js`
- Modify: `desktop/main.js`
- Modify: `desktop/src/documents.js`
- Modify: `frontend/src/pages/EstimateDetail.tsx`
- Modify: `frontend/src/pages/KS3List.tsx`
- Modify: `frontend/src/pages/Documents.tsx`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/lib/electron.ts`

**Step 1: Write the failing test**

Create a verification that asserts:

1. `KS-3` is created from `KS-2` or an approved snapshot rule only.
2. Generated workbook structure matches the golden master.

**Step 2: Run test to verify it fails**

Run:

```powershell
node desktop/scripts/verify-document-golden-master.js ks3
```

Expected: FAIL and reveal the current inconsistent creation path.

**Step 3: Write minimal implementation**

Remove the split behavior where one part of the app creates `KS-3` directly from an estimate while another requires `KS-2`.

Standardize on one creation path and update the parity renderer in `desktop/src/documents.js`.

**Step 4: Run test to verify it passes**

Run:

```powershell
node desktop/scripts/verify-document-golden-master.js ks3
```

Expected: PASS.

**Step 5: Run project checks**

Run:

```powershell
npm run build
```

Working directory: `frontend`

Expected: PASS.

### Task 6: Restrict M-29 to material-only rows and align FOT to labor-only rows

**Files:**
- Create: `desktop/src/document-mappers/m29.js`
- Create: `desktop/src/document-mappers/fot.js`
- Modify: `desktop/main.js`
- Modify: `desktop/src/documents.js`
- Modify: `desktop/src/database.js`
- Modify: `frontend/src/pages/EstimateDetail.tsx`
- Modify: `frontend/src/pages/M29List.tsx`
- Modify: `frontend/src/pages/FOT.tsx`

**Step 1: Write the failing test**

Create checks that assert:

- `M-29` contains only materialized material rows
- `FOT` contains only labor-derived rows and totals
- workbook layout matches approved templates

**Step 2: Run test to verify it fails**

Run:

```powershell
node desktop/scripts/verify-document-golden-master.js m29
node desktop/scripts/verify-document-golden-master.js fot
```

Expected: FAIL because the current sourcing rules are too broad.

**Step 3: Write minimal implementation**

Introduce explicit material/labor selectors in the snapshot builder and use them in dedicated mappers for `M-29` and `FOT`.

**Step 4: Run test to verify it passes**

Run:

```powershell
node desktop/scripts/verify-document-golden-master.js m29
node desktop/scripts/verify-document-golden-master.js fot
```

Expected: PASS.

**Step 5: Run project checks**

Run:

```powershell
npm run build
```

Working directory: `frontend`

Expected: PASS.

### Task 7: Align invoice, invoice-factura, material request, and commercial offer to approved templates

**Files:**
- Create: `desktop/src/document-mappers/invoice.js`
- Create: `desktop/src/document-mappers/invoice-factura.js`
- Create: `desktop/src/document-mappers/material-request.js`
- Create: `desktop/src/document-mappers/commercial-offer.js`
- Modify: `desktop/main.js`
- Modify: `desktop/src/documents.js`
- Modify: `desktop/src/templates.js`
- Modify: `frontend/src/pages/EstimateDetail.tsx`
- Modify: `frontend/src/pages/MaterialRequests.tsx`
- Modify: `frontend/src/pages/CommercialProposal.tsx`

**Step 1: Write the failing test**

Create a parity script that verifies required fields and template anchors for:

- invoice
- invoice-factura
- material request
- commercial offer

**Step 2: Run test to verify it fails**

Run:

```powershell
node desktop/scripts/verify-document-golden-master.js invoice
node desktop/scripts/verify-document-golden-master.js invoice-factura
node desktop/scripts/verify-document-golden-master.js material-request
node desktop/scripts/verify-document-golden-master.js commercial-offer
```

Expected: FAIL because these generators are not yet mapped to the approved reference forms.

**Step 3: Write minimal implementation**

Bind the existing desktop templates in:

- `desktop/db/DocTemplates`
- `desktop/templates/smeta2007`

to the new document snapshot contract and replace simplified export paths.

**Step 4: Run test to verify it passes**

Run:

```powershell
node desktop/scripts/verify-document-golden-master.js invoice
node desktop/scripts/verify-document-golden-master.js invoice-factura
node desktop/scripts/verify-document-golden-master.js material-request
node desktop/scripts/verify-document-golden-master.js commercial-offer
```

Expected: PASS or only approved deltas.

**Step 5: Run project checks**

Run:

```powershell
npm run build
```

Working directory: `frontend`

Expected: PASS.

### Task 8: Add a client-trial build mode without changing the license engine

**Files:**
- Create: `desktop/src/build-flags.js`
- Create: `desktop/scripts/verify-trial-limit.js`
- Modify: `desktop/main.js`
- Modify: `desktop/preload.js`
- Modify: `desktop/src/database.js`
- Modify: `desktop/package.json`
- Modify: `frontend/src/lib/license.ts`
- Modify: `frontend/src/pages/Activation.tsx`
- Modify: `frontend/src/pages/CreateEstimate.tsx`
- Modify: `frontend/src/pages/Estimates.tsx`
- Modify: `frontend/src/pages/ImportData.tsx`

**Step 1: Write the failing test**

Create a desktop verification script that asserts a trial build:

- allows one estimate
- allows a full document chain for that estimate
- blocks the second estimate
- routes to activation

**Step 2: Run test to verify it fails**

Run:

```powershell
node desktop/scripts/verify-trial-limit.js
```

Expected: FAIL because no build-mode estimate cap exists yet.

**Step 3: Write minimal implementation**

Add build flags that define:

- internal mode
- client-trial mode

Enforce the estimate cap in:

- frontend creation/import guards
- IPC handlers
- database/service layer

Do not change the existing license activation algorithm.

**Step 4: Run test to verify it passes**

Run:

```powershell
node desktop/scripts/verify-trial-limit.js
```

Expected: PASS.

**Step 5: Run project checks**

Run:

```powershell
npm run build
```

Working directory: `frontend`

Expected: PASS.

### Task 9: Add package generation verification and build both EXE variants

**Files:**
- Create: `desktop/scripts/verify-document-package.js`
- Modify: `desktop/package.json`
- Modify: `desktop/scripts/build-clean.ps1`
- Modify: `desktop/scripts/build-win-alt.ps1`
- Verify: `desktop/main.js`
- Verify: `desktop/src/documents.js`

**Step 1: Write the failing test**

Create a package verification script that generates a complete document package for one estimate and checks the expected outputs exist.

**Step 2: Run test to verify it fails**

Run:

```powershell
node desktop/scripts/verify-document-package.js
```

Expected: FAIL until all document generators are wired into the new engine.

**Step 3: Write minimal implementation**

Update build scripts and package generation so the project can produce:

- `internal` build
- `client-trial` build

and generate the full approved document set for a single estimate.

**Step 4: Run test to verify it passes**

Run:

```powershell
node desktop/scripts/verify-document-package.js
npm run build:win
```

Working directory: `desktop`

Expected: PASS, then successful Windows build.

**Step 5: Record residual risks**

Document any remaining approved visual deltas and list manual comparison items that still require sign-off.

### Task 10: Perform manual parity sign-off against the approved references

**Files:**
- Create: `docs/reference/document-parity-signoff.md`
- Verify: outputs generated by `desktop`
- Verify: approved files in `C:\Users\User\OneDrive\Desktop\сметы нов`

**Step 1: Manual compare the final outputs**

For each generated document, compare against the approved reference set for:

- content
- signatures
- totals
- row order
- print layout
- page structure

**Step 2: Run the final verification set**

Run:

```powershell
node desktop/scripts/verify-document-golden-master.js
node desktop/scripts/verify-document-package.js
npm run build
```

Working directory: `frontend`

Expected: PASS.

Then run:

```powershell
npm run build:win
```

Working directory: `desktop`

Expected: PASS.

**Step 3: Save the sign-off record**

Write the final manual parity observations and accepted deltas to:

`docs/reference/document-parity-signoff.md`

**Step 4: Repository note**

`C:\Projects\SmetaAI` is not currently a git repository, so commit steps must be skipped unless the project is later initialized under git.
