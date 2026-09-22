# Offline mode

MyLab supports working through internet outages on registered "offline
stations". While offline, staff can complete the four steps of the patient
transaction journey — **register a patient → open a case → record the
payment → enter lab results** — and everything auto-syncs to the server the
next time the browser is online.

This document is for engineers wiring new features into the stack. For
operator-facing instructions, see the *Offline mode* section in the
[User Manual](../USER_MANUAL.md).

---

## Scope

- **Supported offline (creates only):**
  patient, patient case, payment, lab result entry (typed values).
- **Online-only:**
  editing existing rows, void / cancel, admin (users, test items,
  discounts, etc.), reports, login, requisition creation, lab report
  creation from a requisition, finalize / print signed report.
- **Duration:** designed for days-long outages (branch with intermittent
  internet). Rolling window: last 60 days of history is cached.
- **Multi-station:** two stations at the same branch can both be offline;
  client-generated UUIDs keep records distinct. Duplicate-patient dedupe is
  a future admin tool, not enforced client-side.

## High-level flow

```
Online session
   ├── /offline/enable            → server row + 30-day offline JWT
   ├── /offline/bootstrap         → seed IndexedDB with 60-day cache
   └── (normal use)               → API + Dexie mirror on every read

Offline session
   ├── read: Dexie only           → dashboards, forms, search
   └── write: outbox + optimistic Dexie insert (patients / cases /
                                     payments / lab_report_results)

Connection returns
   ├── heartbeat / online event   → syncEngine.drainOnce()
   ├── /offline/refresh           → clock-skew check, extend JWT
   ├── /offline/pull?since=...    → apply server-side delta
   └── /offline/sync              → drain outbox in insertion order
                                     with per-entry idempotency
```

## Backend

### Migrations (`laboratory-api/migrations/2026090200*`)

| File | What it does |
|---|---|
| `..._offline_mode_columns.ts` | Adds `client_uuid` + `created_offline_at` to patients, patient_cases, payments, lab_reports. Unique partial index on `(tenant_uuid, client_uuid)`. Adds `tenants.offline_mode_enabled`. |
| `..._offline_devices.ts` | New `offline_devices` table — one row per station that has enabled offline mode. |
| `..._sync_infrastructure.ts` | `idempotency_keys` (30-day TTL) and `sync_outbox_log` (audit trail with clock-skew delta). |

### Module (`src/app/offline-sync/`)

- `offline-sync.controller.ts` — routes: `enable`, `refresh`, `bootstrap`,
  `pull`, `sync`, `devices`, `devices/:uuid/revoke`.
- `offline-sync.service.ts` — orchestration, tenant opt-in enforcement,
  bootstrap payload assembly, clock-skew arithmetic, offline JWT issuance
  (delegates signing to `JwtService`).
- `sync-dispatcher.service.ts` — per-entry dispatch to the domain services
  (`PatientService.create`, `PatientCaseService.create`,
  `PaymentService.createPayment`, `LabReportService.updateResults`). Every
  dispatcher method is idempotent by `(tenant_uuid, client_uuid)` — a
  duplicate becomes a `duplicate` result instead of a duplicate row.
- `idempotency.service.ts` — first line of retry-safety (30-day cached
  snapshots keyed by `Idempotency-Key`).

### JWT + guard

- `JwtPayload` gained `offline?: boolean` and `device_id?: string`.
- `@AllowOfflineToken()` marks endpoints that accept the offline token.
- `OfflineTokenGuard` runs after `AuthGuard('jwt')` — rejects offline
  tokens on non-allow-listed endpoints, and blocks tokens whose device has
  been revoked or whose tenant has since disabled offline mode.

## Frontend

### `src/offline/`

| File | Responsibility |
|---|---|
| `db.js` | Per-`(tenant, user)` Dexie DB. Reference + journey + outbox + sync_state tables. |
| `outbox.js` | Enqueue / drain / retry / orphan revive / done purge. |
| `bootstrap.js` | Full seed + incremental pull. Emits `{ stage, table, count }` progress events. |
| `syncEngine.js` | Mutex-guarded pipeline: `refresh → pull → drain outbox`. |
| `uuid.js` | Uses `crypto.randomUUID` with a v4 fallback. |
| `storeSupport.js` | Shared building blocks (`queueCreate`, `mirrorRows`, `assertOnline`, `paginate`) used by every domain store. |

### `src/stores/offline.js`

Pinia store owning:

- `device_id` + `offline_token` (both persisted in `localStorage`).
- Reactive `isOnline`, `mode`, `syncing`, counts, `errors[]`.
- Actions: `initialize`, `enableOnThisStation`, `disableOnThisStation`,
  `autoBootstrapIfDue`, `drainNow`, `retry`, `refreshCounts`.
- Manages the browser `online`/`offline` event listeners and — on
  reconnect — triggers `syncEngine.drainOnce()`.

### UI

- `components/OfflineStatusBadge.vue` — top-bar pill + sync panel.
- `components/OfflineModeSettings.vue` — per-station enable + admin
  device registry, injected at the bottom of `TenantSettingsView`.
- `LoginView` calls `offline.autoBootstrapIfDue()` after a successful
  online login — first-of-day bootstrap runs in the background.

### Domain stores

`patients`, `patientCases`, `payments`, `laboratory` route through the
offline stack via `shouldRouteThroughOfflineStack()`. The read path
serves from Dexie when offline; the create path enqueues in the outbox
with an optimistic Dexie insert. Edits / deletes / status changes call
`assertOnline()` and throw a friendly `OFFLINE_UNSUPPORTED` error when
attempted offline.

Lab result entry is a special case: `fetchOne` cached the full
report detail (items + values) into `lab_report_details` when it was
last opened online, so the results editor can render offline. If a
report was never opened online, the editor surfaces a clear
"open once with internet" message instead of a blank form.

## Known limitations (v1)

- **Requisition creation** stays online-only. A branch preparing for an
  outage must generate its requisitions before losing connection.
- **Duplicate patients** across offline stations at the same branch land as
  separate server rows. A "merge patients" admin tool is a follow-up.
- **Payment over-payment** surfaces as `conflict` on sync; the sync panel
  shows the row with a Retry button. Resolution is manual.
- **Cached passwords for offline login** are not stored — the initial
  online login of the day must succeed before the station can drop
  offline. A cached JWT keeps the user signed in through the outage.
- **Lab report finalize / print** stays online-only.

## Debugging tips

- The sync panel in the top-bar badge shows recent errors + per-entry
  retry buttons. Prefer it over log-diving for operator issues.
- Server-side, `sync_outbox_log` records every attempt with device_id,
  status, error message, and clock-skew delta. `SELECT * FROM
  sync_outbox_log ORDER BY synced_at DESC LIMIT 50` on the branch's DB
  is the fastest "what happened" query.
- Clock-skew warnings > 5 minutes surface in the badge panel — a wrong
  device clock will bend receipt ordering and end-of-day reports,
  so treat them as fixable rather than cosmetic.
- To reset a station without server involvement, run in the browser
  console: `indexedDB.deleteDatabase('mylab_offline::<tenant>::<user>')`
  then reload. The `disableOnThisStation` action does the same via UI.
