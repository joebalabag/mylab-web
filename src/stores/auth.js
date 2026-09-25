import { defineStore } from 'pinia'
import { setToken } from '../api/client'
import * as authApi from '../api/auth'
import { useTenantStore } from './tenant'
import { useSubscriptionGuardStore } from './subscriptionGuard'

const TOKEN_KEY = 'pos_token'
const USER_KEY  = 'pos_user'

// Boot token into the API client before any request goes out.
setToken(localStorage.getItem(TOKEN_KEY) || null)

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: JSON.parse(localStorage.getItem(USER_KEY) || 'null'),
    token: localStorage.getItem(TOKEN_KEY) || null
  }),
  getters: {
    isAuthenticated: (s) => !!s.token,
    role:            (s) => s.user?.role || null,
    tenantUuid:      (s) => s.user?.tenant_uuid || null,
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
        }
        return { ok: true }
      } catch (e) {
        return { ok: false, message: e?.message || 'Login failed' }
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
      this.user = null
      this.token = null
      setToken(null)
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
      // Clear the forced-expired flag so re-logging in doesn't immediately
      // reshow the gate before the new session's snapshot loads.
      try { useSubscriptionGuardStore().reset() } catch (_) {}
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
