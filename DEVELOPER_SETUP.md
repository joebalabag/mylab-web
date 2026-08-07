# MyLab Web — Developer Setup

Companion to [`GETTING_STARTED.md`](./GETTING_STARTED.md) (the end-user
guide). This one is for whoever's cloning the repo and shipping code.

---

## Stack at a glance

| Layer | Choice |
|---|---|
| Framework | **Vue 3** (`<script setup>` SFC, vanilla JS — no TypeScript) |
| Build | **Vite 5** |
| State | **Pinia 2** |
| Router | **vue-router 4** (HTML5 history mode) |
| Styling | **Tailwind CSS 3** + a small set of shortcuts in `style.css` |
| Charts | **chart.js 4** + `vue-chartjs 5` |
| PDF | **jsPDF 4** — lab-report generation and print templates |
| QR codes | **qrcode 1.5** — QR on finalized lab reports |
| Excel | **xlsx 0.20** (SheetJS via CDN) — bulk import / export |
| PWA | **vite-plugin-pwa 1** (Workbox) — offline shell + install prompt |
| Testing | **Playwright** — mobile e2e (`test/*.spec.js`) |
| Icons | **sharp 0.35** — PWA icon regeneration script |
| Backend | Consumed via `fetch` — see [API client](#api-client) |

`socket.io-client` is a dep in `package.json` but is **not currently wired
into any view**. Ignore it unless you're adding realtime.

---

## Prerequisites

- **Node.js** 20+ (Vite 5 requires 18.x/20.x/22.x; `package.json` uses ESM).
- **npm** ≥ 9 — no yarn / pnpm lockfile is committed.
- A running MyLab **backend API** (default `http://127.0.0.1:3010/api`), or
  a staging URL you're allowed to hit.
- Git.

Optional but recommended:
- **VS Code** with the **Volar** extension for Vue 3 SFC support.
- Chrome / Firefox with the **Vue devtools** extension.

---

## First-time local setup

```bash
git clone https://github.com/joebalabag/mylab-web.git
cd mylab-web
npm ci                  # clean install from package-lock.json
cp .env.example .env.local   # optional — for per-developer overrides
npm run dev             # http://localhost:5173
```

The dev server auto-reloads on save. Hit `Ctrl+Shift+R` if HMR misbehaves
(Pinia store shape changes and Vue Router edits are the usual suspects).

Because `vite-plugin-pwa` has `devOptions.enabled: true`, the install
prompt fires in dev too — you can install `http://localhost:5173` as a PWA
to iterate on install-mode behavior.

---

## Environment variables

Vite loads env files in this order (later overrides earlier):

```
.env → .env.local → .env.[mode] → .env.[mode].local
```

Committed in the repo:

| File | Used when |
|------|-----------|
| `.env` | Always — base defaults |
| `.env.staging` | `npm run build:staging` |
| `.env.production` | `npm run build:production` (also `npm run build`) |
| `.env.example` | Copy-me template with all keys documented |

Not committed (see `.gitignore`):

| File | Used when |
|------|-----------|
| `.env.local` | Developer-local overrides |
| `.env.[mode].local` | Per-mode developer overrides |

### Supported keys

```
# Base URL of the MyLab API (include /api, no trailing slash).
VITE_API_BASE=http://127.0.0.1:3010/api

# Payment fallback labels shown on the Subscription page when a plan has
# no per-plan payee configured.
VITE_PAY_GCASH_NAME=MyLab Platform
VITE_PAY_GCASH_NUMBER=0917 000 0000
VITE_PAY_BANK_NAME=BDO — MyLab Platform Inc.
VITE_PAY_BANK_ACCOUNT=0000 0000 0000
VITE_PAY_GCASH_QR_URL=

# PayPal Smart Button — leave blank to hide the button
VITE_PAYPAL_CLIENT_ID=
VITE_PAYPAL_CURRENCY=PHP
```

Every `VITE_*` var is exposed on `import.meta.env` inside the SPA — that's
a Vite convention, they're **compiled into the client bundle**, so treat
them as public.

---

## npm scripts

```bash
npm run dev              # Vite dev server (HMR + PWA install prompt)
npm run build            # production build → dist/
npm run build:staging    # staging build (loads .env.staging)
npm run build:production # explicit production build
npm run preview          # serve dist/ locally
npm run preview:staging  # preview a staging build
npm run screenshots      # doc capture tool (scripts/capture-screenshots.mjs)
npm run pwa:icons        # regenerate PWA icons from src/assets/mylab-icon.png
npm run test:mobile      # Playwright mobile e2e
npm run test:mobile:report  # Playwright with HTML report
```

---

## Project layout

```
src/
├── api/                       # thin fetch wrappers per resource
│   ├── client.js              # shared fetch + envelope handling + assetUrl()
│   ├── auth.js                # /auth/user/login, /auth/admin/login, verify-manager
│   ├── patients.js            # /patient/* (+ /search for duplicate check)
│   ├── patientCases.js        # /patient-case/*
│   ├── patientRequisitions.js # /patient-requisition/* (+ items sync, discount)
│   ├── laboratory.js          # /lab-report/* (encode + finalize + void)
│   ├── testItems.js           # /test-item/* (+ components sync)
│   ├── itemGroups.js, itemCategories.js, itemPackages.js
│   ├── discounts.js, expenses.js
│   ├── payments.js            # /payment/* (+ unpaid-cases, unpaid-items, arrangements)
│   ├── users.js               # tenant staff CRUD (+ verify-credentials, reset-password)
│   ├── adminUsers.js          # super admin CRUD (/admin/*)
│   ├── tenants.js             # /tenant/* (multipart for logo + lab-header image)
│   ├── doctors.js             # /doctor/* (with e-signature upload)
│   ├── subscriptionPlans.js   # /subscription-plan/* + public trials/list
│   ├── tenantSubscriptionPayments.js
│   ├── aiExtraction.js        # /ai-extraction/receipt (multipart, returns file_url + extraction)
│   ├── accessTemplate.js
│   ├── userAccess.js
│   ├── setupReadiness.js      # /setup-readiness/status
│   ├── publicRegistration.js  # /public/tenant/register + verify + resend-verification
│   ├── reports.js             # 12 report endpoints
│   └── analytics.js           # dashboard widgets
├── stores/                    # Pinia stores (Options syntax)
│   ├── auth.js                # JWT + user + access matrix
│   ├── superAdmin.js
│   ├── tenant.js              # current tenant + subscription snapshot + planAllowsMainNav
│   ├── subscriptionGuard.js   # global gate flipped by 403 subscription.expired
│   ├── plans.js
│   ├── patients.js, patientCases.js, testItems.js, itemPackages.js,
│   ├── itemCategories.js, itemGroups.js, discounts.js, expenses.js,
│   ├── payments.js, laboratory.js
│   ├── users.js, doctors.js, accessTemplate.js
│   └── warnings.js            # response-envelope warnings queue
├── router/index.js            # route table + auth + access + plan guards
├── layouts/
│   ├── MainLayout.vue         # Sidebar + Topbar + SubscriptionExpiredGate
│   └── SuperAdminLayout.vue
├── views/                     # route components (33 tenant + 7 super)
│   ├── LandingView.vue        # public / (marketing)
│   ├── LoginView.vue          # /login
│   ├── PublicLabReportView.vue# /lab/view (QR-linked, no auth)
│   ├── WelcomeView.vue        # /home
│   ├── DashboardView.vue
│   ├── SetupReadinessView.vue
│   ├── PatientsView.vue, PatientCasesView.vue
│   ├── PaymentsView.vue       # /cashier
│   ├── LaboratoryView.vue     # /laboratory (result encoding + signing)
│   ├── TestItemsView.vue, ItemPackagesView.vue,
│   ├── ItemCategoriesView.vue, ItemGroupsView.vue
│   ├── DiscountsView.vue, ExpensesView.vue, UsersView.vue
│   ├── TenantSettingsView.vue
│   ├── SubscriptionView.vue
│   ├── Register*.vue, VerifyView.vue
│   ├── reports/               # 12 report screens
│   └── super/                 # SuperTenants, SuperPlans, SuperPayments, SuperUsers, …
├── components/
│   ├── Sidebar.vue, Topbar.vue, SuperAdminSidebar.vue
│   ├── Modal.vue, ConfirmDialog.vue, HelpModal.vue
│   ├── LabReportPrintable.vue # shared print template (logo, header, results, sigs, QR)
│   ├── SubscriptionExpiredGate.vue
│   ├── LineChart.vue, BarChart.vue, DoughnutChart.vue, StatCard.vue
│   ├── PaginationBar.vue, EmptyState.vue, SkeletonRows.vue, RowActionMenu.vue
│   ├── WarningsToast.vue, ChangePasswordDialog.vue, MobileFilterBar.vue
│   └── ReportHeader.vue
├── utils/
│   ├── format.js              # money(₱), formatDate, formatDateTime, todayISO, daysAgoISO
│   ├── constants.js           # payment methods, statuses, etc.
│   ├── access.js              # local user-access cache (fallback until API-backed)
│   ├── csvExport.js           # CSV export from report/table data
│   ├── importParse.js         # bulk Excel/CSV parser for test items / patients
│   ├── refFormat.js           # invoice / requisition number helpers
│   ├── timezones.js           # timezone helpers (PH default)
│   ├── generate.js
│   └── paypalSdk.js           # PayPal SDK loader (conditional)
├── assets/
│   ├── mylab-icon.png         # square icon (sidebar, PWA source)
│   ├── mylab-logo.png         # horizontal logo (landing page)
│   └── mylab-logo-login.png   # horizontal logo variant (login screen)
├── App.vue                    # RouterView + WarningsToast
├── main.js                    # createApp, register global handlers, strip .dark class
└── style.css                  # Tailwind + component classes
```

---

## API client

`src/api/client.js` wraps `fetch` with:

- **Response envelope** — `{ response, message, status, warnings? }`.
  - Callers receive `payload.response` (i.e. the shape they expect from
    the endpoint's docs).
  - `payload.message` is used as the thrown `Error.message` on non-2xx.
- **Auth** — a bearer token provider is set via `setTokenProvider(fn)`;
  the client resolves the correct token per request (staff token for
  everything except `/super/**` URLs — which use the super-admin token).
- **Global handlers** — the module exposes:
  - `setUnauthorizedHandler(fn)` — fired on 401 (unless the caller opts
    out via `skipUnauthorizedHandler`).
  - `setWarningsHandler(fn)` — fired whenever the envelope carries a
    non-empty `warnings[]` (success or failure).
  - `setSubscriptionExpiredHandler(fn)` — fired on 403 responses whose
    body matches `{ message: "subscription.expired" }`. `main.js` wires
    this to the `subscriptionGuard` store which flips the blocking overlay.
- **`assetUrl(path)`** — prefixes server-relative asset paths
  (`/public/uploads/…`) with the API host so `<img>` tags Just Work. No-op
  on `data:` / `blob:` / already-absolute URLs.

### Response envelope example

```json
{
  "response": { "uuid": "…", "status": "pending" },
  "message": "Payment uploaded (pending approval).",
  "status": 200,
  "warnings": [
    { "code": "notification.skipped.no-email",
      "text": "Owner not notified — tenant has no contact email." }
  ]
}
```

`main.js` registers the warnings handler once at boot; every warning drops
into `stores/warnings` and gets rendered by `<WarningsToast />` in `App.vue`.

### Adding a new endpoint

1. Create `src/api/foo.js`:
   ```js
   import { api } from './client'
   export const listFoo   = (q)     => api.get('/foo/dashboard', { query: q })
   export const createFoo = (body)  => api.post('/foo/create', body)
   export const updateFoo = (u, b)  => api.patch(`/foo/update/${u}`, b)
   export const deleteFoo = (u)     => api.delete(`/foo/delete/${u}`)
   ```
2. Add a Pinia store in `src/stores/foo.js` if the data is shared.
3. Consume from a view.

---

## Route map & shells

Three URL groups with disjoint chrome:

| Prefix | Layout | Login route | Token key | Notes |
|---|---|---|---|---|
| `/`, `/login`, `/register/*`, `/verify`, `/welcome`, `/lab/view` | none / minimal | — | — | Public: marketing landing, tenant registration + verification flow, QR-linked read-only lab report. |
| `/home`, `/dashboard`, `/patients`, `/patient-cases`, `/cashier`, `/laboratory`, `/test-items`, `/item-*`, `/discounts`, `/expenses`, `/users`, `/settings/tenant`, `/subscription`, `/reports/*` | `MainLayout` (Sidebar + Topbar + SubscriptionExpiredGate) | `/login` | `pos_token` | Tenant staff. `/home` is the always-visible landing (`WelcomeView`). |
| `/super/*` | `SuperAdminLayout` | `/super/login` | `pos_super_token` | Platform admin — independent auth store. |

## Auth model

- The tenant login response includes `{ access_token, uuid, username, role,
  tenant_uuid, tenant, subscription, access }`. The auth store persists it
  to localStorage and hydrates the tenant store + user-access.
- Post-login lands at `/home` (`WelcomeView`). `Dashboard` is itself gated
  by the `dashboard` access row like every other module — Welcome is the
  safe always-visible landing.
- The super-admin login is decoupled — its own store, its own token, its
  own set of layouts and routes under `/super/*`.

### Subscription gating

Two overlapping mechanisms:

- **Client-side snapshot** — `stores/tenant.js` keeps
  `current.subscription` (from the login response) and exposes
  `planAllowsMainNav(mainNav)` which reads the plan's `allowed_modules`.
  The router guard checks it and bounces plan-restricted modules to
  `/home`.
- **Server-authoritative gate** — the backend can respond with
  `403 { message: "subscription.expired" }` on any protected endpoint.
  `client.js` catches this and trips `subscriptionGuard.trip()`;
  `SubscriptionExpiredGate.vue` (mounted once in `MainLayout`, Teleported
  to `body`) renders a blocking overlay until the tenant renews. This
  wins over the cached snapshot in every case.

---

## Access control (per-user navigation)

### Data flow

1. `GET /access-template/dashboard` returns the **catalog** of navigation
   items (`navigation_id`, `main_navigation`, `sub_navigation`, …). Cached
   in `stores/accessTemplate.js` — call `.fetch()` before rendering the
   Assign Access modal.
2. On login, `data.access` is a per-user list of the same rows plus
   `has_access`. The auth store keeps this array and exposes:
   - `canOpen(mainNav)` — is any granted row under this main_navigation?
     Used by the **Sidebar** filter and the **router guard** (see below).
   - `canDo(mainNav, subNav)` — does the user hold this exact composite?
     Used to hide/disable action buttons inside a view. A wildcard
     `all-access` row under a main_navigation implicitly grants every
     sub_navigation.
   - `hasAccess(navigationId)` — direct numeric check.
3. **Assign Access** in Users builds an items array with
   `{ navigation_id, has_access }` for **every** row in the template
   (granted rows `true`, revoked rows `false`) and POSTs to
   `/user-access/save/:user_uuid`.
4. `GET /user-access/for-user/:user_uuid` hydrates the checkboxes on
   modal open.

### Router guard

`src/router/index.js` walks the matched routes; if any declares
`meta.mainNav`, the guard checks:

1. `auth.canOpen(mainNav)` — grant check. Fails → redirect to `/home`.
2. `tenant.planAllowsMainNav(mainNav)` — plan check. Fails → redirect to
   `/home`.

`/home` is deliberately un-gated as the safe landing.

### Sidebar filter

`src/components/Sidebar.vue` filters the nav list through
`auth.canOpen(item.mainNav)` before rendering. `SuperAdminSidebar` isn't
gated — super-admin has full access by definition.

### Backend expectation

Frontend enforcement is UX only. The backend enforces the same matrix
per-endpoint via `SubscriptionGuard` and access checks — every mutation
is validated server-side too.

---

## Warnings pipeline

Non-fatal server issues arrive as `payload.warnings[]`. Flow:

```
Endpoint  →  { response, message, status, warnings: [{code,text}] }
   │
   ▼
api/client.js  →  onWarnings(warnings, ctx)
   │
   ▼
main.js  →  useWarningsStore().pushBatch(warnings, ctx)
   │
   ▼
components/WarningsToast.vue  →  amber toast (auto-dismiss)
```

Store dedupes identical `(code, text)` pairs pushed within a few seconds
so a chatty endpoint doesn't stack the same toast.

---

## Adding a new module — checklist

Say we're adding a **Referrals** module for tracking external clinic
referrals.

1. **API** — `src/api/referrals.js` with the CRUD wrappers.
2. **Store** — `src/stores/referrals.js` if the data is shared across
   views.
3. **View** — `src/views/ReferralsView.vue`.
4. **Route** — register in `src/router/index.js` **with `meta.mainNav`**:
   ```js
   { path: 'referrals', name: 'referrals',
     meta: { mainNav: 'referrals' },
     component: () => import('../views/ReferralsView.vue') }
   ```
5. **Sidebar** — add an entry to `src/components/Sidebar.vue`:
   ```js
   { to: '/referrals', label: 'Referrals', icon: 'send', mainNav: 'referrals' }
   ```
6. **Access template** — the backend needs to append the new row(s) to the
   access template. Frontend needs no change; the Assign Access modal reads
   the template dynamically.
7. **Guard against missing access** — the sidebar auto-hides the entry
   when the user lacks it, and the router guard bounces direct-URL access.
8. **Plan gating** — if the module should only be available on certain
   plans, the backend's `subscription_plans.allowed_modules` array must
   include the new `mainNav` for those plans. The frontend's
   `planAllowsMainNav()` reads that array.

---

## Backend contract (short)

Most endpoints follow the same conventions:

- **List** — `GET /<resource>/dashboard?keywords&status[]&page_number&page_size`.
- **View** — `GET /<resource>/view/:uuid`.
- **Create** — `POST /<resource>/create` (multipart when an image field is present).
- **Update** — `PATCH /<resource>/update/:uuid`.
- **Delete** — `DELETE /<resource>/delete/:uuid`.
- **Toggle status** — `PATCH /<resource>/set-status/:uuid` with `{ status }`.

The response envelope is `{ response, message, status, warnings? }` —
always JSON.

Deviations that already exist:
- `POST /public/tenant/register` + `POST /public/tenant/verify` — public
  (no auth header required).
- `PUT /patient-requisition/:uuid/items` — bulk item sync.
- `PATCH /patient-requisition/:uuid/discount` — discount only.
- `PUT /lab-report/:uuid/results` — result-value upsert.
- `PATCH /lab-report/:uuid/set-final` / `unset-final` / `void` — status
  transitions instead of a generic `set-status`.
- `POST /user-access/save/:user_uuid` — full access-matrix save.
- `POST /ai-extraction/receipt` — multipart, returns `{ file_url,
  extraction: { … } }`.
- `POST /tenant-subscription-payment/create-paypal-order/:uuid` +
  `PATCH /capture-paypal/:uuid` — PayPal Smart Button flow.
- `GET /lab-report/public/view?t=<signed-token>` — no auth, HMAC-verified
  QR link.

---

## Deployment

```bash
npm ci
npm run build:production   # or build:staging
```

The output in `dist/` is a static SPA + PWA. Serve it behind any web
server capable of **catch-all rewrites** (nginx `try_files $uri
/index.html`, S3 + CloudFront custom error, etc.). See
[`DEPLOYMENT.md`](./DEPLOYMENT.md) for the full nginx + Jenkins recipe.

Set environment-specific values via:
- `.env.production` (committed) — sensible defaults.
- Rebuild per environment; **there is no runtime config**. Values are
  baked into the JS bundle at build time.

---

## Testing & debugging

- **Vue devtools** — inspect Pinia state (`auth.user`, `tenant.current.subscription`,
  `subscriptionGuard.forcedExpired`, `warnings.items`).
- **Network tab** — every request should have `Authorization: Bearer …`
  when authenticated. The envelope shape is easy to inspect.
- **Simulate a warning** — the fastest way is to have the backend attach
  a fake warning to any 2xx response. `WarningsToast` will render it.
- **Simulate expired subscription** — in devtools console:
  `usePiniaStore = window.__pinia; usePiniaStore._s.get('subscriptionGuard').trip({message:'subscription.expired'})`
  or just have the backend return the 403.
- **Simulate missing access** — clear the `access` array on the auth user
  and reload; the sidebar should collapse to just `/home`.
- **Playwright mobile** — `npm run test:mobile` runs headless; `-- --ui`
  for the picker.

---

## Troubleshooting

| Symptom | Root cause / fix |
|---|---|
| Sidebar entry disappears after adding it | Missing `mainNav` on the route/sidebar item, the current user's access doesn't include it, or the tenant's plan `allowed_modules` doesn't include it. |
| Direct-URL navigation redirects to `/home` | Same as above — router guard is doing its job. |
| 401 kicks you back to login unexpectedly | Token expired. The unauthorized handler clears the store and pushes to the login route with `?expired=1`. |
| Blocking "Subscription expired" overlay won't dismiss | Only clears when the backend stops returning 403 `subscription.expired`. Renew from `/subscription` (the page is deliberately reachable through the overlay). |
| Broken image on a tenant logo / doctor signature | `assetUrl()` isn't applied — the URL is likely raw (`/public/uploads/…`) instead of prefixed with the API origin. |
| CORS error against staging | The staging API's `CORS_ORIGINS` must include the frontend origin. Or run behind a reverse proxy that shares an origin. |
| PWA install prompt won't appear | Chrome/Edge require HTTPS (localhost exempted) plus a reachable manifest + icons. `npm run pwa:icons` regenerates icons if you added a new logo. |

---

## Conventions

- **File naming** — Views end in `View.vue`, layouts in `Layout.vue`,
  components in `PascalCase.vue`. API modules and stores are lower
  camelCase.
- **CSS** — Tailwind classes only; a small set of shortcuts (`btn-primary`,
  `card`, `input`, `label`, `badge-*`) is defined in `style.css`. If you're
  reaching for a component library, stop and reuse those first.
- **Formatting money & dates** — always through `src/utils/format.js`
  (`money`, `formatDate`, `formatDateTime`). Never `.toLocaleDateString()`
  inline.
- **No dark mode yet** — `main.js` deliberately strips any leftover `.dark`
  class and wipes prior dark-mode localStorage keys. A semantic-token
  refactor in `tailwind.config.js` is the plan when it's added.
- **No dead code** — voided features are removed, not commented out.

---

## Where to look next

- **[`GETTING_STARTED.md`](./GETTING_STARTED.md)** — user-facing walkthrough
  (also embedded in-app via `HelpModal.vue`). Any Getting-Started copy
  change must land in **both** files or the sidebar overlay drifts from the
  markdown.
- **[`USER_MANUAL.md`](./USER_MANUAL.md)** — feature-by-feature reference.
- **[`DEPLOYMENT.md`](./DEPLOYMENT.md)** — nginx + Jenkins deploy recipe.
- **[`../laboratory-api/README.md`](../laboratory-api/README.md)** — backend
  overview + endpoint envelope.
- **The commit log** — mono-thread history of design decisions.

---

*MyLab Web · Developer Setup*
