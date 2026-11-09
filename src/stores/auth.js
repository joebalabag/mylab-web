import { defineStore } from 'pinia'
import { setToken } from '../api/client'
import * as authApi from '../api/auth'
import * as labBranchesApi from '../api/labBranches'
import { sendForget as sendPresenceForget } from '../api/presence'
import { useTenantStore } from './tenant'
import { useSubscriptionGuardStore } from './subscriptionGuard'
import { clearTenantTheme } from '../theme/apply'

const TOKEN_KEY    = 'pos_token'
const USER_KEY     = 'pos_user'
// Cache the sibling-branch list across page refreshes so LaboratoryView
// doesn't have to re-probe /lab-report/branches every mount.
const BRANCHES_KEY = 'pos_branches'

// Boot token into the API client before any request goes out.
setToken(localStorage.getItem(TOKEN_KEY) || null)

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: JSON.parse(localStorage.getItem(USER_KEY) || 'null'),
    token: localStorage.getItem(TOKEN_KEY) || null,
    // Sibling-branch tenants under the same owner as the signed-in user's
    // home tenant. Populated on login (and optionally re-probed). Drives
    // the "Branch search" button visibility in the Laboratory dashboard.
    branches: JSON.parse(localStorage.getItem(BRANCHES_KEY) || '[]'),
  }),
  getters: {
    isAuthenticated: (s) => !!s.token,
    role:            (s) => s.user?.role || null,
    tenantUuid:      (s) => s.user?.tenant_uuid || null,
    // True when this user's home tenant has at least one sibling branch
    // (same owner) — enables the Branch Search affordance.
    hasBranches:     (s) => Array.isArray(s.branches) && s.branches.length > 0,
    // All access rows the login server sent for this user, filtered to the
    // ones that are actually granted (has_access === true).
    myAccessRows: (s) => {
      const list = Array.isArray(s.user?.access) ? s.user.access : []
      return list.filter(r => r?.has_access === true)
    }
  },
  actions: {
    async login(username, password) {
      try {
        const data = await authApi.userLogin(username, password)
        if (!data?.access_token) {
          return { ok: false, message: 'Login response missing token' }
        }
        this.token = data.access_token
        setToken(this.token)
        localStorage.setItem(TOKEN_KEY, this.token)
        // Fresh session — clear any leftover forced-expired flag from a
        // previous session that got 403'd out.
        try { useSubscriptionGuardStore().reset() } catch (_) {}

        const safe = {
          uuid: data.uuid,
          username: data.username,
          name: data.name,
          // Optional "Name displayed on lab result" + license — used by
          // LaboratoryView to pre-fill signatory fields with the display
          // name instead of the full legal name.
          lab_display_name: data.lab_display_name ?? null,
          license_number: data.license_number ?? null,
          email: data.email,
          role: data.role,
          tenant_uuid: data.tenant_uuid,
          type: data.type || 'user',
          last_logindate: data.last_logindate,
          access: Array.isArray(data.access) ? data.access : []
        }
        this.user = safe
        localStorage.setItem(USER_KEY, JSON.stringify(safe))

        // Hydrate tenant summary + subscription snapshot from the login response
        if (data.tenant) {
          const tenant = useTenantStore()
          tenant.hydrateFromLogin(data.tenant, data.subscription)
          // Refresh the full tenant record so fields missing from the login
          // summary (logo, lab header, address, SMTP flags) can't stay stale
          // from a previous session's localStorage snapshot. Non-fatal: if
          // the fetch fails the user still has a valid token.
          try { await tenant.loadCurrentFromApi() } catch (_) { /* ignore */ }
        }

        // Probe sibling branches once per login and cache the result. The
        // Laboratory dashboard reads `auth.hasBranches` instead of re-calling
        // /lab-report/branches on every mount.
        this.refreshBranches().catch(() => {})
        return { ok: true }
      } catch (e) {
        return { ok: false, message: e?.message || 'Login failed' }
      }
    },

    // Re-fetch the sibling-branch list. Call after login, or explicitly if
    // the owner's tenant assignments change mid-session.
    async refreshBranches() {
      try {
        const rows = await labBranchesApi.listBranches()
        const list = Array.isArray(rows) ? rows : []
        this.branches = list
        localStorage.setItem(BRANCHES_KEY, JSON.stringify(list))
      } catch (_) {
        this.branches = []
        localStorage.setItem(BRANCHES_KEY, '[]')
      }
    },

    async changeMyPassword(oldPassword, newPassword) {
      try {
        await authApi.changeOwnPassword({
          old_password: oldPassword,
          password: newPassword,
          confirm_password: newPassword
        })
        return { ok: true }
      } catch (e) {
        return { ok: false, message: e?.message || 'Password change failed' }
      }
    },

    // ─── Access helpers ───
    // Normalize case + spacing so "User Management" and "user management" match.
    _normAccess(s) { return String(s || '').trim().toLowerCase() },

    // True when the user has ANY granted access row under this main_navigation.
    // Used by the sidebar to decide whether to show the menu at all.
    canOpen(mainNav) {
      if (!mainNav) return true
      const target = this._normAccess(mainNav)
      return this.myAccessRows.some(r => this._normAccess(r.main_navigation) === target)
    },

    // True when the user has the specific sub_navigation under main_navigation.
    // Used to gate individual action buttons (Add User, Edit User, etc.).
    //
    // Wildcard rule: a row with sub_navigation='all-access' grants EVERY
    // sub_navigation under that main_navigation. Otherwise granular grants
    // wouldn't back-compat with tenants that were seeded with only the
    // coarse `all-access` row before the fine-grained rows existed.
    canDo(mainNav, subNav) {
      if (!mainNav || !subNav) return false
      const mn = this._normAccess(mainNav)
      const sn = this._normAccess(subNav)
      return this.myAccessRows.some((r) => {
        if (this._normAccess(r.main_navigation) !== mn) return false
        const rSub = this._normAccess(r.sub_navigation)
        return rSub === sn || rSub === 'all-access'
      })
    },

    // Direct numeric lookup — handy when the code has a stable navigation_id.
    hasAccess(navId) {
      const target = Number(navId)
      return this.myAccessRows.some(r => Number(r.navigation_id) === target)
    },

    logout() {
      // Fire-and-forget presence removal BEFORE we clear the token —
      // otherwise the request goes out unauthenticated and the server
      // can't identify who to remove. Errors are ignored: worst case the
      // entry ages out passively within 2 min.
      if (this.token) {
        try { sendPresenceForget().catch(() => {}) } catch (_) { /* ignore */ }
      }
      this.user = null
      this.token = null
      this.branches = []
      setToken(null)
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
      localStorage.removeItem(BRANCHES_KEY)
      // Clear the forced-expired flag so re-logging in doesn't immediately
      // reshow the gate before the new session's snapshot loads.
      try { useSubscriptionGuardStore().reset() } catch (_) {}
      // Drop the tenant brand color immediately — MainLayout.onBeforeUnmount
      // also calls this, but logout usually races the route transition and
      // the login screen can briefly flash the previous tenant's palette
      // if we wait for unmount. Also wipe the whole tenant snapshot so the
      // next login (possibly a different tenant on the same browser) can't
      // inherit the previous tenant's logo / lab header / SMTP from the
      // persisted `pos_tenant` blob.
      try {
        clearTenantTheme()
        const t = useTenantStore()
        t.clearForLogout()
      } catch (_) { /* ignore — tenant/theme reset is non-critical */ }
    },

    // Supervisor re-auth for sensitive actions (voids, discount overrides).
    // Doesn't touch the caller's session — the API just tells us whether the
    // passed credentials belong to an active admin/manager of the same tenant.
    async verifyManager(username, password) {
      try {
        const data = await authApi.verifyManager(username, password)
        return { ok: true, user: data }
      } catch (e) {
        return { ok: false, message: e?.message || 'Verification failed' }
      }
    }
  }
})
