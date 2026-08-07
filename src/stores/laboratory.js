import { defineStore } from 'pinia'
import * as api from '../api/laboratory'

const emptyFilters = () => ({
  tenant_uuid: '',
  item_group_uuid: '',
  item_category_uuid: '',
  keywords: '',
  status: [],           // ['draft','finalized','voided']
  date_from: '',
  date_to: ''
})

// localStorage persistence for the dashboard filter set so a browser refresh
// (or reopening the tab) restores whatever the user last had applied. Bad or
// missing JSON falls silently back to empty defaults.
const FILTERS_KEY = 'laboratory.filters.v1'
function loadPersistedFilters() {
  try {
    const raw = localStorage.getItem(FILTERS_KEY)
    if (!raw) return emptyFilters()
    const parsed = JSON.parse(raw)
    return { ...emptyFilters(), ...(parsed && typeof parsed === 'object' ? parsed : {}) }
  } catch (_) {
    return emptyFilters()
  }
}
function savePersistedFilters(filters) {
  try {
    // Tenant/current-user context lives outside the filter object, so what
    // we persist is safe to restore for the same user across sessions.
    localStorage.setItem(FILTERS_KEY, JSON.stringify(filters || {}))
  } catch (_) { /* quota / private mode — non-fatal */ }
}

export const useLaboratoryStore = defineStore('laboratory', {
  state: () => ({
    items: [],
    total: 0,
    pageNumber: 0,
    pageSize: 0,
    filters: loadPersistedFilters(),
    loading: false,
    error: null,

    // Current focused report (view / edit / print). Populated by fetchOne so
    // the same object drives the details modal, the editor, and the print
    // preview without re-fetching between them.
    current: null,
    currentLoading: false
  }),
  getters: {
    byUuid: (s) => (uuid) => s.items.find(r => r.uuid === uuid) || null
  },
  actions: {
    async fetch(overrides = {}) {
      this.loading = true
      this.error = null
      try {
        const merged = { ...this.filters, ...overrides }
        const res = await api.listLabReports({
          tenant_uuid:              merged.tenant_uuid              || undefined,
          patient_uuid:             merged.patient_uuid             || undefined,
          patient_requisition_uuid: merged.patient_requisition_uuid || undefined,
          item_group_uuid:          merged.item_group_uuid          || undefined,
          item_category_uuid:       merged.item_category_uuid       || undefined,
          keywords:                 merged.keywords                 || undefined,
          status:                   merged.status?.length ? merged.status : undefined,
          date_from:                merged.date_from                || undefined,
          date_to:                  merged.date_to                  || undefined,
          page_number:              overrides.page_number ?? 0,
          page_size:                overrides.page_size ?? 0
        })
        this.items      = Array.isArray(res?.results) ? res.results : []
        this.total      = res?.total || this.items.length
        this.pageNumber = res?.page_number || 0
        this.pageSize   = res?.page_size || 0
        return res
      } catch (e) {
        this.error = e?.message || 'Failed to load lab reports'
        throw e
      } finally {
        this.loading = false
      }
    },

    async fetchOne(uuid) {
      this.currentLoading = true
      try {
        const row = await api.viewLabReport(uuid)
        this.current = row || null
        return row
      } finally {
        this.currentLoading = false
      }
    },
    clearCurrent() { this.current = null },

    async createBatch(payload) {
      const created = await api.createLabReportBatch(payload)
      return created || []
    },

    async saveResults(uuid, payload) {
      const updated = await api.updateLabReportResults(uuid, payload)
      if (updated) this.current = updated
      // Refresh row in list if present.
      const idx = this.items.findIndex(r => r.uuid === uuid)
      if (idx >= 0 && updated) this.items[idx] = { ...this.items[idx], ...updated }
      return updated
    },

    async setFinal(uuid, payload) {
      // `payload` may be a legacy string (pathologist name) for backwards
      // compatibility with older callers, or the shape { pathologist_name?,
      // pathologist_doctor_uuid? } now expected by the API.
      const body = typeof payload === 'string'
        ? { pathologist_name: payload }
        : (payload || {})
      const updated = await api.setLabReportFinal(uuid, body)
      const idx = this.items.findIndex(r => r.uuid === uuid)
      if (idx >= 0 && updated) this.items[idx] = { ...this.items[idx], ...updated }
      if (this.current?.uuid === uuid && updated) this.current = { ...this.current, ...updated }
      return updated
    },

    async unsetFinal(uuid) {
      const updated = await api.unsetLabReportFinal(uuid)
      const idx = this.items.findIndex(r => r.uuid === uuid)
      if (idx >= 0 && updated) this.items[idx] = { ...this.items[idx], ...updated }
      if (this.current?.uuid === uuid && updated) this.current = { ...this.current, ...updated }
      return updated
    },

    async voidReport(uuid, reason) {
      const updated = await api.voidLabReport(uuid, reason)
      const idx = this.items.findIndex(r => r.uuid === uuid)
      if (idx >= 0 && updated) this.items[idx] = { ...this.items[idx], ...updated }
      if (this.current?.uuid === uuid && updated) this.current = { ...this.current, ...updated }
      return updated
    },

    setFilters(patch) {
      this.filters = { ...this.filters, ...patch }
      savePersistedFilters(this.filters)
    },
    resetFilters() {
      this.filters = emptyFilters()
      savePersistedFilters(this.filters)
    }
  }
})
