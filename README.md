# MyLab Web

Vue 3 + Pinia + Tailwind frontend for **MyLab**, a browser-based laboratory
management system for clinical labs. Two consoles are served from the same
SPA:

- **Tenant console** (`/`, `/home`, `/patients`, …) — lab staff run
  day-to-day operations: patients, cases, requisitions, cashier, result
  encoding, lab reports, reports.
- **Platform console** (`/super/*`) — super admins provision tenants,
  curate subscription plans, review payments.

Both consoles authenticate against the NestJS API at `http://127.0.0.1:3010/api`
by default (override with `VITE_API_BASE`) and hold their JWT in
`localStorage` under separate keys so the sessions don't clobber each other.

The root URL renders a **public marketing landing page** (`LandingView`);
sign-in lives at `/login`. Patients can open a signed, read-only lab report
at `/lab/view?uuid=…&t=…` via the QR code printed on the finalized report.

## Requirements

- Node 20+
- The companion NestJS API from `mylab-api` running on port 3010 (see
  [`../laboratory-api/README.md`](../laboratory-api/README.md))

## Scripts

```
npm install
npm run dev              # Vite dev server on :5173 (HMR + PWA install prompt)
npm run build            # production build → dist/
npm run build:staging    # staging build (loads .env.staging)
npm run build:production # explicit production build
npm run preview          # serve dist/ locally
npm run screenshots      # doc capture tool
npm run pwa:icons        # regenerate PWA icons from the source logo
npm run test:mobile      # Playwright mobile e2e suite
```

Vite HMR sometimes misses `src/router/index.js` changes; if a newly-added
route can't be opened, restart `npm run dev`.

## Environment

Set these in `.env.local` (all optional except the API base):

| Var | Default | Purpose |
|---|---|---|
| `VITE_API_BASE` | `http://127.0.0.1:3010/api` | Base URL for the API client |
| `VITE_PAY_GCASH_NAME` | `MyLab Platform` | Fallback GCash payee name shown on the Subscription page |
| `VITE_PAY_GCASH_NUMBER` | `0917 000 0000` | Fallback GCash number |
| `VITE_PAY_GCASH_QR_URL` | *(empty)* | Fallback QR image; overridden per plan when the platform admin uploads a `qrcode_for_payment` |
| `VITE_PAY_BANK_NAME` | `BDO — MyLab Platform Inc.` | Bank transfer name shown as the alternative payment |
| `VITE_PAY_BANK_ACCOUNT` | `0000 0000 0000` | Bank account for the alternative payment |
| `VITE_PAYPAL_CLIENT_ID` | *(sandbox)* | PayPal Smart Button client ID; production swaps to a Live ID |
| `VITE_PAYPAL_CURRENCY` | `PHP` | PayPal settlement currency |

Every `VITE_*` var is exposed on `import.meta.env` inside the SPA — that's
a Vite convention, they're **compiled into the client bundle**, so treat
them as public.

## Layout

