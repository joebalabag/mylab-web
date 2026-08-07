import { defineStore } from 'pinia'
import * as api from '../api/itemGroups'

const emptyFilters = () => ({
  tenant_uuid: '',
  keywords: '',
  status: []       // ['active','inactive']
})

export const useItemGroupsStore = defineStore('itemGroups', {
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
    activeItems: (s) => s.items.filter(g => g.status === 'active'),
    byUuid:      (s) => (uuid) => s.items.find(g => g.uuid === uuid) || null
  },
  actions: {
    async fetch(overrides = {}) {
      this.loading = true
      this.error = null
      try {
        const merged = { ...this.filters, ...overrides }
        const res = await api.listItemGroups({
          tenant_uuid: merged.tenant_uuid || undefined,
          keywords:    merged.keywords    || undefined,
          status:      merged.status?.length ? merged.status : undefined,
          page_number: overrides.page_number ?? 0,
          page_size:   overrides.page_size ?? 0
        })
        this.items      = Array.isArray(res?.results) ? res.results : []
        this.total      = res?.total || this.items.length
        this.pageNumber = res?.page_number || 0
        this.pageSize   = res?.page_size || 0
        return res
      } catch (e) {
        this.error = e?.message || 'Failed to load item groups'
        throw e
      } finally {
        this.loading = false
      }
    },

    async create(payload) {
      const created = await api.createItemGroup(payload)
      if (created?.uuid) {
        this.items.unshift(created)
        this.total += 1
      }
      return created
    },

    async update(uuid, payload) {
      const updated = await api.updateItemGroup(uuid, payload)
      if (updated?.uuid) {
        const idx = this.items.findIndex(g => g.uuid === uuid)
        if (idx >= 0) this.items[idx] = { ...this.items[idx], ...updated }
      }
      return updated
    },

    async remove(uuid) {
      await api.deleteItemGroup(uuid)
      const before = this.items.length
      this.items = this.items.filter(g => g.uuid !== uuid)
      if (this.items.length < before) this.total = Math.max(0, this.total - 1)
    },

    async setStatus(uuid, status) {
      const updated = await api.setItemGroupStatus(uuid, status)
      if (updated?.uuid) {
        const idx = this.items.findIndex(g => g.uuid === uuid)
        if (idx >= 0) this.items[idx] = { ...this.items[idx], ...updated }
      }
      return updated
    },

    setFilters(patch) { this.filters = { ...this.filters, ...patch } },
    resetFilters()    { this.filters = emptyFilters() }
  }
})
