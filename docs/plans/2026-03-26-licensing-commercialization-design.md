# SmetaAI Licensing Commercialization Design

**Date:** 2026-03-26

**Scope:** Commercial licensing, activation, and packaging for the existing Electron desktop product without changing the current UI architecture.

## Goal

Implement a commercial-grade licensing system for SmetaAI that:

- preserves the existing Electron + React desktop UI;
- supports demo mode and paid licenses;
- binds activations to hardware fingerprints with offline cache;
- supports tariff-based multi-activation (`1 / 2 / 5` devices);
- moves license truth out of renderer code and into server + Electron main process.

## Constraints

- `C:\Projects\SmetaAI` is not currently a git worktree, so implementation and review checkpoints must be recorded manually instead of relying on normal commit flow.
- The current desktop app already exposes `license:*` IPC methods through Electron preload and uses `desktop/src/license-secure.js` from `desktop/main.js`.
- The current activation UI exists in [Activation.tsx](C:\Projects\SmetaAI\frontend\src\pages\Activation.tsx) and must be strengthened, not redesigned.
- All customer-facing text remains in Russian.
- Telegram is the only customer support channel in commercial documentation and licensing flows.

## Architecture

### Hierarchy of truth

| Level | Component | Responsibility |
|------|-----------|----------------|
| L1 | License API | Server-side truth for license key, tariff, expiry, and active devices |
| L2 | Electron main process | Local validation, offline cache checks, feature gating, demo enforcement |
| L3 | Renderer | UI only; status display and IPC requests |
| L4 | `license.dat` | Encrypted local cache of signed payload; never primary truth |

### Commercial licensing model

| Tariff | `max_pcs` | Price | Behavior |
|-------|-----------|-------|----------|
| `standard` | `1` | `2 500 ₽` | One active device |
| `double` | `2` | `5 000 ₽` | Two active devices |
| `enterprise` | `5` | `10 000 ₽` | Five active devices |

License semantics:

- one key allows up to `max_pcs` concurrent active devices;
- activations are tracked as device slots, not as a single HWID field;
- re-activating the same hardware is idempotent and returns success;
- if the slot limit is reached, the API either returns `ACTIVATION_LIMIT_REACHED` or replaces the oldest active device when `force_deactivate_previous = true`.

## Security design

### Cryptography

- The server or admin signing tool owns the private RSA key.
- The desktop app embeds only the public key.
- Signed payloads use canonical JSON serialization before `RSA-SHA256` signing.
- Local cache encryption uses `AES-256-GCM` with random IVs.
- The renderer never stores or verifies authoritative license state in `localStorage`.

### Hardware binding

The hardware fingerprint is multi-source and normalized:

- CPU ID;
- physical MAC addresses;
- disk serials;
- motherboard serial;
- BIOS serial.

Matching policy:

- exact fingerprint match is accepted immediately;
- tolerance allows `3 of 5` components to match to reduce false positives after minor hardware changes.

### Offline mode

- `license.dat` is stored under app data for the current user.
- Cached payloads are accepted offline for up to `7 days`.
- After cache expiry, the app still loads but requires online revalidation to stay in full mode.

### Anti-tamper posture

Included in first implementation:

- truth moved to main process and server;
- renderer fallback removed;
- signature verification on every cached payload load;
- local security logging;
- production DevTools disabled as defense-in-depth.

Deferred from first implementation:

- code signing certificates;
- hard anti-debug blocking;
- aggressive anti-VM enforcement;
- full updater and release telemetry stack.

## Desktop integration design

### Existing compatibility layer

The current [license-secure.js](C:\Projects\SmetaAI\desktop\src\license-secure.js) becomes a facade over new main-process modules so that [main.js](C:\Projects\SmetaAI\desktop\main.js) can continue to call the same high-level API during the migration.

### New main-process modules

- `desktop/src/main/license-manager.js`
- `desktop/src/main/hardware-fingerprint.js`
- `desktop/src/main/license-storage.js`
- `desktop/src/main/security-logger.js`

### IPC contract

Existing methods remain:

- `license:check`
- `license:activate`
- `license:hasFeature`
- `license:getHWID`
- `license:extend`

New methods are added:

- `license:getActiveDevices`
- `license:deactivateDevice`
- `license:getStatus`

## Server design

### Data model

`licenses`

- key metadata, tariff, expiry, status, customer identity, feature set.

`license_activations`

- one record per activation slot usage, with history of active and deactivated devices.

`license_audit_log`

- security and lifecycle events such as activation, deactivation, forced replacement, invalid signature, and slot abuse attempts.

### API surface

- `POST /api/license/activate`
- `POST /api/license/deactivate`
- `GET /api/license/devices/:licenseKey`
- `POST /api/license/validate`
- `GET /api/license/status/:licenseKey`

## Feature enforcement

First implementation enforcement points:

- demo limit: maximum 3 estimates;
- demo blocks PDF export;
- demo AI limit: maximum 5 requests;
- demo PDF outputs receive a watermark in main-process generation paths;
- feature gates are checked in main process and backend/service paths, not only in renderer.

## UI integration

- [Activation.tsx](C:\Projects\SmetaAI\frontend\src\pages\Activation.tsx) keeps its current page role and structure.
- The renderer stops using `localStorage` as a source of truth.
- Device slot management is added as a nested component inside the existing license page, not as a new route-driven screen.
- Pricing is updated to `2 500 / 5 000 / 10 000 ₽`.

## Admin tooling

The first implementation includes a CLI signer/generator:

- `scripts/admin/generate_license.js`

It creates:

- license key;
- tariff metadata;
- `max_pcs`;
- expiry;
- canonical payload;
- RSA signature.

## Non-goals for first implementation

- polished PDF customer documentation package;
- production Telegram support bot rollout;
- auto-update pipeline;
- code-signing certificate integration;
- complete hardening against reverse engineering.

## Success criteria

- Renderer no longer acts as the source of truth for license validity.
- A signed payload can be activated online and reused offline for 7 days.
- The same hardware can activate idempotently.
- Tariff slot limits are enforced on the server.
- The app can show active devices and free a slot.
- Demo mode limits are enforced outside renderer-only code paths.
