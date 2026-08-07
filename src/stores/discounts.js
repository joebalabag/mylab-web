import { defineStore } from 'pinia'
import * as api from '../api/discounts'

const emptyFilters = () => ({
  tenant_uuid: '',
  keywords: '',
  discount_type: '',
  status: []       // ['active','inactive']
})

export const useDiscountsStore = defineStore('discounts', {
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
    activeItems: (s) => s.items.filter(d => d.status === 'active'),
    byUuid:      (s) => (uuid) => s.items.find(d => d.uuid === uuid) || null,
    byCode:      (s) => (code) => s.items.find(d => d.code === code) || null
  },
  actions: {
    async fetch(overrides = {}) {
      this.loading = true
      this.error = null
      try {
        const merged = { ...this.filters, ...overrides }
        const query = {
          tenant_uuid:   merged.tenant_uuid   || undefined,
          keywords:      merged.keywords      || undefined,
          discount_type: merged.discount_type || undefined,
          status:        merged.status?.length ? merged.status : undefined,
          page_number:   overrides.page_number ?? 0,
          page_size:     overrides.page_size ?? 0
        }
        const res = await api.listDiscounts(query)
        this.items      = Array.isArray(res?.results) ? res.results : []
        this.total      = res?.total || this.items.length
        this.pageNumber = res?.page_number || 0
        this.pageSize   = res?.page_size || 0
        return res
      } catch (e) {
        this.error = e?.message || 'Failed to load discounts'
        throw e
      } finally {
        this.loading = false
      }
    },

    async create(payload) {
      const created = await api.createDiscount(payload)
      if (created?.uuid) {
        this.items.unshift(created)
        this.total += 1
      }
      return created
    },

    async update(uuid, payload) {
      const updated = await api.updateDiscount(uuid, payload)
      if (updated?.uuid) {
        const idx = this.items.findIndex(d => d.uuid === uuid)
        if (idx >= 0) this.items[idx] = { ...this.items[idx], ...updated }
      }
      return updated
    },

    async remove(uuid) {
      await api.deleteDiscount(uuid)
      const before = this.items.length
      this.items = this.items.filter(d => d.uuid !== uuid)
      if (this.items.length < before) this.total = Math.max(0, this.total - 1)
    },

    async setStatus(uuid, status) {
      const updated = await api.setDiscountStatus(uuid, status)
      if (updated?.uuid) {
        const idx = this.items.findIndex(d => d.uuid === uuid)
        if (idx >= 0) this.items[idx] = { ...this.items[idx], ...updated }
      }
      return updated
    },

    setFilters(patch) { this.filters = { ...this.filters, ...patch } },
    resetFilters()    { this.filters = emptyFilters() }
  }
})
