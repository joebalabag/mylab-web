import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useSuperAdminStore } from '../stores/superAdmin'
import { useTenantStore } from '../stores/tenant'

const routes = [
  {
    path: '/',
    name: 'landing',
    component: () => import('../views/LandingView.vue'),
    meta: { public: true }
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/LoginView.vue'),
    meta: { public: true }
  },

  // Public lab-report view landed via the QR code on the printout.
  // Loaded outside MainLayout so it renders standalone (no sidebar / auth).
  {
    path: '/lab/view',
    name: 'public-lab-view',
    component: () => import('../views/PublicLabReportView.vue'),
    meta: { public: true },
  },

  // ─── Public tenant registration ───
  {
    path: '/register',
    name: 'register',
    component: () => import('../views/RegisterView.vue'),
    meta: { public: true }
  },
  {
    path: '/register/verify',
    name: 'register-verify',
    component: () => import('../views/RegisterVerifyView.vue'),
    meta: { public: true }
  },
  {
    path: '/welcome',
    name: 'register-verified',
    component: () => import('../views/RegisterVerifiedView.vue'),
    meta: { public: true }
  },
  {
    path: '/register/verify-failed',
    name: 'register-verify-failed',
    component: () => import('../views/RegisterVerifyFailedView.vue'),
    meta: { public: true }
  },
  // Landing point for the ${appUrl}/verify?token=xxx link in the verification email.
  {
    path: '/verify',
    name: 'verify',
    component: () => import('../views/VerifyView.vue'),
    meta: { public: true }
  },
  // Landing point for the ${appUrl}/reset-password?token=xxx link in the
  // forgot-password email. Verifies the token, then lets the user set a new
  // password and bounces them to /login on success.
  {
    path: '/reset-password',
    name: 'reset-password',
    component: () => import('../views/ResetPasswordView.vue'),
    meta: { public: true }
  },

  // ─── Super Admin ───
  {
    path: '/super/login',
    name: 'super-login',
    component: () => import('../views/super/SuperLoginView.vue'),
    meta: { public: true, super: true }
  },
  {
    path: '/super',
    component: () => import('../layouts/SuperAdminLayout.vue'),
    meta: { super: true },
    children: [
      { path: '',          redirect: '/super/dashboard' },
      { path: 'dashboard', name: 'super-dashboard', component: () => import('../views/super/SuperDashboardView.vue') },
      { path: 'tenants',   name: 'super-tenants',   component: () => import('../views/super/SuperTenantsView.vue') },
      { path: 'plans',     name: 'super-plans',     component: () => import('../views/super/SuperPlansView.vue') },
      { path: 'subscription-payments', name: 'super-subscription-payments',
        component: () => import('../views/super/SuperSubscriptionPaymentsView.vue') },
      { path: 'tenant-users', name: 'super-tenant-users',
        component: () => import('../views/super/SuperTenantUsersView.vue') },
      { path: 'reports', name: 'super-reports',
        component: () => import('../views/super/SuperReportsView.vue') },
      { path: 'users',     name: 'super-users',     component: () => import('../views/super/SuperUsersView.vue') }
    ]
  },

  // ─── Store / staff ───
  {
    path: '/',
    component: () => import('../layouts/MainLayout.vue'),
    children: [
      // `/` is the public marketing landing page (see the top-level route above).
      // MainLayout hosts only the authenticated app views underneath it.
      { path: 'home',      name: 'home',      component: () => import('../views/WelcomeView.vue') },
      { path: 'dashboard', name: 'dashboard', meta: { mainNav: 'dashboard' }, component: () => import('../views/DashboardView.vue') },
      { path: 'setup-readiness', name: 'setup-readiness', meta: { mainNav: 'setup readiness' }, component: () => import('../views/SetupReadinessView.vue') },
      { path: 'users',        name: 'users',           meta: { mainNav: 'user management' }, component: () => import('../views/UsersView.vue') },
      { path: 'settings/tenant', name: 'tenant-settings', meta: { mainNav: 'store settings' }, component: () => import('../views/TenantSettingsView.vue') },
      { path: 'subscription', name: 'subscription',    meta: { mainNav: 'subscription' },   component: () => import('../views/SubscriptionView.vue') },
      { path: 'discounts',    name: 'discounts',       meta: { mainNav: 'discounts' },      component: () => import('../views/DiscountsView.vue') },
      { path: 'expenses',     name: 'expenses',        meta: { mainNav: 'expenses' },       component: () => import('../views/ExpensesView.vue') },
      { path: 'item-groups',      name: 'item-groups',     meta: { mainNav: 'item groups' },     component: () => import('../views/ItemGroupsView.vue') },
      { path: 'item-categories',  name: 'item-categories', meta: { mainNav: 'item categories' }, component: () => import('../views/ItemCategoriesView.vue') },
      { path: 'test-items',       name: 'test-items',      meta: { mainNav: 'test items' },      component: () => import('../views/TestItemsView.vue') },
      { path: 'item-packages',    name: 'item-packages',   meta: { mainNav: 'item packages' },   component: () => import('../views/ItemPackagesView.vue') },
      { path: 'patients',         name: 'patients',        meta: { mainNav: 'patients' },        component: () => import('../views/PatientsView.vue') },
      { path: 'patient-cases',    name: 'patient-cases',   meta: { mainNav: 'patient cases' },   component: () => import('../views/PatientCasesView.vue') },
      { path: 'cashier',          name: 'cashier',         meta: { mainNav: 'cashier' },         component: () => import('../views/PaymentsView.vue') },
      { path: 'laboratory',       name: 'laboratory',      meta: { mainNav: 'laboratory' },      component: () => import('../views/LaboratoryView.vue') },
      // ─── Reports (each has its own dedicated backend endpoint) ───
      { path: 'reports/summary',         name: 'report-summary',         component: () => import('../views/reports/SummaryReportView.vue') },
      { path: 'reports/monthly-sales',   name: 'report-monthly-sales',   component: () => import('../views/reports/MonthlySalesReportView.vue') },
      { path: 'reports/monthly-tests',   name: 'report-monthly-tests',   component: () => import('../views/reports/MonthlyTestReportView.vue') },
      { path: 'reports/cashier-sales',   name: 'report-cashier-sales',   component: () => import('../views/reports/CashierSalesReportView.vue') },
      { path: 'reports/voids',           name: 'report-voids',           component: () => import('../views/reports/VoidReportView.vue') },
      { path: 'reports/daily-sales',     name: 'report-daily-sales',     component: () => import('../views/reports/DailySalesReportView.vue') },
      { path: 'reports/daily-tests',     name: 'report-daily-tests',     component: () => import('../views/reports/DailyTestReportView.vue') },
      { path: 'reports/daily-detailed-sales', name: 'report-daily-detailed-sales', component: () => import('../views/reports/DailyDetailedSalesReportView.vue') },
      { path: 'reports/discounts',       name: 'report-discounts',       component: () => import('../views/reports/DiscountReportView.vue') },
      { path: 'reports/expenses',        name: 'report-expenses',        component: () => import('../views/reports/ExpenseReportView.vue') },
      { path: 'reports/payment-summary', name: 'report-payment-summary', component: () => import('../views/reports/PaymentSummaryReportView.vue') },
      { path: 'reports/test-analytics',  name: 'report-test-analytics',  component: () => import('../views/reports/TestAnalyticsReportView.vue') }
    ]
  },
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// Vite rebuilds change chunk hashes, so an already-loaded page trying to
// lazy-load a route via `() => import(...)` will 404 on the stale hash. Vue
// Router swallows the rejected promise and the screen just goes white. When
// we see a dynamic-import failure, force a hard reload to the intended URL
// so the browser refetches index.html and gets the current chunk manifest.
//
// A sessionStorage one-shot guard prevents infinite reload loops when the
// import failure is caused by an actual network/build error rather than a
// stale hash.
const RELOAD_GUARD_KEY = 'router:chunk-reload'
function reloadForStaleChunk(pathHint) {
  const target = pathHint || (window.location.pathname + window.location.search)
  try {
    if (sessionStorage.getItem(RELOAD_GUARD_KEY) === target) return
    sessionStorage.setItem(RELOAD_GUARD_KEY, target)
  } catch (_) { /* private mode / disabled storage — proceed */ }
  window.location.assign(target)
}
function looksLikeChunkFailure(err) {
  const msg = String(err?.message || err || '')
  return (
    err?.name === 'ChunkLoadError' ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    // Chrome / Firefox network-side failures on the module fetch itself.
    /Loading (?:chunk|CSS chunk) \d+ failed/i.test(msg)
  )
}

router.onError((err, to) => {
  if (!looksLikeChunkFailure(err)) return
  reloadForStaleChunk(to?.fullPath)
})

// Vite emits `vite:preloadError` on window when a preloaded chunk (usually a
// sibling of the entry chunk) 404s after a rebuild — Vue Router never sees
// this one, so the screen would just blank. Hooking window catches it too.
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault?.()
    reloadForStaleChunk()
  })
  // Belt-and-braces: an unhandled promise rejection whose reason matches the
  // chunk-failure signatures. Older Vite versions don't emit preloadError.
  window.addEventListener('unhandledrejection', (event) => {
    if (looksLikeChunkFailure(event.reason)) {
      event.preventDefault?.()
      reloadForStaleChunk()
    }
  })
}

