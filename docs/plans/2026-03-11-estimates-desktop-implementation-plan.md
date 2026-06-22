# Estimates Desktop Repair Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make estimate item edits persist and refresh correctly in the desktop app, then normalize estimate-to-Excel document data flow without changing the interface.

**Architecture:** The repair stays inside the desktop estimate core and frontend data-refresh path. First fix cache invalidation and save verification for estimate items, then normalize the document generation input contract so Excel outputs consume consistent estimate data.

**Tech Stack:** Electron, React, React Query, TypeScript, CommonJS desktop modules, sql.js/SQLite, ExcelJS.

---

### Task 1: Shared estimate query keys

**Files:**
- Create: `frontend/src/lib/estimateQueryKeys.ts`
- Modify: `frontend/src/pages/EstimateDetail.tsx`
- Modify: `frontend/src/components/EditItemModal.tsx`
- Test: `frontend/scripts/verify-estimate-query-keys.mjs`

**Step 1: Write the failing test**

Create a small verification script that imports the shared helper and asserts the same estimate id produces the same query keys regardless of string/number input.

**Step 2: Run test to verify it fails**

Run: `node frontend/scripts/verify-estimate-query-keys.mjs`
Expected: FAIL before helper is used consistently.

**Step 3: Write minimal implementation**

Add shared query-key helpers and replace inline `['estimate-items', ...]` and `['estimate', ...]` usages in estimate detail and edit modal.

**Step 4: Run test to verify it passes**

Run: `node frontend/scripts/verify-estimate-query-keys.mjs`
Expected: PASS.

**Step 5: Run project checks**

Run: `npm run build` in `frontend`
Expected: PASS.

### Task 2: Estimate item save verification

**Files:**
- Modify: `frontend/src/components/EditItemModal.tsx`
- Modify: `frontend/src/lib/estimateItems.ts`
- Test: `frontend/scripts/verify-estimate-item-save-shape.mjs`

**Step 1: Write the failing test**

Add a verification script for the estimate item save payload shape so numeric price fields are preserved as explicit values and do not rely on falsy coercion.

**Step 2: Run test to verify it fails**

Run: `node frontend/scripts/verify-estimate-item-save-shape.mjs`
Expected: FAIL if save payload or optimistic result shape is inconsistent.

**Step 3: Write minimal implementation**

Normalize save payload/result handling in `estimateItems.ts` so numeric zero and non-zero values round-trip predictably.

**Step 4: Run test to verify it passes**

Run: `node frontend/scripts/verify-estimate-item-save-shape.mjs`
Expected: PASS.

**Step 5: Run project checks**

Run: `npm run build` in `frontend`
Expected: PASS.

### Task 3: Normalize estimate item data for desktop document generation

**Files:**
- Modify: `desktop/src/database.js`
- Modify: `desktop/documents.js`
- Test: `desktop/scripts/verify-estimate-document-shape.js`

**Step 1: Write the failing test**

Create a focused desktop verification script that loads estimate items from the desktop database module and asserts document-facing totals are derived from the normalized field contract.

**Step 2: Run test to verify it fails**

Run: `node desktop/scripts/verify-estimate-document-shape.js`
Expected: FAIL where raw and derived fields diverge.

**Step 3: Write minimal implementation**

Add a single normalization path for estimate items used by the main Excel generators and replace ad-hoc field fallback logic in the core document outputs.

**Step 4: Run test to verify it passes**

Run: `node desktop/scripts/verify-estimate-document-shape.js`
Expected: PASS.

**Step 5: Run project checks**

Run: `npm run build` in `frontend`
Expected: PASS.

### Task 4: Manual desktop verification

**Files:**
- Modify: none if previous tasks are sufficient
- Verify: live desktop DB and generated files under `%APPDATA%\zaru-smeta`

**Step 1: Verify edited estimate item values persist**

Check a live estimate item after save-path repair and confirm refreshed UI data is sourced from the updated query.

**Step 2: Verify main outgoing documents**

Generate at least the estimate Excel and one downstream document using the normalized data shape.

**Step 3: Record residual risks**

Document any remaining document-specific edge cases not covered by the current repair.
