# SmetaAI Product and UI Foundation

## Product promise

SmetaAI is a dependable construction workspace for companies with 5–50
employees. It must remain understandable during a busy workday, work without a
permanent internet connection, and preserve the history behind every important
number and document.

The interface is organized around a continuous business flow:

`Lead → Client → Project → Survey → Defect → Estimate → Contract → Execution → Document → Payment → Warranty`

## Visual direction: Industrial Ledger

The product should feel like a precise professional instrument: calm,
structured, dense where construction data requires density, and spacious around
decisions. The visual language combines an engineer's field notebook, a clean
technical drawing, and a modern financial terminal.

Avoid generic AI styling:

- no purple gradient as the default brand treatment;
- no decorative glass panels that reduce table readability;
- no oversized cards for simple values;
- no animation that delays work;
- no status communicated by color alone.

## Design tokens

Use semantic tokens instead of hard-coded Tailwind colors in feature pages.

### Light theme

- Canvas / warm paper: `#F4F2ED`
- Surface: `#FFFFFF`
- Raised surface: `#FAF9F6`
- Ink: `#172128`
- Muted steel: `#586873`
- Border: `#D7DAD8`
- Blueprint / primary: `#135F86`
- Blueprint hover: `#0E4C6C`
- Safety orange / accent: `#E46F2C`
- Success: `#2D7A52`
- Warning: `#B7791F`
- Danger: `#B8493F`

### Dark theme

- Canvas: `#10171C`
- Surface: `#172128`
- Raised surface: `#1D2A32`
- Ink: `#F3F1EA`
- Muted steel: `#AAB6BC`
- Border: `#34434C`
- Primary: `#55A7CF`
- Accent: `#F28B4B`

All text/background combinations must meet WCAG AA contrast. Status chips also
use an icon and label, not color alone.

## Typography and numbers

- Product UI: `IBM Plex Sans` when a locally licensed font asset is approved;
  until then use the existing Windows-safe fallback stack.
- Codes, estimate numbers, quantities, money and audit values: `IBM Plex Mono`
  or a metric-compatible monospace fallback.
- Use tabular numerals in tables and financial summaries.
- Reserve large display type for page identity; operational content stays
  compact and scannable.

Adding or bundling fonts is a separate dependency/license decision and is not
part of the CRM foundation work.

## Workspace structure

The global shell exposes only stable areas:

- Overview
- CRM
- Projects
- Catalogs
- Documents
- Finance
- Analytics
- Settings

Inside a project, use one persistent workspace with contextual tabs:

- Summary
- Survey and defects
- Estimates
- Contract
- Execution
- Materials
- Photos and chat
- Documents
- Finance
- Warranty

Users should not have to search separate global pages to understand one
project. Global pages aggregate data; the project workspace explains context.

## Interaction rules

- Show one clear primary action per screen.
- Place destructive actions behind explicit confirmation and clear object name.
- Autosave operational drafts, but require explicit approval/signing for legal
  or financial state transitions.
- Show pending, saved, offline, synchronization-error and conflict states.
- Keep keyboard navigation and visible focus states across tables and dialogs.
- Minimum pointer target is 44×44 px; compact table rows may use smaller visual
  content while retaining accessible hit areas.
- Motion uses 120–180 ms transitions and respects `prefers-reduced-motion`.
- Empty states explain the next useful action rather than only showing an icon.

## Data presentation rules

- Tables are first-class components, not cards disguised as tables.
- Freeze identifiers and totals where horizontal scrolling is unavoidable.
- Align quantities and money to the decimal edge.
- Preserve user filters, column widths and density preferences.
- Provide clear provenance: source, version, author, update time and document
  state where decisions depend on the data.
- Signed documents render from immutable snapshots. Draft previews must be
  visually distinguishable from signed originals.

## Architecture boundary

The UI never owns business rules. It may guide users by showing allowed next
actions, but FastAPI services enforce permissions, funnel transitions,
document immutability and tenant isolation.

Start with the existing Electron + React + FastAPI + SQLite contour. Keep
storage, messaging and desktop launch details behind interfaces so PostgreSQL,
S3, Redis or another desktop shell can be introduced later only when an
approved requirement justifies them.

## Incremental modernization order

1. Introduce semantic tokens and shared primitives without changing behavior.
2. Normalize application shell, navigation, typography and focus behavior.
3. Modernize CRM and project workspace as the reference implementation.
4. Apply the system to estimates and document workflows.
5. Apply it to finance, warehouse, analytics and client portal.
6. Remove legacy one-off component styles only after visual regression checks.

No full UI rewrite is allowed. Each modernized screen must keep its business
behavior, pass the frontend build, and be reviewable independently.
