# SmetaAI Persistent Document Chain Design

**Date:** 2026-07-22  
**Status:** Approved  
**Priority order:** persistent chain, print-form parity, defect-sheet automation

## Goal

Create one auditable construction-document workflow:

`defect sheet -> approved estimate -> contract -> KS-2 -> KS-3 -> M-29`

Every document in the chain must inherit the same project, parties, financial rules, and approved source data. Generated DOCX, XLSX, and PDF files must be reproducible from stored snapshots.

## Architectural Decision

The backend owns persistent business state and document relationships. Electron remains the Windows shell, offline runtime, file generator, and compatibility layer for the existing interface.

The existing desktop `DocumentContext` and document kernel remain useful rendering infrastructure. They consume backend snapshots instead of becoming a second source of business truth.

This approach is preferred because it supports:

- immutable issued documents;
- tenant isolation;
- client portal and employee collaboration;
- future Telegram, WhatsApp, and cloud integrations;
- consistent totals across all forms;
- offline Windows packaging without a separate desktop data model.

## Domain Chain

```text
Company
└── Project / Object
    └── Defect sheet
        └── Estimate revision
            ├── Contract
            ├── KS-2 acts by execution period
            │   └── KS-3 certificates from selected KS-2 acts
            └── M-29 reports for material usage periods
```

## Ownership Rules

### Estimate

The approved estimate revision is the source of planned quantities and cost.

- Draft estimates may be edited.
- Approval creates an immutable snapshot and revision number.
- Editing approved source data creates a new revision.
- Previously issued documents continue referencing their original revision.

### Contract

The contract inherits project, customer, contractor, estimate revision, tax settings, and approved amount. Contract-specific payment and schedule terms remain owned by the contract.

### KS-2

KS-2 records actual executed quantities for a period.

- Rows originate from the approved estimate snapshot.
- Executed quantity cannot exceed the remaining contractual quantity unless an approved revision or additional agreement permits it.
- Amounts use snapshot prices and calculation rules.
- The same executed quantity cannot be accepted twice.

### KS-3

KS-3 is derived from one or more approved KS-2 acts.

- It cannot be created from an arbitrary estimate total.
- Included KS-2 acts must belong to the same company, project, contract, currency, and compatible period.
- KS-3 totals are calculated, not manually duplicated.

### M-29

M-29 contains material-only rows.

- Normative usage is derived from the estimate/material snapshot.
- Actual usage is entered or imported for a reporting period.
- Deviations and their reasons are stored explicitly.
- Labor and mechanism rows are excluded.

## Snapshot Contract

Every issued document stores a versioned JSON snapshot containing:

- company and contractor details;
- client/customer details;
- project name and address;
- source entity IDs and revision IDs;
- document number, date, and reporting period;
- ordered sections and rows;
- quantities, unit prices, totals, coefficients, and VAT;
- template version;
- generation timestamp and author;
- calculation schema version.

Snapshots are immutable after approval/signing. File regeneration uses the stored snapshot, not current mutable tables.

## Status Model

All workflow documents use one lifecycle vocabulary:

`draft -> review -> approved -> signed -> void`

Rules:

- only drafts are freely editable;
- approval validates required fields and freezes the snapshot;
- signed documents cannot be edited;
- corrections create a replacement revision or void operation;
- every transition records actor, timestamp, previous status, and reason.

## Services

### DocumentChainService

Coordinates creation and validation of contract, KS-2, KS-3, and M-29 records from approved sources.

### SnapshotService

Builds, validates, versions, and retrieves immutable snapshots.

### DocumentNumberService

Generates company-scoped, document-type-specific numbers without collisions.

### CalculationService

Owns quantity, amount, VAT, and rounding rules shared across the chain.

### RenderAdapter

Transforms stored snapshots into the existing desktop `DocumentContext` and invokes current DOCX/XLSX/PDF generators.

## API Direction

The first implementation preserves existing list/create endpoints and adds workflow operations behind versioned routes:

- approve an estimate revision;
- create a contract from an approved estimate;
- create KS-2 from remaining estimate quantities;
- approve KS-2;
- create KS-3 from approved KS-2 acts;
- create M-29 from material rows;
- fetch chain state for a project/estimate;
- regenerate a file from an immutable snapshot.

Existing Electron and frontend calls remain compatible through adapters. Breaking API changes are out of scope for the first batch.

## Tenant and Security Rules

- Every query is scoped by the authenticated user's `company_id`.
- Foreign IDs return `404`, not authorization details.
- Source and downstream documents must belong to the same company.
- Snapshot data never accepts company identity from client payloads.
- Approval and signing require explicit roles.
- Audit events are append-only.

## Error Handling

Workflow errors use stable business codes with Russian user-facing messages, including:

- source estimate is not approved;
- selected rows exceed remaining quantity;
- KS-2 acts are incompatible or already included;
- M-29 contains non-material rows;
- required party or bank details are missing;
- document is frozen by its status;
- snapshot or template version is unavailable.

Database creation and status transitions are atomic. Failed generation does not silently mark a document as issued.

## User Experience

The current navigation remains recognizable. The estimate detail becomes the main chain workspace and shows:

- source revision and approval state;
- linked contract;
- execution progress by KS-2;
- generated KS-3 certificates;
- M-29 reports;
- warnings about missing data or remaining quantities.

Existing standalone lists remain available for accounting and reporting.

## Testing

### Domain tests

- immutable estimate revision snapshots;
- status transition rules;
- remaining-quantity calculation;
- prevention of duplicate KS-2 acceptance;
- KS-3 aggregation from compatible KS-2 acts;
- material-only M-29 generation;
- tenant isolation at every chain step;
- idempotent workflow commands.

### Success scenario

1. Create a project and estimate with work and material rows.
2. Approve estimate revision 1.
3. Create its contract.
4. Create and approve two partial KS-2 acts.
5. Create KS-3 from those acts and verify exact totals.
6. Create M-29 and verify only material rows are present.
7. Regenerate each file from its stored snapshot.
8. Edit the source through revision 2 and prove revision-1 documents remain unchanged.

### Regression verification

- full backend suite;
- full desktop Node suite;
- frontend production build;
- packaged Electron smoke when runtime or resource paths change.

## Delivery Order

1. Persistent source revision and snapshot foundation.
2. Contract creation from approved estimate.
3. KS-2 remaining-quantity workflow.
4. KS-3 aggregation from approved KS-2 acts.
5. M-29 material-only workflow.
6. Chain workspace adapters in the existing UI.
7. Official print-form parity and golden-master verification.
8. Defect-sheet automation from Excel, OCR, and photos.

## Non-Goals for the First Batch

- electronic signature provider integration;
- external EDI submission;
- WhatsApp or Telegram delivery;
- new frontend design system;
- replacement of the existing desktop document kernel;
- simultaneous implementation of every print form.

## Success Criteria

The first release is complete when a manager can create one approved estimate chain through contract, KS-2, KS-3, and M-29; all totals and relationships are database-backed, tenant-safe, reproducible from snapshots, and covered by an automated success scenario.
