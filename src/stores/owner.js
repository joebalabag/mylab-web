import { defineStore } from 'pinia'
import { setToken } from '../api/client'
import * as ownerAuthApi from '../api/ownerAuth'

const SESSION_KEY = 'pos_owner_user'
const TOKEN_KEY   = 'pos_owner_token'

// Rehydrate the Bearer header on refresh so owner-only endpoints work
// after a browser reload without re-login.
const SAVED_OWNER_TOKEN = localStorage.getItem(TOKEN_KEY)
if (SAVED_OWNER_TOKEN) setToken(SAVED_OWNER_TOKEN)

// Phase 2 Pinia store for the Owner app. Mirrors useSuperAdminStore in
// shape so the login/layout/sidebar code can stay familiar. While USE_MOCKS
// is true, login() matches credentials against MOCK_OWNER_CREDENTIALS and
// issues a fake token — the backend endpoint (/auth/owner/login) gets wired
// in Phase 2 step 2.10.

export const useOwnerStore = defineStore('owner', {
  state: () => ({
    session: JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'),
    token:   localStorage.getItem(TOKEN_KEY) || null
  }),
  getters: {
    isAuthenticated: (s) => !!s.token && !!s.session,
    currentUser:     (s) => s.session,
    ownerUuid:       (s) => s.session?.uuid || ''
  },
  actions: {
    async login(usernameOrEmail, password) {
      try {
        const data = await ownerAuthApi.ownerLogin(usernameOrEmail, password)
        if (!data?.access_token) return { ok: false, message: 'Login response missing token' }
        this.token = data.access_token
        setToken(this.token)
        localStorage.setItem(TOKEN_KEY, this.token)

        const safe = {
          uuid: data.uuid,
          username: data.username,
          name: data.name,
          business_name: data.business_name,
          email: data.email,
          phone: data.phone,
          logo_url: data.logo_url || null,
          type: data.type || 'owner',
          last_logindate: data.last_logindate,
        }
        this.session = safe
        localStorage.setItem(SESSION_KEY, JSON.stringify(safe))
        return { ok: true }
      } catch (e) {
        return { ok: false, message: e?.message || 'Login failed' }
      }
    },
    logout() {
      this.session = null
      this.token = null
      setToken(null)
      localStorage.removeItem(SESSION_KEY)
      localStorage.removeItem(TOKEN_KEY)
    },

    // Writes profile fields (name, business_name, email, phone) via
    // PATCH /owner/me and keeps the local session mirror in sync.
    async updateMyProfile(patch) {
      try {
        const updated = await ownerAuthApi.updateMyProfile(patch)
        const next = { ...this.session, ...patch, ...(updated || {}) }
        this.session = next
        localStorage.setItem(SESSION_KEY, JSON.stringify(next))
        return { ok: true }
      } catch (e) {
        return { ok: false, message: e?.message || 'Profile update failed' }
      }
    },

    // Logo lives on the owner record itself (owners.logo_url). The
    // self-service flow uploads a file via multipart; passing logo_url: null
    // takes the "clear" path. Callers from Settings keep calling
    // updateMyProfile({ logo_url: ... }) to preserve the previous mock API
    // shape, and we route between the two endpoints here.
    async updateMyLogo(fileOrNull) {
      try {
        const updated = fileOrNull
          ? await ownerAuthApi.uploadMyLogo(fileOrNull)
          : await ownerAuthApi.clearMyLogo()
        const next = { ...this.session, logo_url: updated?.logo_url || null }
        this.session = next
        localStorage.setItem(SESSION_KEY, JSON.stringify(next))
        return { ok: true, logo_url: next.logo_url }
      } catch (e) {
        return { ok: false, message: e?.message || 'Logo update failed' }
      }
    },

    async changeMyPassword(oldPassword, newPassword) {
      try {
        await ownerAuthApi.changeMyPassword(oldPassword, newPassword)
        return { ok: true }
      } catch (e) {
        return { ok: false, message: e?.message || 'Password change failed' }
      }
    },
  }
})
