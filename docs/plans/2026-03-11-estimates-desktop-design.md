# Estimates Desktop Repair Design

**Date:** 2026-03-11

**Scope:** Desktop `ZARU Смета`, section `Сметы`, without changing the visible interface.

## Goal

Restore reliable editing of estimate items and make downstream Excel documents consume the same normalized estimate data.

## Confirmed Symptoms

1. Editing an estimate item in the modal reports success, but the screen continues to show stale zero values.
2. Excel outputs are inconsistent because estimate data flows through multiple field shapes (`material_price`, `labor_price`, `price_smeta`, `sum_smeta`) and document generators do not consume a single normalized contract.

## Root Cause Findings

### Save/refresh path

The estimate detail page loads items with React Query key `['estimate-items', id]`, where `id` comes from route params as a string.
The edit modal invalidates `['estimate-items', estimateId]`, where `estimateId` is numeric.
These are different keys, so the list does not refresh after a successful save and the user sees stale values.

### Estimate/document coupling

Document generation in the desktop layer mixes raw item fields and derived fields in several places.
This creates drift between the estimate editor, recalculation logic, and exported Excel documents.

## Chosen Approach

Use a non-UI repair of the desktop estimate core:

1. Introduce a shared estimate query-key helper so all estimate-related refreshes use the same cache keys.
2. Add a minimal verification for estimate item save refresh behavior.
3. Keep the existing UI components visually unchanged.
4. Normalize the data mapping used by main Excel generators so they consume a consistent estimate item shape.

## Non-Goals

- No layout or styling changes.
- No route changes.
- No broad rewrite of the desktop architecture.

## Verification Strategy

1. Reproduce the stale-save issue in a focused verification script.
2. Run the frontend build/lint after the save-path fix.
3. Run focused desktop document generation checks against the live desktop database.
4. Confirm that edited values flow into estimate totals and generated Excel outputs.

## Constraints

- Project is not currently in a git repository, so plan docs cannot be committed automatically.
- Desktop runtime is gated by license checks, so low-level verification must rely on direct code/data checks where needed.