```
src/
├── api/                       # thin fetch wrappers (one per API resource)
│   ├── client.js              # base fetch + envelope unwrap + Bearer header + assetUrl()
│   ├── auth.js                # /auth/user/login, /auth/admin/login, verify-manager, own-password change
│   ├── patients.js            # /patient/* (CRUD + search + duplicate-check)
│   ├── patientCases.js        # /patient-case/* (visit grouping)
│   ├── patientRequisitions.js # /patient-requisition/* (CRUD + items sync + discount)
│   ├── laboratory.js          # /lab-report/* (dashboard, view, encode, finalize, void)
│   ├── testItems.js           # /test-item/* (+ components sync)
│   ├── itemGroups.js, itemCategories.js, itemPackages.js
│   ├── discounts.js, expenses.js
│   ├── payments.js            # /payment/* (unpaid cases + collection)
│   ├── users.js               # tenant staff CRUD + verify-credentials + reset-password
│   ├── adminUsers.js          # super admin CRUD (/admin/*)
│   ├── tenants.js             # /tenant/* (multipart for logo + lab-header image)
│   ├── doctors.js             # /doctor/* (pathologist / medtech registry with e-signature)
│   ├── subscriptionPlans.js   # /subscription-plan/* + public /trials, /list
│   ├── tenantSubscriptionPayments.js  # payment history + JSON /upload + PayPal capture
│   ├── aiExtraction.js        # /ai-extraction/receipt (multipart, returns file_url + extraction)
│   ├── accessTemplate.js      # /access-template/* (role catalog)
│   ├── userAccess.js          # /user-access/* (per-user overrides)
│   ├── setupReadiness.js      # /setup-readiness/status (onboarding checklist)
│   ├── publicRegistration.js  # /public/tenant/register + verify + resend-verification
│   ├── reports.js             # /reports/* (12 report endpoints)
│   └── analytics.js           # /analytics/* (dashboard widgets)
├── stores/                    # Pinia stores
│   ├── auth.js                # staff session + access matrix (canOpen / canDo / hasAccess)
│   ├── superAdmin.js          # super admin session + admin roster
│   ├── tenant.js              # current tenant + subscription snapshot + planAllowsMainNav
│   ├── subscriptionGuard.js   # global gate flipped by backend 403 subscription.expired
│   ├── plans.js               # active subscription plans
│   ├── patients.js, patientCases.js, testItems.js, itemPackages.js,
│   ├── itemCategories.js, itemGroups.js, discounts.js, expenses.js,
│   ├── payments.js, laboratory.js
│   ├── users.js, doctors.js, accessTemplate.js
│   └── warnings.js            # global response-envelope warnings queue
├── views/
│   ├── LandingView.vue        # public marketing page at /
│   ├── LoginView.vue          # /login + resend-verification form + PWA install prompt
│   ├── PublicLabReportView.vue# /lab/view — QR-linked read-only lab report
│   ├── WelcomeView.vue        # /home — post-login landing
│   ├── DashboardView.vue      # /dashboard — KPI widgets, revenue charts, receivables, throughput
│   ├── SetupReadinessView.vue # /setup-readiness — one-time onboarding checklist
│   ├── PatientsView.vue, PatientCasesView.vue
│   ├── PaymentsView.vue       # /cashier — requisition finalization + payment collection
│   ├── LaboratoryView.vue     # /laboratory — result encoding + signing + QR + print
│   ├── TestItemsView.vue, ItemPackagesView.vue, ItemCategoriesView.vue, ItemGroupsView.vue
│   ├── DiscountsView.vue, ExpensesView.vue, UsersView.vue
│   ├── TenantSettingsView.vue # /settings/tenant — branding + receipt/report templates
│   ├── SubscriptionView.vue   # /subscription — plan display + GCash/bank/PayPal payment
│   ├── Register*.vue, VerifyView.vue
│   ├── reports/               # 12 report screens (summary, monthly-sales, daily-tests, …)
│   └── super/
│       ├── SuperLoginView.vue, SuperDashboardView.vue
│       ├── SuperTenantsView.vue, SuperPlansView.vue
│       ├── SuperSubscriptionPaymentsView.vue
│       ├── SuperTenantUsersView.vue, SuperUsersView.vue
│       └── SuperReportsView.vue
├── layouts/                   # MainLayout, SuperAdminLayout
├── components/
│   ├── Sidebar.vue, Topbar.vue
│   ├── Modal.vue, ConfirmDialog.vue, HelpModal.vue
│   ├── LabReportPrintable.vue # print template with logo, header mode, results, signatures, QR
│   ├── SubscriptionExpiredGate.vue
│   ├── LineChart.vue, BarChart.vue, DoughnutChart.vue, StatCard.vue
│   ├── PaginationBar.vue, EmptyState.vue, SkeletonRows.vue, RowActionMenu.vue
│   ├── WarningsToast.vue, ChangePasswordDialog.vue
│   └── MobileFilterBar.vue
├── router/index.js            # routes + role/session guards + planAllowsMainNav
└── utils/
    ├── format.js              # money, formatDate, formatDateTime, todayISO (₱, en-PH)
    ├── csvExport.js           # CSV export helper for reports
    ├── importParse.js         # bulk test-item / patient Excel/CSV parser
    ├── access.js              # local user-access cache
    ├── constants.js, refFormat.js, timezones.js, generate.js
    └── paypalSdk.js           # PayPal Smart Button SDK loader
```

