import { defineStore } from 'pinia'
import * as api from '../api/laboratory'
import {
  assertOnline,
  getDb,
  mirrorRows,
  paginate,
  shouldRouteThroughOfflineStack,
} from '../offline/storeSupport.js'
import { enqueue } from '../offline/outbox.js'
import { useOfflineStore } from './offline.js'

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
    localStorage.setItem(FILTERS_KEY, JSON.stringify(filters || {}))
  } catch (_) { /* quota / private mode — non-fatal */ }
}

// Apply an updateResults payload onto a full-detail lab report snapshot.
// Mirrors the server-side patch semantics so the UI's optimistic view of
// the row matches what will land after sync.
function applyResultsPatchToDetail(detail, payload) {
  if (!detail || !payload) return detail
  const next = { ...detail }
  if (payload.remarks !== undefined) next.remarks = payload.remarks ?? null
  if (Object.prototype.hasOwnProperty.call(payload, 'specimen_collected_at')) {
    next.specimen_collected_at = payload.specimen_collected_at ?? null
  }
  if (Array.isArray(payload.items) && Array.isArray(next.items)) {
    const itemsByUuid = new Map(next.items.map((it) => [it.uuid, it]))
    for (const block of payload.items) {
      const target = itemsByUuid.get(block.lab_report_item_uuid)
      if (!target) continue
      if (target.result_type === 'narrative' || target.result_type === 'culture') {
        target.narrative_text = block.narrative_text ?? null
      } else if (Array.isArray(block.values) && Array.isArray(target.values)) {
        const valuesByUuid = new Map(target.values.map((v) => [v.uuid, v]))
        for (const row of block.values) {
          if (!row.uuid) continue
          const vt = valuesByUuid.get(row.uuid)
          if (!vt) continue
          vt.value_text    = row.value_text    ?? null
          vt.value_numeric = row.value_numeric ?? null
          vt.flag          = row.flag          ?? null
        }
      }
    }
  }
  next.updated_at = new Date().toISOString()
  return next
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
        const pageParams = {
          page_number: overrides.page_number ?? 0,
          page_size:   overrides.page_size ?? 0,
        }

        if (shouldRouteThroughOfflineStack()) {
          const db = getDb()
          let rows = await db.table('lab_reports').toArray()
          if (merged.item_group_uuid)    rows = rows.filter((r) => r.item_group_uuid === merged.item_group_uuid)
          if (merged.item_category_uuid) rows = rows.filter((r) => r.item_category_uuid === merged.item_category_uuid)
          if (merged.status?.length)     rows = rows.filter((r) => merged.status.includes(r.status))
          if (merged.date_from) rows = rows.filter((r) => (r.created_at || '') >= merged.date_from)
          if (merged.date_to)   rows = rows.filter((r) => (r.created_at || '') <= `${merged.date_to} 23:59:59`)

          const res = paginate(rows, {
            ...pageParams,
            keywords: merged.keywords,
            matchFn: (r, kw) => (
              String(r.lab_number || '').toLowerCase().includes(kw) ||
              String(r.item_category_name || '').toLowerCase().includes(kw)
            ),
          })
          this.items      = res.results
          this.total      = res.total
          this.pageNumber = res.page_number
          this.pageSize   = res.page_size
          return res
        }

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
          ...pageParams,
        })
        this.items      = Array.isArray(res?.results) ? res.results : []
        this.total      = res?.total || this.items.length
        this.pageNumber = res?.page_number || 0
        this.pageSize   = res?.page_size || 0
        // Mirror lean rows (list view doesn't carry items[]).
        await mirrorRows('lab_reports', this.items.map(({ items: _its, ...rest }) => rest))
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
        // Offline path — serve the full-detail snapshot cached from a prior
        // online view. Without a cached detail there's no items[] structure
        // to render, so we surface a clear error rather than a blank editor.
        if (shouldRouteThroughOfflineStack()) {
          const db = getDb()
          const cached = await db.table('lab_report_details').get(uuid)
          if (!cached) {
            const err = new Error('This lab report has not been opened while online yet — open it once with internet to enable offline result entry.')
            err.code = 'OFFLINE_DETAIL_MISSING'
            throw err
          }
          this.current = cached
          return cached
        }

        const row = await api.viewLabReport(uuid)
        this.current = row || null
        // Cache the full detail so the tech can enter values against it
        // once the branch drops offline later in the day.
        if (row?.uuid) {
          try {
            const db = getDb()
            await db.table('lab_report_details').put({ ...row, updated_at: new Date().toISOString() })
          } catch (_) { /* offline not enabled here — ignore */ }
        }
        return row
      } finally {
        this.currentLoading = false
      }
    },
    clearCurrent() { this.current = null },

    async createBatch(payload) {
      // Creating lab reports from a finalized requisition touches multiple
      // domain services (test-items lookup, item-group config, lab-number
      // sequence). Not supported offline in v1.
      assertOnline('create a lab report batch')
      const created = await api.createLabReportBatch(payload)
      return created || []
    },

    async saveResults(uuid, payload) {
      if (shouldRouteThroughOfflineStack()) {
        // Offline result entry — enqueue the updateResults payload and
        // apply it optimistically to the cached detail so the editor
        // reflects the save immediately.
        const db = getDb()
        await enqueue(db, {
          entity_type: 'lab_report_results',
          client_uuid: uuid,          // dispatcher treats this as the target report uuid
          payload,
        })
        const cached = await db.table('lab_report_details').get(uuid)
        const nextDetail = applyResultsPatchToDetail(cached, payload)
        if (nextDetail) await db.table('lab_report_details').put(nextDetail)
        this.current = nextDetail || this.current
        try { await useOfflineStore().refreshCounts() } catch (_) {}
        return nextDetail || this.current
      }

      const updated = await api.updateLabReportResults(uuid, payload)
      if (updated) {
        this.current = updated
        try {
          const db = getDb()
          await db.table('lab_report_details').put({ ...updated, updated_at: new Date().toISOString() })
        } catch (_) { /* offline not enabled */ }
      }
      const idx = this.items.findIndex(r => r.uuid === uuid)
      if (idx >= 0 && updated) this.items[idx] = { ...this.items[idx], ...updated }
      return updated
    },

    async setFinal(uuid, payload) {
      assertOnline('finalize a lab report')
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
      assertOnline('un-finalize a lab report')
      const updated = await api.unsetLabReportFinal(uuid)
      const idx = this.items.findIndex(r => r.uuid === uuid)
      if (idx >= 0 && updated) this.items[idx] = { ...this.items[idx], ...updated }
      if (this.current?.uuid === uuid && updated) this.current = { ...this.current, ...updated }
      return updated
    },

    async voidReport(uuid, reason) {
      assertOnline('void a lab report')
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