// Clear the reload guard on any successful navigation so a genuinely bad
// route doesn't stick around and block a future retry.
router.afterEach(() => {
  try { sessionStorage.removeItem(RELOAD_GUARD_KEY) } catch (_) {}
})

router.beforeEach((to) => {
  const isSuperRoute = to.matched.some(r => r.meta?.super) || to.path.startsWith('/super')

  if (isSuperRoute) {
    const superAdmin = useSuperAdminStore()
    if (!to.meta.public && !superAdmin.isAuthenticated) {
      return { name: 'super-login', query: { redirect: to.fullPath } }
    }
    if (to.name === 'super-login' && superAdmin.isAuthenticated) {
      return { name: 'super-dashboard' }
    }
    return
  }

  const auth = useAuthStore()
  if (!to.meta.public && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.name === 'login' && auth.isAuthenticated) {
    return { name: 'home' }
  }
  // Access gate — if the destination declares a mainNav and the user doesn't
  // have any granted row under it, bounce them to the Welcome screen (safe
  // default landing). Prevents typing a URL to bypass the sidebar filter.
  const mainNav = to.meta?.mainNav
  if (mainNav && auth.isAuthenticated && !auth.canOpen(mainNav)) {
    return { name: 'home' }
  }
  if (mainNav && auth.isAuthenticated && !useTenantStore().planAllowsMainNav(mainNav)) {
    return { name: 'home' }
  }
})

export default router
