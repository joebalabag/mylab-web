import { defineStore } from 'pinia'
import { setToken } from '../api/client'
import * as authApi from '../api/auth'
import * as adminApi from '../api/adminUsers'

const SESSION_KEY = 'pos_super_user'
const TOKEN_KEY   = 'pos_super_token'
const USERS_KEY   = 'pos_super_admins'

// If a super-admin token was saved, activate it on the API client immediately so
// admin-scoped API calls from the super console include the Bearer header. The
// staff login can override this later; sessions don't coexist by design.
const SAVED_SUPER_TOKEN = localStorage.getItem(TOKEN_KEY)
if (SAVED_SUPER_TOKEN) setToken(SAVED_SUPER_TOKEN)

const SEED_USERS = [
  {
    id: 1,
    username: 'superadmin',
    password: 'super123',
    name: 'Platform Owner',
    email: 'owner@platform.local',
    role: 'SuperAdmin',
    active: true,
    createdAt: '2026-01-01'
  },
  {
    id: 2,
    username: 'support',
    password: 'support1',
    name: 'Support Lead',
    email: 'support@platform.local',
    role: 'Support',
    active: true,
    createdAt: '2026-02-15'
  }
]

function loadUsers() {
  try {
    const stored = JSON.parse(localStorage.getItem(USERS_KEY) || 'null')
    if (Array.isArray(stored) && stored.length) return stored
  } catch (_) { /* ignore */ }
  return SEED_USERS.map(u => ({ ...u }))
}
function persistUsers(items) {
  localStorage.setItem(USERS_KEY, JSON.stringify(items))
}

let nextId = (() => loadUsers().reduce((m, u) => Math.max(m, u.id || 0), 0) + 1)()

export const useSuperAdminStore = defineStore('superAdmin', {
  state: () => ({
    session: JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'),
    token: localStorage.getItem(TOKEN_KEY) || null,
    items: loadUsers()
  }),
  getters: {
    isAuthenticated: (s) => !!s.token && !!s.session,
    currentUser: (s) => s.session,
    activeCount: (s) => s.items.filter(u => (u.status ? u.status === 'active' : u.active)).length
  },
  actions: {
    async login(username, password) {
      try {
        const data = await authApi.adminLogin(username, password)
        if (!data?.access_token) {
          return { ok: false, message: 'Login response missing token' }
        }
        this.token = data.access_token
        setToken(this.token)
        localStorage.setItem(TOKEN_KEY, this.token)

        const safe = {
          uuid: data.uuid,
          username: data.username,
          name: data.name,
          email: data.email,
          role: data.role,
          type: data.type || 'admin',
          last_logindate: data.last_logindate
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
    async changeMyPassword(oldPassword, newPassword) {
      try {
        await authApi.changeOwnAdminPassword({
          old_password: oldPassword,
          password: newPassword,
          confirm_password: newPassword
        })
        return { ok: true }
      } catch (e) {
        return { ok: false, message: e?.message || 'Password change failed' }
      }
    },
    add(payload) {
      const now = new Date().toISOString().slice(0, 10)
      const user = {
        id: nextId++,
        username: (payload.username || '').trim(),
        password: payload.password || 'changeme',
        name: (payload.name || '').trim(),
        email: (payload.email || '').trim(),
        role: payload.role || 'SuperAdmin',
        active: payload.active !== false,
        createdAt: now
      }
      this.items.unshift(user)
      persistUsers(this.items)
      return user
    },
    update(id, patch) {
      const u = this.items.find(x => x.id === id)
      if (!u) return false
      const clean = { ...patch }
      // don't clear password on edit if blank
      if (!clean.password) delete clean.password
      Object.assign(u, clean)
      persistUsers(this.items)
      // keep session in sync if editing the logged-in super admin
      if (this.session && this.session.id === u.id) {
        const { password: _p, ...safe } = u
        this.session = safe
        localStorage.setItem(SESSION_KEY, JSON.stringify(safe))
      }
      return true
    },
    setActive(id, active) {
      const u = this.items.find(x => x.id === id)
      if (!u) return false
      u.active = !!active
      persistUsers(this.items)
      if (!u.active && this.session?.id === u.id) this.logout()
      return true
    },
    setPassword(id, password) {
      const u = this.items.find(x => x.id === id)
      if (!u) return false
      u.password = password
      u.passwordChangedAt = new Date().toISOString().slice(0, 10)
      persistUsers(this.items)
      return true
    },
    remove(id) {
      if (this.session?.id === id) return false
      const idx = this.items.findIndex(u => u.id === id)
      if (idx === -1) return false
      this.items.splice(idx, 1)
      persistUsers(this.items)
      return true
    },

    /* ─── API-driven super admin CRUD ─── */
    async fetchAllFromApi(filters = {}) {
      const res = await adminApi.listAdmins(filters)
      const items = Array.isArray(res?.results) ? res.results : []
      this.items = items
      persistUsers(this.items)
      return res
    },
    async createViaApi(payload) {
      const created = await adminApi.createAdmin(payload)
      if (created?.uuid) {
        this.items.unshift(created)
        persistUsers(this.items)
      }
      return created
    },
    async updateViaApi(uuid, payload) {
      const updated = await adminApi.updateAdmin(uuid, payload)
      if (updated?.uuid) {
        const idx = this.items.findIndex(u => u.uuid === uuid)
        if (idx >= 0) this.items[idx] = { ...this.items[idx], ...updated }
        else this.items.push(updated)
        persistUsers(this.items)
        if (this.session?.uuid === uuid) {
          const safe = {
            uuid: updated.uuid,
            username: updated.username,
            name: updated.name,
            email: updated.email,
            role: updated.role,
            type: updated.type || 'admin',
            last_logindate: updated.last_logindate ?? this.session.last_logindate
          }
          this.session = safe
          localStorage.setItem(SESSION_KEY, JSON.stringify(safe))
        }
      }
      return updated
    },
    async setStatusViaApi(uuid, status) {
      const updated = await adminApi.setAdminStatus(uuid, status)
      if (updated?.uuid) {
        const idx = this.items.findIndex(u => u.uuid === uuid)
        if (idx >= 0) this.items[idx] = { ...this.items[idx], ...updated }
        persistUsers(this.items)
      }
      if (status !== 'active' && this.session?.uuid === uuid) this.logout()
      return updated
    },
    async resetPasswordViaApi(uuid, password, confirm_password) {
      return adminApi.changeAdminPassword(uuid, password, confirm_password)
    },
    async removeViaApi(uuid) {
      if (this.session?.uuid === uuid) throw new Error('Cannot delete your own account')
      await adminApi.deleteAdmin(uuid)
      this.items = this.items.filter(u => u.uuid !== uuid)
      persistUsers(this.items)
    }
  }
})