### API client conventions

- All endpoints return the envelope `{ response, message, status, warnings? }`;
  `client.js` unwraps `response` and throws with `message` on non-2xx.
- Multipart wrappers set `isMultipart: true`; do **not** set a
  `Content-Type` yourself.
- Server-relative paths (`/public/uploads/…`) can be turned into absolute
  URLs with `assetUrl(path)` (respects `data:` / `blob:` / absolute URLs
  unchanged).
- A single global `setUnauthorizedHandler` in `main.js` differentiates the
  two consoles: 401s inside `/super/**` log out the super admin, everything
  else logs out the staff user.
- A separate global `setSubscriptionExpiredHandler` in `main.js` catches
  backend 403 `{ message: "subscription.expired" }` responses and trips the
  `subscriptionGuard` store — `SubscriptionExpiredGate.vue` renders the
  blocking overlay regardless of the cached tenant subscription snapshot.

### Session isolation

| | Staff | Super admin |
|---|---|---|
| Token key | `pos_token` | `pos_super_token` |
| Session key | `pos_user` | `pos_super_user` |
| Login endpoint | `POST /auth/user/login` | `POST /auth/admin/login` |
| Change-own-password endpoint | `PATCH /user/profile/change-password` | `PATCH /admin/profile/change-password` |

Both sessions read their token on module load and push it into
`client.js`; whichever store is imported last wins if both are present
(in practice the router only mounts one console at a time).

## Feature notes

### Patients & cases (`/patients`, `/patient-cases`)

- Patient master with **search-first UX** — the create form checks
  first-name + last-name + birthdate against `/patient/search` before
  saving, warning the operator if a duplicate is likely.
- MRN (`P-NNNNNN`) auto-generated per tenant on create.
- A **patient case** groups all requisitions + payments + lab reports for
  a single visit. Case detail eager-loads its requisitions with running
  totals and payment status.

### Requisitions (inside a patient case)

- Line items are **test items** or **item packages** (bundles that expand
  into their constituent tests). Bulk item sync (`PUT
  /patient-requisition/:uuid/items`) recomputes totals and re-applies the
  requisition-level discount in one call.
- Discount handling is separate: `PATCH /:uuid/discount` sets, changes, or
  clears the discount without re-syncing items.
- Requisition number (`R-NNNNNN`) auto-generated per tenant on create.

### Cashier (`/cashier`)

- Finalize a requisition and collect payment in one flow. Supports **8
  payment methods**: cash, e-wallet (GCash / Maya / GrabPay), bank
  transfer, accounts receivable, insurance, paid outside, charity/waived,
  other.
- Channeled methods (e-wallet, bank transfer) require a payer channel +
  reference. Non-cash arrangements (A/R, insurance, paid outside) unlock
  the requisition immediately but money arrives later — the arrangement
  is closed with `PATCH /payment/:uuid/resolve-arrangement`.
- Void requires a manager password (`POST /auth/verify-manager`).

### Laboratory (`/laboratory`)

- Result encoding with **5 result types**:
  - `single` — one scalar value (e.g. AST 24)
  - `panel` — multiple named fields (e.g. CBC = HGB, HCT, WBC, …)
  - `narrative` — free-text report (histopath, radiology-style write-ups)
  - `culture` — culture + sensitivity grid
  - `matrix` — arbitrary rows × cols table
