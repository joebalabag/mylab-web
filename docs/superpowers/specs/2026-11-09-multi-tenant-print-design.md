# Multi-Tenant Laboratory Print-Outs — Design

**Date:** 2026-11-09
**Author:** Edgardo (via brainstorm)
**Status:** Design approved; awaiting written-spec review before Phase 1 UI
**Supersedes:** 2026-11-07 owner-portal brainstorm (never written to disk)

---

## 1. Context & Motivation

**Business need:** An owner operates multiple laboratory branches (tenants) under one roof. A patient takes a lab test at branch 1 and later asks for a hard copy at branch 2. Today this is impossible — each tenant is a sealed silo. The lab chain needs:

- One **owner** identity that provisions and manages multiple tenants
- A separate **owner app** for cross-tenant management (reports, catalog comparison, migrations, users)
- Inside each tenant's lab app, a **sibling-tenant search** so any branch can pull, view, print, and email any other branch's finalized lab result (same owner only)
- **Writes stay single-tenant.** A lab tech in tenant2 cannot create a patient in tenant1; they can only view/print/email tenant1's already-finalized results.

## 2. Architecture

### 2.1 Three apps in one Vue SPA

| App | Login route | Layout | JWT `type` | Who logs in |
|---|---|---|---|---|
| Super (existing) | `/super/login` | `SuperAdminLayout` | `admin` | Platform operators |
| Owner (new) | `/owner/login` | `OwnerLayout` (new) | `owner` (new) | A person who owns 1+ tenants |
| Lab (existing) | `/login` | `MainLayout` | `user` | Lab staff, pinned to one tenant |

### 2.2 New backend tables

```sql
owners
  uuid PK
  email UNIQUE
  name
  business_name
  phone
  passphrase          -- bcrypt
  keycode             -- same crypto as users
  status              -- active | inactive
  created_by          -- admin uuid who provisioned (or 'public-registration')
  created_at, updated_at

owner_tenants
  owner_uuid FK -> owners.uuid
  tenant_uuid FK -> tenants.uuid UNIQUE  -- one tenant has at most one owner
  created_at
  PK (owner_uuid, tenant_uuid)

owner_password_resets
  -- mirrors user_password_resets structure
```

### 2.3 JWT payload extension

```ts
JwtPayload.type = 'admin' | 'user' | 'owner'
owner tokens: { uuid, email, name, type: 'owner' }
              // no tenant_uuid — owner is cross-tenant by definition
```

### 2.4 Authorization matrix

| Capability | admin | owner | user |
|---|---|---|---|
| Create tenant | Yes (any owner) | Yes (auto-assigned to self) | No |
| View all tenants | Yes | Only own tenants | Only home tenant |
| Edit tenant settings | Yes | Only own tenants | Only home tenant (via existing user-access) |
| Lab-app cross-tenant search | N/A | N/A | Yes — across tenants owned by same owner as home tenant |
| Write patient / case / requisition / lab-report | — | — | **Home tenant only (unchanged)** |

### 2.5 What is not changed

- `/auth/user/login`, `/auth/admin/login`, existing JWT structure for admin/user
- Patient / case / requisition / lab-report CREATE / UPDATE / DELETE paths — all remain strictly home-tenant via existing `resolveTenantScope()` + `assertOwns()` guards
- Existing `admins` table and super-admin flow — gains an "Owners" section in the sidebar; no schema change to `admins`
- Existing `users` table — unchanged

---

## 3. Phase 1 — Super Adds Owner Management

**Goal:** Super-admin can CRUD owners and assign tenants to them. No Owner app exists yet.

### 3.1 UI additions

