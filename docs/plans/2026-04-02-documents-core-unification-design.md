# SmetaAI Documents Core Unification Design

**Date:** 2026-04-02

**Scope:** `desktop` document generation, `desktop` catalog bootstrap, Electron preload/API adapters, and document-related hidden backend capabilities without changing the visible interface.

## Goal

Rebuild the internal document workflow so `SmetaAI` generates a consistent document chain from one canonical project/estimate context:

- Estimate
- Contract
- Additional agreements
- KS-2
- KS-3
- FOT
- M-29
- Material request
- Commercial offer
- Package outputs

The user-visible interface must remain unchanged. Existing screens, buttons, layout, and interaction flow are not allowed to change in this batch.

## Hard Constraints

1. Do not change the visible `Documents` tab layout.
2. Do not add or remove buttons in the current UI.
3. Do not change the user flow in estimate, documents, KS-2, KS-3, or activation screens.
4. All improvements must happen in the internal document kernel, desktop handlers, preload bridge, and API adapter layers.
5. Existing renderer contracts must remain backward-compatible.
6. New capabilities may be added under the hood, but existing calls must continue to work with the same signatures and return shapes.

## Current-State Findings

### 1. Document generation is fragmented

The current system already has working generators in `desktop/main.js`, `desktop/src/documents.js`, and `desktop/src/templates.js`, but each document type pulls data differently.

Examples:

- Estimate uses `getEstimateContext()`
- Contract builds its own data path
- KS-2 and KS-3 create records with minimal input and enrich them later
- Commercial offer already uses a richer builder
- Additional agreements exist as templates and desktop handlers, but are not fully surfaced through the same renderer/API contract

This creates drift between documents and makes auto-fill brittle.

### 2. Starter database exists, but bootstrap is not defensive enough

The client build includes:

- `desktop/db/catalog_rsk.json`
- `desktop/db/catalog.json`
- `desktop/db/catalog_simple.json`
- `docs/client/starter-db/full/*`
- `docs/client/starter-db/quick/*`

So the problem is not packaging. The real gap is that startup import only checks `work_catalog` row count and does not verify:

- `material_catalog` presence
- `work_materials` links
- broken partial imports
- recovery from damaged first-run state

This explains the "installer has no works/materials" symptom even when the files are shipped correctly.

### 3. The document bridge has structural debt

Observed issues:

- `desktop/preload.js` contains duplicated `fot` namespaces, so one definition overrides another
- document APIs are inconsistent between `preload.js`, `frontend/src/lib/electron.ts`, and `frontend/src/lib/api.ts`
- additional agreement generation exists in desktop code but is not cleanly exposed through the same public adapter layer

This makes the `Documents` tab fragile even when desktop generators exist.

### 4. Additional agreements are implemented, but effectively orphaned

The following template groups exist:

- `desktop/db/DopSoglTemplates/additional`
- `desktop/db/DopSoglTemplates/independent`
- `desktop/db/DopSoglTemplates/replacement`

They are registered in `desktop/src/templates.js`, and a desktop handler exists in `desktop/main.js`, but the frontend document flow does not treat them as first-class internal document types. They are implemented on disk, but not fully integrated into the active document kernel.

## Chosen Approach

Use a no-UI-change internal unification architecture:

1. Introduce one canonical `DocumentContext` builder as the source of truth.
2. Introduce one `generateDocument()`-style kernel layer behind existing handlers.
3. Keep all current renderer calls working by routing them through compatibility adapters.
4. Make startup catalog import self-healing so the client always receives works/materials if bundled files are present.
5. Integrate additional agreements into the same backend document family even if the current UI does not expose new controls yet.

This is preferred over rewriting the `Documents` screen because the core problem is data fragmentation, not presentation.

## Architecture

### Layer 1: Canonical DocumentContext

Create one normalized internal structure that every generated document consumes.

It must include:

- project/object data
- estimate header and totals
- estimate sections
- normalized estimate rows
- customer data
- contractor/company data
- settings-derived values
- VAT/coefficient metadata
- derived material summary
- derived labor summary
- source document references

The renderer must not know this structure exists. It stays inside the desktop and adapter layers.

### Contract: Canonical DocumentContext

The internal kernel should normalize source data to one shared contract close to:

```ts
type DocumentContext = {
  project: Project | null
  estimate: Estimate
  contract: Contract | null
  execution?: {
    completedWorks: WorkItem[]
    periods: Array<{ from: string; to: string; label?: string }>
  }
  labor?: {
    norms: LaborNorm[]
    costs: LaborCost[]
    summary: {
      totalHours: number
      totalAmount: number
    }
  }
  materials?: {
    items: MaterialItem[]
    suppliers?: Supplier[]
    summary: {
      totalAmount: number
      totalItems: number
    }
  }
  meta: {
    version: number
    createdAt: string
    updatedAt: string
    templateVersion?: string
  }
}
```

This exact type does not need to leak into the renderer, but the kernel must behave as if this normalized shape exists internally.

