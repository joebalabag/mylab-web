import { defineStore } from 'pinia'
import * as usersApi from '../api/users'

const emptyFilters = () => ({
  tenant_uuid: '',
  keywords: '',
  status: [],    // ['active','inactive']
  role: ''       // client-side only (API doesn't filter by role)
})

export const useUsersStore = defineStore('users', {
  state: () => ({
    items: [],
    total: 0,
    pageNumber: 0,
    pageSize: 0,
    filters: emptyFilters(),
    loading: false,
    error: null
  }),
  getters: {
    usernameSet: (s) =>
      new Set(s.items.map(u => u.username?.toLowerCase()).filter(Boolean)),
    byUuid: (s) => (uuid) => s.items.find(u => u.uuid === uuid) || null,
    // Client-side role filter applied on top of the API results.
    visibleItems: (s) => {
      if (!s.filters.role) return s.items
      return s.items.filter(u => u.role === s.filters.role)
    }
  },
  actions: {
    async fetch(overrides = {}) {
      this.loading = true
      this.error = null
      try {
        const merged = { ...this.filters, ...overrides }
        // NOTE: date_from/date_to intentionally omitted per requirement.
        const query = {
          tenant_uuid: merged.tenant_uuid || undefined,
          keywords: merged.keywords || undefined,
          status: merged.status?.length ? merged.status : undefined,
          page_number: overrides.page_number ?? 0,
          page_size:   overrides.page_size   ?? 0
        }
        const res = await usersApi.listUsers(query)
        this.items      = Array.isArray(res?.results) ? res.results : []
        this.total      = res?.total || this.items.length
        this.pageNumber = res?.page_number || 0
        this.pageSize   = res?.page_size || 0
        return res
      } catch (e) {
        this.error = e?.message || 'Failed to load users'
        throw e
      } finally {
        this.loading = false
      }
    },

    async create(payload) {
      const created = await usersApi.createUser(payload)
      if (created?.uuid) {
        this.items.unshift(created)
        this.total += 1
      }
      return created
    },

    async update(uuid, payload) {
      const updated = await usersApi.updateUser(uuid, payload)
      if (updated?.uuid) {
        const idx = this.items.findIndex(u => u.uuid === uuid)
        if (idx >= 0) this.items[idx] = { ...this.items[idx], ...updated }
      }
      return updated
    },

    async remove(uuid) {
      await usersApi.deleteUser(uuid)
      const before = this.items.length
      this.items = this.items.filter(u => u.uuid !== uuid)
      if (this.items.length < before) this.total = Math.max(0, this.total - 1)
    },

    async setStatus(uuid, status) {
      const updated = await usersApi.setUserStatus(uuid, status)
      if (updated?.uuid) {
        const idx = this.items.findIndex(u => u.uuid === uuid)
        if (idx >= 0) this.items[idx] = { ...this.items[idx], ...updated }
      }
      return updated
    },

    async changePassword(uuid, password, confirm_password) {
      await usersApi.changeUserPassword(uuid, password, confirm_password)
    },

    setFilters(patch) {
      this.filters = { ...this.filters, ...patch }
    },
    resetFilters() {
      this.filters = emptyFilters()
    }
  }
})