- **New sidebar entry** "Owners" in `SuperAdminSidebar.vue`, below the existing "Tenants" item
- **New views:**
  - `SuperOwnersView.vue` at `/super/owners` — paginated list (name, business name, email, phone, #tenants, status, last login, actions)
  - `SuperOwnerDetailsView.vue` at `/super/owners/:uuid` — two panels:
    - **Profile:** name, business_name, email, phone, status + read-only created_at/last_login/created_by + "Reset Password" button
    - **Assigned Tenants:** table of owned tenants with Unassign button; "Assign Tenant" dropdown-search picks from currently-unassigned tenants
- **Modified views:**
  - `SuperTenantsView.vue` — adds "Owner" column (name or "— unassigned —") and optional "Owner" filter in the filter bar
  - Create Tenant modal — adds "Assign to Owner" optional dropdown (atomic insert of `owner_tenants` row on tenant create)

### 3.2 Backend endpoints (admin-guard only)

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/owner/dashboard` | Paginated list |
| GET | `/owner/view/:uuid` | Single owner |
| POST | `/owner/create` | Create owner |
| PATCH | `/owner/update/:uuid` | Update profile |
| PATCH | `/owner/set-status/:uuid` | Active / Inactive |
| POST | `/owner/reset-password/:uuid` | Trigger password reset email |
| POST | `/owner/:uuid/assign-tenant` | Body: `{ tenant_uuid }` |
| DELETE | `/owner/:uuid/assign-tenant/:tenant_uuid` | Unassign |
| GET | `/tenant/dashboard` (modified) | Adds `owner_uuid` filter + joins `owner_tenants` for the Owner column |

### 3.3 DB migrations

```
20261109000100_create_owners.ts
20261109000200_create_owner_tenants.ts
20261109000300_create_owner_password_resets.ts
```

### 3.4 Out of scope for Phase 1

- `/owner/login` endpoint — Phase 2
- Owner-facing frontend — Phase 2
- Any change to lab-app writes or JWT
- Public-registration owner provisioning — Phase 4

---

## 4. Phase 2 — Owner App (New Management Dashboard)

**Goal:** Dedicated app for owners, separate login, routes under `/owner/*`. Owner manages own tenants without super-admin.

### 4.1 Shell

- `OwnerLayout.vue` + `OwnerSidebar.vue` (parallel to `SuperAdminLayout`)
- `OwnerLoginView.vue` at `/owner/login` — username/email + password
- Sidebar: Dashboard / Tenants → Tenant Reports / Migrations / Catalog → Price Comparison / Users

### 4.2 Views

| Route | View | Purpose |
|---|---|---|
| `/owner` | `OwnerDashboardView.vue` | Summary cards (tenant count, active users, today's test count, revenue MTD) |
| `/owner/tenants` | `OwnerTenantsView.vue` | Owner's tenants; each row links to editable details (reuses `UpdateTenantDTO`) |
| `/owner/tenants/:uuid/reports` | `OwnerTenantReportsView.vue` | Per-tenant business reports; mirrors `SuperTenantReportsView` but scoped |
| `/owner/migrations` | `OwnerMigrationsView.vue` | Tenant picker → migration actions. **Copy-catalog source dropdown filtered to owner's tenants only.** |
| `/owner/catalog` | `OwnerCatalogView.vue` | Per-tenant catalog browser; read-only in v1 |
| `/owner/catalog/compare` | `OwnerPriceComparisonView.vue` | Pivot table: rows = `item_code`, columns = tenants, cells = price; highlights discrepancies; CSV export |
| `/owner/users` | `OwnerUsersView.vue` | Users across all owner's tenants; Tenant column visible; filter by tenant/role/status; CRUD against any owned tenant |

### 4.3 Backend endpoints

**Auth (new):**
- `POST /auth/owner/login`
- `POST /auth/owner/change-password`
- `POST /auth/owner/request-password-reset`
- `POST /auth/owner/reset-password`

**Owner-scoped (new, all guarded by ownership check):**
- `GET /owner/me/tenants`
- `GET /owner/me/summary`
- `GET /owner/tenants/:uuid/reports`
- `POST /owner/tenants/:uuid/migration/*` — delegates to existing migration logic
- `GET /owner/catalog/compare` — returns `{ items: [{ item_code, name, prices: { tenant_uuid: price } }] }`
- `GET /owner/users` + `POST /owner/users` + `PATCH /owner/users/:uuid` + `DELETE /owner/users/:uuid`

**Existing (modify guard to accept owner tokens with ownership check):**
- `/tenant/view/:uuid`, `/tenant/update/:uuid`
- `/reports/*` with owner-scoped `tenant_uuid`
- `/test-item/*`, `/item-category/*`, `/item-group/*`, `/discount/*` — READ only for owner; writes stay user/admin

**Ownership guard pseudocode:**
```ts
function assertOwnsTenant(owner_uuid: string, tenant_uuid: string) {
  const row = await db('owner_tenants')
    .where({ owner_uuid, tenant_uuid })
    .first();
  if (!row) throw new ForbiddenException('Tenant not owned by caller.');
}
```

### 4.4 Out of scope for Phase 2

- Public owner registration — Phase 4
- Lab-app cross-tenant search — Phase 3
- Any change to lab-app writes

---

## 5. Phase 3 — Lab App Cross-Tenant Result Search

**Goal:** A lab user in tenant2 can search, view, print, and email a FINAL lab report created in tenant1, provided both tenants share an owner.

### 5.1 UI

- **New button** on `LaboratoryView.vue`: "Sibling-Tenant Search" (next to existing filter bar)
- **Opens a side drawer** (not a new route — keeps user anchored in home dashboard)
- **Drawer contents:**
  - Filter block: date range (default last 30 days) · tenant dropdown (siblings only, excludes home) · keyword input (first_name, middle_name, last_name, OR lab_number) · Search / Clear buttons
  - Results table: lab_number · patient_name · test_name · date · status · tenant badge · row actions
  - Row actions: View (read-only) · Print (reuses `LabReportPrintable.vue`) · Email (reuses resend-email)
  - Empty state when caller's home tenant has no owner-sibling: "No sibling tenants available."
- **FINAL-only guard** — drafts, pending, and voided reports are invisible across tenants.

### 5.2 Backend endpoints

**New:**
- `GET /lab-report/sibling-tenants` → `[{uuid, display_name, store_code, branch}]`
- `GET /lab-report/cross-tenant-search` — query: `date_from, date_to, tenant_uuid, keywords, page, per_page`. Backend verifies `tenant_uuid` is in caller's sibling pool, scopes to `status='FINAL'`.

**Existing (loosen guards for sibling-tenant reads, FINAL-only):**
- `GET /lab-report/view/:uuid`
- `GET /lab-report/print/:uuid`
- `GET /lab-report/pdf/:uuid`
- `POST /lab-report/resend-email/:uuid`

**Authorization helper:**
```ts
canCrossTenantSearch(user, requested_tenant_uuid) {
  const owner = owner_tenants.findByTenant(user.tenant_uuid)?.owner_uuid;
  if (!owner) return false;
  const requestedOwner = owner_tenants.findByTenant(requested_tenant_uuid)?.owner_uuid;
  return owner === requestedOwner;
}
```

### 5.3 Migration — audit columns

```
20261109000400_lab_report_access_log_cross_tenant.ts
  - add accessed_from_tenant_uuid (nullable)
  - add cross_tenant boolean DEFAULT false
```

Every view/print/pdf/email of a sibling-tenant report writes an access-log entry with `cross_tenant=true` and `accessed_from_tenant_uuid=caller.tenant_uuid`.

### 5.4 Print branding

When tenant2 user prints tenant1's report, the printable uses **tenant1's** `company_logo`, `lab_header_image`, header/footer, signatories — because the test belongs to tenant1. Only the physical printer sits in tenant2.

### 5.5 Out of scope for Phase 3

- Patient dashboard cross-tenant filter (spec explicitly narrows to lab results)
- Editing sibling results
- Public owner registration — Phase 4

---

## 6. Phase 4 — Public Registration Provisions an Owner

**Goal:** When someone signs up a new tenant through the existing public registration flow, the backend ALSO creates an owner account with matching credentials. Zero UI change for the registrant — they fill one form, get two identities.

### 6.1 Flow change

Current:
1. Verify email token → create `tenants` row → create `users` row (admin) → send welcome email

New (all in one transaction):
1. Verify email token
2. Create `tenants` row
3. Create `users` row (admin) — copy email + passphrase hash
4. **Create `owners` row with the same email + passphrase hash + name**
5. **Create `owner_tenants` row linking the new owner → new tenant**
6. Send welcome email mentioning **both** login URLs

### 6.2 "Same but different" semantics

| | User identity (`users`) | Owner identity (`owners`) |
|---|---|---|
| Table | `users` | `owners` |
| Login route | `/login` | `/owner/login` |
| JWT type | `user` | `owner` |
| Password at signup | identical hash | identical hash |
| Password changes afterward | **independent** | **independent** |
| Profile edits | independent | independent |
| Deactivate one | other stays live | other stays live |

No FK between the two tables. No sync. No cross-table triggers. Coupling exists only at the registration moment.

### 6.3 Edge cases

- **Email collision with existing owner.** Reject the registration with "This email already has an owner account. Please log in and register additional tenants from your owner dashboard." Prevents silent takeover.
- **Super-admin-created tenants (Phase 1 flow) stay unchanged** — no auto-owner-creation there; super assigns to an existing owner.
- **Owner-initiated tenant creation** (future, post-v1) — not in Phase 4 scope.
- **Password reset propagation** — none.

### 6.4 Code touch-points

- `mylab-api/.../tenant-registration/tenant-registration.service.ts` — wrap in transaction, add two inserts, add collision check
- Welcome email template — add both URLs
- `mylab-web/.../RegisterVerifiedView.vue` — success screen shows both URLs

---

## 7. UI-First Implementation Sequence

**Principle:** Each phase ships its UI first with mocked data, review, then wires backend. Each row below is a shippable commit/PR unless noted.

### Phase 1 — Super

| # | What |
|---|---|
| 1.1 | `SuperOwnersView.vue` with mocked array |
| 1.2 | `SuperOwnerDetailsView.vue` with mocked data |
| 1.3 | Sidebar entry + routes |
| 1.4 | `SuperTenantsView.vue` — add Owner column + Owner filter (mocked) |
| 1.5 | Create Tenant modal — add "Assign to Owner" dropdown (mocked) |
| **→** | **Checkpoint: review Phase 1 UI end-to-end** |
| 1.6 | Migrations: `owners`, `owner_tenants`, `owner_password_resets` |
| 1.7 | Owner model + service + controller + DTOs |
| 1.8 | Modify Tenant endpoints for Owner column join + filter |
| 1.9 | Wire frontend to real endpoints; remove mocks |

### Phase 2 — Owner app

| # | What |
|---|---|
| 2.1 | `OwnerLayout` + `OwnerSidebar` |
| 2.2 | `OwnerLoginView.vue` (mocked) |
| 2.3 | Router — `/owner/*` cluster with owner-guard stub |
| 2.4 | `OwnerDashboardView.vue` (mocked) |
| 2.5 | `OwnerTenantsView.vue` + edit details (mocked) |
| 2.6 | `OwnerTenantReportsView.vue` (reuse existing report comps, mocked) |
| 2.7 | `OwnerMigrationsView.vue` with tenant picker (mocked) |
| 2.8 | `OwnerCatalogView.vue` + `OwnerPriceComparisonView.vue` (mocked) |
| 2.9 | `OwnerUsersView.vue` with Tenant column (mocked) |
| **→** | **Checkpoint: review Phase 2 UI end-to-end** |
| 2.10 | `/auth/owner/login` + `JwtOwnerGuard` + ownership middleware |
| 2.11 | `/owner/me/*` and owner-scoped endpoints |
| 2.12 | Modify existing tenant/report/catalog/user guards to accept owner token |
| 2.13 | Wire frontend to real endpoints; remove mocks |

### Phase 3 — Lab cross-tenant search

| # | What |
|---|---|
| 3.1 | "Sibling-Tenant Search" button + drawer skeleton in `LaboratoryView.vue` |
| 3.2 | Filter form (mocked sibling list) |
| 3.3 | Results table + row actions wired to existing view/print/email |
| 3.4 | Empty states (no siblings, no results, loading) |
| **→** | **Checkpoint: review Phase 3 UI** |
| 3.5 | Migration: `lab_report_access_log` cross-tenant columns |
| 3.6 | `/lab-report/sibling-tenants` endpoint |
| 3.7 | `/lab-report/cross-tenant-search` endpoint |
| 3.8 | Loosen view/print/pdf/email guards (FINAL-only sibling reads) |
| 3.9 | Add cross-tenant access-log writes |
| 3.10 | Wire frontend to real endpoints; remove mocks |

### Phase 4 — Public registration

| # | What |
|---|---|
| 4.1 | `RegisterVerifiedView.vue` shows both login URLs |
| 4.2 | Welcome email template updated |
| **→** | **Checkpoint: visual review of registration success + email template** |
| 4.3 | Modify `tenant-registration.service.ts`: transaction + owner insert + owner_tenants insert |
| 4.4 | Email-collision pre-check against `owners` |
| 4.5 | Integration test: register → both identities exist |

### Cross-phase principles

- One PR per repo per ship gate (frontend + backend ≈ 4 PRs each).
- Mocked data lives in a separate `*.mock.ts` file imported behind a `USE_MOCKS` flag — swap to real in a single diff.
- No schema changes until the UI mock is approved for that phase.
- Owner guard middleware ships with Phase 2's backend half; Phase 1 only needs admin auth.

---

## 8. Open Questions / Deferred Decisions

- **Owner-driven tenant creation (post-v1)** — in v1, owners cannot self-provision new tenants after signup; only super-admin or public registration (which pairs them 1:1) create tenants. A dedicated "+ New Tenant" button on the owner dashboard is deferred.
- **Catalog price comparison as a chart** — v1 ships as a table. Charts optional later.
- **Multi-currency across sibling tenants** — out of scope; assume all owner's tenants share a currency. If divergent, price comparison shows the raw number plus the tenant's currency code.
- **SES integration** — owner emails (welcome, password reset, cross-tenant audit alerts) route through existing `MailerService`; automatically benefits when SES lands (see `ses-integration-pending` memory).