- Numeric results are validated against the test item's reference range.
- Multi-stage signing: **medtech** signs first, then **pathologist** signs
  to finalize. Both licence numbers and e-signature images (uploaded to
  the doctor record) print on the report.
- Finalizing generates a **QR code** that points to `/lab/view?uuid=…&t=…`
  — the token is HMAC-signed on the backend (`JWT_SECRET`) so anyone with
  the printed report can verify authenticity without an account.
- Print templates are chosen per **item category** (`ItemCategoriesView`
  configures paper size + signatory role + template variant).

### Subscription (`/subscription`)

Dedicated module for tenants to renew or upgrade:

1. **Status block** — current plan, expiry, days remaining. Badge switches
   Active / Expiring soon / Expired / No plan.
2. **Plan picker** — active plans with `price > 0` shown as selectable
   cards. Trial plans have their own subsection.
3. **Payment Instructions (per plan)** — QR shown is the selected plan's
   `qrcode_for_payment`, else the env fallback.
4. **Submit Payment** — receipt upload triggers `POST /ai-extraction/receipt`
   (Tesseract OCR on the backend); the returned `extraction` auto-fills
   `amount_paid`, `payment_reference_number`, `payment_method`, etc.
5. **PayPal Smart Button** appears when `VITE_PAYPAL_CLIENT_ID` is set.
   The button creates a PayPal order via `POST /tenant-subscription-payment/create-paypal-order/:uuid`
   and captures via `PATCH /capture-paypal/:uuid`; the backend also has a
   PayPal webhook that auto-activates the subscription for redundancy.
6. **Payment history** — table with Submitted / Plan / Amount Paid / Method
   / Status / Receipt (with modal viewer).

### Platform console (`/super`)

- **Tenants** — CRUD against `/tenant/*`. Logo + lab-header image upload,
  per-tenant status toggle, subscription override (`PATCH /alter-subscription/:uuid`).
- **Subscription plans** — CRUD against `/subscription-plan/*`. QR image
  uploader per plan.
- **Payments** — approve / reject uploaded subscription payments.
- **Tenant users** — cross-tenant staff roster (filter by tenant).
- **Super admin users** — CRUD against `/admin/*`.
- **Reports** — platform-level revenue / churn analytics.

## Auth guards

`router/index.js` runs `router.beforeEach` on every navigation:

- Routes with `meta.super` require an authenticated super admin;
  unauthenticated hits redirect to `/super/login`.
- All other private routes require an authenticated staff user;
  unauthenticated hits redirect to `/login`.
- Routes with `meta.mainNav` also check `auth.canOpen(mainNav)` — missing
  access bounces to `/home`.
- Routes with `meta.mainNav` additionally check
  `tenant.planAllowsMainNav(mainNav)` — a plan-restricted module bounces
  to `/home` regardless of access grant.

## Persistence

Non-sensitive slices are cached in `localStorage` for a warm boot:

- `pos_token`, `pos_user`, `pos_tenant` — staff session + current-tenant
  summary.
- `pos_super_token`, `pos_super_user`, `pos_super_admins` — super-admin
  session + roster cache.
- `pos_tenants` — super-admin's tenant roster (only written from
  super-admin flows).
- `pos_sidebar_collapsed` — sidebar collapse preference.
- `laboratory.filters.v1` — Lab dashboard filter preferences.

Tokens are cleared on logout and on 401 responses (via
`setUnauthorizedHandler`).

## PWA

`vite-plugin-pwa` is wired with `registerType: 'autoUpdate'` so the service
worker refreshes without a user prompt. Install prompts appear on desktop
Chrome/Edge and mobile Add-to-Home-Screen. `navigateFallbackDenylist`
excludes `/api/*` and `/public/*` so live data is never cached. Icons live
in `public/pwa-*.png` and are regenerated from `src/assets/mylab-icon.png`
via `npm run pwa:icons`.

## Testing

Playwright mobile suite:

```
npm run test:mobile          # headless run
npm run test:mobile:report   # HTML report
```