### Contract: Document Type System

The internal generator must use a unified type family:

```ts
type DocumentType =
  | 'contract'
  | 'additional_agreement'
  | 'ks2'
  | 'ks3'
  | 'fot'
  | 'm29'
  | 'commercial_offer'
  | 'materials_request'
  | 'estimate'
  | 'package'
```

Additional agreements must be parameterized, not treated as unrelated one-off flows:

```ts
type AdditionalAgreementType =
  | 'additional'
  | 'independent'
  | 'replacement'
```

### Layer 2: DocumentKernel

Add an internal generator dispatcher:

- `estimate`
- `contract`
- `agreement.additional`
- `agreement.independent`
- `agreement.replacement`
- `ks2`
- `ks3`
- `fot`
- `m29`
- `materialRequest`
- `commercialOffer`
- `package`

Each legacy IPC handler becomes a compatibility wrapper:

- old handler name stays the same
- old input shape stays the same
- old output shape stays the same
- new internal kernel does the real work

### Contract: Unified Generator Entry

The kernel should converge on one entry similar to:

```ts
generateDocument({
  type: DocumentType,
  context: DocumentContext,
  options?: {
    agreementType?: AdditionalAgreementType
    agreementData?: AgreementData
  }
}): Promise<{ path: string }>
```

Legacy handlers may keep their current names, but they should all resolve into this unified internal path.

### Contract: Additional Agreement Data

`agreementData` must not remain unbounded `any`. The minimal normalized schema should be:

```ts
type AgreementData = {
  number?: string
  date?: string
  subject?: string
  amount?: number
  reason?: string
  appendices?: string
  startDate?: string
  endDate?: string
  paymentTerms?: string
  changePayment?: boolean
  changeTerms?: boolean
}
```

Templates may consume different subsets of this structure, but the kernel must validate and normalize one common shape first.

### Layer 3: Compatibility Adapters

Keep UI untouched by using adapters in:

- `desktop/preload.js`
- `frontend/src/lib/electron.ts`
- `frontend/src/lib/api.ts`

Rules:

- no breaking signature changes
- no payload shape changes that leak into UI
- new fields only as additive internal support
- existing document buttons still call the same public methods

The renderer-facing contract must remain backward-compatible:

- old method names stay available
- old return shapes stay available
- new generator capabilities are hidden behind the adapter layer until the current UI is ready to expose them

### Layer 4: Defensive Starter-DB Bootstrap

Startup import must become verification-based, not count-based.

On startup:

1. Ensure catalog tables exist.
2. Check whether works, materials, and links are populated above a safe threshold.
3. If any catalog slice is missing or suspiciously empty, re-import from bundled `db` resources.
4. If bundled `db` is unavailable or incomplete, fall back to `starter-db/full`, then `starter-db/quick`.
5. Log which path was used.

This makes the client installer recoverable and prevents silent "empty catalog" launches.

## Document Rules

### Source of truth

- Estimate is the financial source of truth.
- Contract inherits estimate/customer/company context.
- KS-2 inherits estimate rows and execution-period data.
- KS-3 derives only from KS-2/approved cost data, not from a separate ad hoc estimate-only path.
- FOT derives only from labor rows.
- M-29 and material request derive only from material composition.
- Commercial offer derives from the same estimate context, not a second pricing logic.

### Consistency rules

The same totals and base data must be reused across documents:

- object name
- object address
- customer name
- contractor details
- VAT amount
- subtotal
- total with VAT
- section ordering
- item naming

If a document needs special formatting, it may transform layout, but not invent its own source totals.

### Additional agreements

Additional agreements will be integrated into the kernel as hidden document types in this batch.

They will:

- reuse contract + estimate + company context
- choose template by agreement family and customer type
- stay available through backend/API even if the current UI does not expose a new button yet

This prevents them from remaining dead assets.

## Error Handling

The new document kernel must be stricter internally but not worse for the user.

Requirements:

- log exact generation failure stage
- preserve current UI-friendly error surfaces
- fail with clear "missing data" messages when customer/company/estimate context is incomplete
- keep `shell.openPath` and open-folder fallbacks

## Testing Strategy

### Backend/desktop regression tests

Add focused tests for:

- `DocumentContext` normalization
- starter-db fallback and self-heal behavior
- preload/API compatibility for document calls
- additional agreement route availability
- document dispatcher routing

### Build verification

Always verify:

- `node --test desktop/tests/...`
- `npm run build` in `frontend`
- optionally `npm run build:win` when packaging behavior changes

## Success Criteria

This batch is complete when all of the following are true:

1. The UI looks exactly the same as before.
2. The `Documents` tab keeps the same visible controls and flow.
3. The client build reliably exposes works and materials after install.
4. Existing document actions route through one unified internal context.
5. Contracts, KS-2, KS-3, FOT, M-29, material request, commercial offer, and hidden additional agreements all use the same document kernel family.
6. Existing renderer calls remain backward-compatible.
