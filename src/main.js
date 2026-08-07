import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './style.css'
import {
  setTokenProvider, setUnauthorizedHandler, setWarningsHandler,
  setSubscriptionExpiredHandler
} from './api/client'
import { useAuthStore } from './stores/auth'
import { useSuperAdminStore } from './stores/superAdmin'
import { useWarningsStore } from './stores/warnings'
import { useSubscriptionGuardStore } from './stores/subscriptionGuard'

// Clean up any dark-mode leftovers from prior experiments — force-remove the
// `.dark` class in case it got stuck on <html>, and wipe both known
// preference keys so returning users don't inherit stale state.
document.documentElement.classList.remove('dark')
try {
  localStorage.removeItem('pos_theme')
  localStorage.removeItem('mylab:theme')
} catch (_) { /* private mode / disabled storage */ }

const app = createApp(App)
app.use(createPinia())
app.use(router)

// Surface silent Vue failures. Without these, errors thrown inside a
// component's setup() / render / lifecycle are swallowed in production and
// only whispered as an "[Vue warn]" in dev — which is how the KDS routes
// occasionally rendered a completely white screen with a clean console.
// Logging both handlers means the next occurrence leaves a trail.
app.config.errorHandler = (err, instance, info) => {
  const name = instance?.$options?.name || instance?.$?.type?.name || 'unknown'
  console.error(`[vue error] (${info}) in <${name}>:`, err)
}
app.config.warnHandler = (msg, instance, trace) => {
  const name = instance?.$options?.name || instance?.$?.type?.name || 'unknown'
  console.warn(`[vue warn] in <${name}>: ${msg}${trace ? '\n' + trace : ''}`)
}

// Two consoles share the same bundle. Resolve the API bearer per request
// from the URL — /super/** uses the super-admin token, everything else
// uses the staff token — so opening two tabs (one staff, one super-admin)
// no longer clobbers the shared client state.
setTokenProvider(() => {
  try {
    const path = router.currentRoute.value?.path
      || (typeof window !== 'undefined' ? window.location.pathname : '')
    if (path && path.startsWith('/super')) {
      return localStorage.getItem('pos_super_token') || null
    }
    return localStorage.getItem('pos_token') || null
  } catch (_) {
    return null
  }
})

app.mount('#app')

// Non-fatal server warnings (from the response envelope's `warnings[]`)
// flow into a Pinia queue and get rendered by <WarningsToast /> in App.vue.
setWarningsHandler((warnings, context) => {
  const store = useWarningsStore()
  store.pushBatch(warnings, context)
})

// Backend-authoritative subscription-expired signal — any 403 with the
// message "subscription.expired" flips the global gate flag so the
// SubscriptionExpiredGate modal opens on top of whatever the user is doing.
// Ignored on the super-admin console (that guard is per-tenant, not per-admin).
setSubscriptionExpiredHandler((payload) => {
  const path = router.currentRoute.value?.path || ''
  if (path.startsWith('/super')) return
  const guard = useSubscriptionGuardStore()
  guard.trip(payload)
})

// Global auth failure → force sign-out and bounce to the right login page
setUnauthorizedHandler(() => {
  const currentPath = router.currentRoute.value?.path || ''
  const inSuperConsole = currentPath.startsWith('/super')
  if (inSuperConsole) {
    const superAdmin = useSuperAdminStore()
    if (superAdmin.isAuthenticated) {
      superAdmin.logout()
      router.push({ name: 'super-login', query: { expired: 1 } }).catch(() => {})
    }
    return
  }
  const auth = useAuthStore()
  if (auth.isAuthenticated) {
    auth.logout()
    router.push({ name: 'login', query: { expired: 1 } }).catch(() => {})
  }
})
