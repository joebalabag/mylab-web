import { defineStore } from 'pinia'
import * as api from '../api/doctors'

const emptyFilters = () => ({
  tenant_uuid: '',
  specialty: '',
  keywords: '',
  status: []
})

export const useDoctorsStore = defineStore('doctors', {
  state: () => ({
    items: [],
    total: 0,
    filters: emptyFilters(),
    loading: false,
    error: null
  }),
  getters: {
    activeItems: (s) => s.items.filter((d) => d.status === 'active')
  },
  actions: {
    async fetch(overrides = {}) {
      this.loading = true
      this.error = null
      try {
        const merged = { ...this.filters, ...overrides }
        const res = await api.listDoctors({
          tenant_uuid: merged.tenant_uuid || undefined,
          specialty:   merged.specialty   || undefined,
          keywords:    merged.keywords    || undefined,
          status:      merged.status?.length ? merged.status : undefined,
          page_number: overrides.page_number ?? 0,
          page_size:   overrides.page_size   ?? 0
        })
        this.items = Array.isArray(res?.results) ? res.results : []
        this.total = res?.total || this.items.length
        return res
      } catch (e) {
        this.error = e?.message || 'Failed to load doctors'
        throw e
      } finally {
        this.loading = false
      }
    },
    async create(payload, file) {
      const created = await api.createDoctor(payload, file)
      if (created?.uuid) {
        this.items = [...this.items, created].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        this.total += 1
      }
      return created
    },
    async update(uuid, payload, file) {
      const updated = await api.updateDoctor(uuid, payload, file)
      if (updated?.uuid) {
        const idx = this.items.findIndex((d) => d.uuid === uuid)
        if (idx >= 0) this.items[idx] = { ...this.items[idx], ...updated }
      }
      return updated
    },
    async remove(uuid) {
      await api.deleteDoctor(uuid)
      const before = this.items.length
      this.items = this.items.filter((d) => d.uuid !== uuid)
      if (this.items.length < before) this.total = Math.max(0, this.total - 1)
    },
    async setStatus(uuid, status) {
      const updated = await api.setDoctorStatus(uuid, status)
      if (updated?.uuid) {
        const idx = this.items.findIndex((d) => d.uuid === uuid)
        if (idx >= 0) this.items[idx] = { ...this.items[idx], ...updated }
      }
      return updated
    },
    setFilters(patch) { this.filters = { ...this.filters, ...patch } },
    resetFilters()    { this.filters = emptyFilters() }
  }
})
