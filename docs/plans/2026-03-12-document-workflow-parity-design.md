# SmetaAI Document Workflow Parity Design

**Date:** 2026-03-12

**Scope:** `SmetaAI` desktop and frontend document workflow, without changing the visible interface.

## Goal

Rebuild the internal estimate-to-document workflow so `SmetaAI` can generate a full construction document chain that closely matches the approved reference set:

- Defect sheet
- Estimate
- KS-2
- KS-3
- M-29
- FOT
- Material request
- Invoice
- Invoice-factura
- Commercial offer
- Related appendices and package outputs

The UI must remain visually unchanged. The existing license system must remain intact. A separate client trial build must allow one full estimate/document chain and redirect the user to activation when they attempt to exceed the trial scope.

## Approved Constraints

1. Do not change the visible `SmetaAI` interface.
2. Do not modify or reverse-engineer the installed third-party application.
3. Build the new workflow from approved reference outputs and project-owned templates.
4. Do not rewrite the current license system.
5. Deliver a separate client EXE with one-estimate trial limits, while preserving the existing activation flow.
6. Do not expose the source product name anywhere in the shipped `SmetaAI` application.

## Reference Inputs

The design is based on the approved reference set from:

- `C:\Users\User\OneDrive\Desktop\сметы нов`
- Installed desktop template assets already present in:
  - `desktop\db\DocTemplates\`
  - `desktop\templates\smeta2007\`

Observed reference artifacts include:

- Excel workbooks for defect sheets, estimate, KS-2, KS-3, M-29, FOT, invoice, invoice-factura, material request
- PDF outputs for estimate and KS-2
- DOCX commercial offer template
- Screenshot evidence for document headers and source workflow commands

## Current-State Findings

### Frontend

`frontend` already exposes the required document entry points:

- `EstimateDetail.tsx`
- `Documents.tsx`
- `KS2List.tsx`
- `KS3List.tsx`
- `M29List.tsx`
- `FOT.tsx`
- `MaterialRequests.tsx`
- `CommercialProposal.tsx`

The user-facing navigation is already sufficient and must be preserved.

### Desktop

The active desktop stack is:

- `desktop/main.js`
- `desktop/preload.js`
- `desktop/src/database.js`
- `desktop/src/documents.js`
- `desktop/src/templates.js`
- Existing document templates in `desktop/db/DocTemplates`

The current desktop layer already contains generators for estimate, KS-2, KS-3, M-29, defect sheet, invoice, and material request, but the generation path is not yet aligned to the approved reference set.

### Main Gaps

1. Document generation is currently split between simplified frontend assumptions and desktop-side generators.
2. The application does not use a single canonical document snapshot contract.
3. `KS-3` creation logic is inconsistent:
   - one path creates it directly from an estimate
   - another path expects it to be created from KS-2
4. M-29 data sourcing is too permissive and can include non-material rows.
5. Current PDF/HTML generators are structurally simpler than the approved forms.
6. Trial packaging is not defined as a separate product mode.

## Chosen Approach

Use a hybrid clean-room parity architecture:

1. Keep the current UI and route structure.
2. Introduce a canonical document domain model and snapshot builder.
3. Generate spreadsheet-first outputs that preserve approved workbook geometry and formulas.
4. Derive PDF outputs from parity-aware render paths instead of simplified HTML-only layouts.
5. Preserve the current license engine, but add a separate client-trial build mode that limits scale of use rather than disabling document features.

This is preferred over a pure workbook-only architecture because it preserves maintainability while still allowing near-template parity.

## Architecture

### 1. Canonical Data Layers

The document system should be split into four layers:

1. `estimate/domain data`
2. `document snapshot`
3. `template mapper`
4. `format renderer`

The UI continues to talk to the same screens, but the document buttons route through the new internal pipeline.

### 2. Source of Truth

The primary source of truth is the estimate workflow, not the visible UI state.

Core entities:

- `Project/Object`
- `Customer`
- `CompanyProfile`
- `Contract`
- `Estimate`
- `EstimateSection`
- `EstimateItem`
- `MaterialBreakdown`
- `LaborBreakdown`
- `DocumentSnapshot`

Derived document entities:

- `DefectSheet`
- `KS2Act`
- `KS3Certificate`
- `M29Report`
- `FOTStatement`
- `MaterialRequest`
- `Invoice`
- `InvoiceFactura`
- `CommercialOffer`

### 3. Snapshot Rule

Every generated document must store a document snapshot.

That snapshot must contain:

- Header data
- Counterparty data
- Estimate totals
- Section ordering
- Item rows used by the form
- Tax/coefficient values
- Template version
- Generation timestamp

This prevents downstream documents from drifting when the source estimate changes later.

### 4. Field Inheritance

Field ownership is fixed as follows:

- Contractor legal/bank details: `settings.company`
- Contract terms: `settings.contract + contract entity`
- Coefficients/VAT/default estimate settings: `settings.estimates + estimate entity`
- Customer/object fields: `project + contract + estimate`
- Work/material composition: `estimate/defect snapshot`

### 5. Document Chain

The document flow becomes:

`defect sheet -> estimate -> KS-2 -> KS-3`

Parallel outputs from estimate:

- `M-29`
- `FOT`
- `material request`
- `invoice`
- `invoice-factura`
- `commercial offer`

Rules:

- `Estimate` is the cost source of truth.
- `KS-2` is generated from an estimate snapshot plus period execution data.
- `KS-3` is generated from one or more KS-2 records or from an approved period snapshot, but never from an ad hoc direct estimate path in one screen and a different rule elsewhere.
- `M-29` is material-only.
- `FOT` is labor-only.

## Template Strategy

### Spreadsheet-First

Because the approved references are primarily workbook-based, parity should be built around workbook templates.

Use:

- `desktop/db/DocTemplates/*.xlsx`
- `desktop/db/DocTemplates/*.xltx`
- `desktop/templates/.../*.dotx`

Required parity dimensions:

- Sheet names
- Merged cells
- Column widths
- Row heights
- Print areas
- Page breaks
- Header blocks
- Signature blocks
- Formula cells
- Named ranges where needed
- Document numbering placement
- VAT and total blocks

### PDF Outputs

PDF outputs must be generated from parity-aware layouts.

Preferred order:

1. Generate parity workbook/document
2. Convert/export to PDF through desktop path
3. Keep fallback HTML PDF generation only for non-reference outputs

### DOCX Outputs

Commercial offer and contract-like artifacts should remain template-driven and use the approved Word templates already present in the desktop project.

## Trial Build Design

Two build flavors are required:

### Internal Build

- Full product
- No estimate-count restriction
- Uses current activation system as-is

### Client Trial Build

- Separate EXE
- Same interface
- Same templates and document outputs
- Full functionality for one estimate and its full document chain
- Block:
  - second estimate creation
  - clone-as-new-estimate flow
  - second estimate import
  - restore/import path that creates a second estimate

When the user exceeds the trial scope:

- show the reason
- redirect to the existing activation path
- do not alter the license system itself

Enforcement must exist in:

- frontend UI checks
- desktop IPC handlers
- database/service layer checks

## Testing Strategy

### Golden Master Verification

Create a parity manifest for the approved reference set and compare generated outputs against it.

Verification dimensions:

- Workbook sheet structure
- Header field placement
- Totals and formulas
- Section and row ordering
- Cell merge maps
- Print layout metadata
- PDF page count and extracted text anchors
- Snapshot consistency between generated documents

### Functional Scenarios

Minimum end-to-end scenario:

1. Create/import one estimate
2. Generate defect sheet
3. Generate estimate
4. Generate KS-2
5. Generate KS-3
6. Generate M-29
7. Generate FOT
8. Generate invoice
9. Generate invoice-factura
10. Generate material request
11. Generate commercial offer
12. Generate full package

### Trial Verification

1. Fresh install
2. Create first estimate
3. Generate full document chain
4. Attempt second estimate
5. Confirm redirect to activation
6. Activate through existing mechanism
7. Confirm second estimate becomes available

## Delivery Phases

1. Golden-master extraction and parity manifest
2. Domain snapshot contract
3. Defect sheet and estimate parity
4. KS-2 parity
5. KS-3 parity and flow unification
6. M-29 and FOT parity
7. Invoice, invoice-factura, material request, commercial offer parity
8. Trial build gating
9. Packaging and smoke verification

## Non-Goals

- No visible navigation redesign
- No rewrite of the existing activation system
- No migration to a new desktop framework
- No dependency on the installed third-party application at runtime

## Risks

1. There are multiple historical template variants in the approved references.
2. Existing desktop code includes both active and extracted/archive variants; implementation must only target the active runtime files.
3. Workbook parity may expose hidden assumptions in named formulas and legacy row semantics.
4. Trial gating must be added without destabilizing the current license behavior.

## Constraints

- `C:\Projects\SmetaAI` is not currently a git repository, so this design document cannot be committed automatically.
- Verification must rely on desktop build/test scripts and document comparisons rather than git-based review tooling.
