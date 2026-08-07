import { defineStore } from 'pinia'
import * as api from '../api/payments'

const emptyFilters = () => ({
  tenant_uuid: '',
  keywords: '',
  payment_method: '',
  status: [],
  date_from: '',
  date_to: ''
})

export const usePaymentsStore = defineStore('payments', {
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
    byUuid: (s) => (uuid) => s.items.find(p => p.uuid === uuid) || null
  },
  actions: {
    async fetch(overrides = {}) {
      this.loading = true
      this.error = null
      try {
        const merged = { ...this.filters, ...overrides }
        const res = await api.listPayments({
          tenant_uuid:    merged.tenant_uuid    || undefined,
          keywords:       merged.keywords       || undefined,
          payment_method: merged.payment_method || undefined,
          status:         merged.status?.length ? merged.status : undefined,
          date_from:      merged.date_from      || undefined,
          date_to:        merged.date_to        || undefined,
          page_number:    overrides.page_number ?? 0,
          page_size:      overrides.page_size ?? 0
        })
        this.items      = Array.isArray(res?.results) ? res.results : []
        this.total      = res?.total || this.items.length
        this.pageNumber = res?.page_number || 0
        this.pageSize   = res?.page_size || 0
        return res
      } catch (e) {
        this.error = e?.message || 'Failed to load payments'
        throw e
      } finally {
        this.loading = false
      }
    },

    async create(payload) {
      const created = await api.createPayment(payload)
      if (created?.uuid) {
        this.items.unshift(created)
        this.total += 1
      }
      return created
    },

    async voidPayment(uuid) {
      const updated = await api.voidPayment(uuid)
      if (updated?.uuid) {
        const idx = this.items.findIndex(p => p.uuid === uuid)
        if (idx >= 0) this.items[idx] = { ...this.items[idx], ...updated }
      }
      return updated
    },

    setFilters(patch) { this.filters = { ...this.filters, ...patch } },
    resetFilters()    { this.filters = emptyFilters() }
  }
})
