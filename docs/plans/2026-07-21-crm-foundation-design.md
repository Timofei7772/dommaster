# CRM Foundation Design

**Date:** 2026-07-21  
**Status:** Approved  
**Product:** SmetaAI / DomMaster OS Windows desktop application

## Goal

Deliver the first reliable CRM foundation for the offline-first Windows product. The successful Sprint 1 flow is:

`Manager -> Lead -> Client -> Ready to create a project`

Employees and customers remain separate business entities. `User` represents an employee who signs in and acts inside a construction company. `Client` represents a customer and does not receive employee permissions.

## Existing System

The backend already contains JWT authentication, `User`, `Client`, `Deal`, `Project`, lead parsers, `/api/leads`, and a direct dictionary-to-client conversion. However:

- parsed leads are transient and are not stored in the database;
- conversion accepts arbitrary lead data instead of a persistent lead identity;
- clients are not scoped by `company_id`;
- client endpoints do not consistently enforce tenant ownership;
- the current conversion is not idempotent and can create duplicate clients;
- creating a parallel `app/modules/crm/` package would duplicate the existing CRM implementation.

## Chosen Approach

Evolve the existing FastAPI and SQLAlchemy layout instead of creating a second CRM subsystem. Add a persistent lead model, company-scoped repositories, and a transaction-oriented CRM service while preserving existing API prefixes.

The existing `UserRole.CLIENT` enum value remains temporarily for backward compatibility, but new customers are created only as `Client` records. Removing that enum value is outside Sprint 1 because it could break stored data or callers.

## Domain Model

### User

`User` is an authenticated employee. Relevant roles for Sprint 1 are owner, admin, and manager. Every CRM write is scoped to the user's `company_id`.

### Client

`Client` is a customer. Sprint 1 adds a required tenant relationship through `company_id`. Existing customer details remain unchanged. Client queries and mutations must include the active company scope.

### Lead

A persistent `Lead` stores:

- identity and `company_id`;
- responsible manager (`assigned_to`);
- name, phone, email, description, address, and expected budget;
- source and optional external URL;
- funnel status;
- optional `client_id` after conversion;
- conversion and audit timestamps.

The funnel statuses are `new`, `contacted`, `qualified`, `proposal`, `contract`, and `lost`. Normal progress moves forward through the active funnel. `lost` is terminal for Sprint 1. Conversion is allowed for an active lead and moves it to `contract` when needed.

The parser DTO currently named `Lead` remains an import/search representation rather than a database entity. The persistent SQLAlchemy model is the canonical CRM lead. A later cleanup may rename the parser DTO, but that is not required for Sprint 1.

## Components

### Repositories

`LeadRepository` and `ClientRepository` encapsulate database access. Every lookup accepts `company_id`; unscoped reads and writes are forbidden. Repositories flush changes but do not independently commit the conversion transaction.

`ClientRepository` also looks for an existing customer using normalized phone or email inside the same company. Matching never crosses company boundaries.

### CrmService

`CrmService` owns business rules:

- validate allowed status transitions;
- create and update leads;
- convert a lead atomically;
- reuse a matching client in the same company when safe;
- make repeated conversion idempotent by returning the linked client;
- record the link, conversion time, and audit entry in one transaction.

If any step fails, the request transaction rolls back and leaves both lead and client unchanged.

### API

The existing `/api/leads` prefix remains stable:

- `POST /api/leads` creates a lead;
- `GET /api/leads` lists company leads with optional status filtering;
- `PATCH /api/leads/{lead_id}/status` advances or closes a lead;
- `POST /api/leads/{lead_id}/convert` converts a persistent lead;
- the legacy `POST /api/leads/convert` remains temporarily and delegates through the new service.

Successful conversion returns the lead, the client, whether an existing client was reused, and `ready_for_project: true`. Project creation is the next sprint and will accept this `client_id`.

## Authorization and Isolation

All CRM endpoints require the existing JWT dependency. Owner, admin, and manager may create and convert leads. Other employee roles receive `403` for CRM writes. A user without `company_id` cannot access CRM records.

Requests for records belonging to another company return `404` to avoid exposing their existence. Client list, detail, update, and delete operations gain the same company scoping.

## Migration

An Alembic migration creates `leads` and adds `clients.company_id` with an index and foreign key. Existing client rows need a deterministic backfill strategy. For SQLite desktop databases, the migration must preserve data and support clean installations. The migration is tested both against an empty schema and a representative pre-Sprint-1 database.

No new third-party dependencies are required.

## Error Handling

- `400`: invalid status transition or missing company context;
- `403`: authenticated role cannot perform the write;
- `404`: lead or client is absent from the active company;
- `409`: ambiguous duplicate identity that cannot be safely resolved;
- validation errors use FastAPI's standard `422` response.

Error responses are in Russian where they are user-facing and contain stable machine-readable details where the current API conventions permit.

## Testing

Tests cover:

- model defaults and relationships;
- allowed and rejected funnel transitions;
- company isolation for leads and clients;
- creation of a new client from a lead;
- reuse of a matching client in the same company;
- no matching across companies;
- idempotent repeated conversion;
- transaction rollback on audit or persistence failure;
- role restrictions;
- compatibility of the legacy conversion endpoint;
- migration from both empty and existing databases.

After CRM tests pass, run the complete backend suite. The later release gate also includes frontend build, desktop tests, packaged backend health, clean-profile smoke tests, and NSIS installer verification.

## Out of Scope

- full Projects workflow and construction stages;
- removal of `UserRole.CLIENT`;
- cloud synchronization;
- mandatory Telegram authentication;
- replacing the existing route prefixes with `/api/v1`;
- broad restructuring of all backend modules.

## Expected Files

- `backend/app/models/lead.py`
- `backend/app/models/client.py`
- `backend/app/models/__init__.py`
- `backend/app/repositories/__init__.py`
- `backend/app/repositories/lead_repository.py`
- `backend/app/repositories/client_repository.py`
- `backend/app/services/crm_service.py`
- `backend/app/routers/leads.py`
- `backend/app/routers/clients.py`
- an Alembic revision under `backend/alembic/versions/` or the repository's canonical migration directory
- focused backend tests

