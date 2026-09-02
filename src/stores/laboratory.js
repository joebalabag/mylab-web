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
import { newUuid } from '../offline/uuid.js'
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

    /**
     * Step 1 of Add-Laboratory — paid requisitions with uncovered test items.
     * Offline branch rebuilds a lenient version of the server's joined query
     * from Dexie: paid requisitions with at least one paid test_item line,
     * minus items we can see are already covered by a lab_report. Coverage
     * data isn't cached exhaustively so a locally-created lab_report may
     * still appear here until sync — server-side createBatch rejects double
     * coverage, so worst case is an on-sync error the sync panel surfaces.
     */
    async listEligibleRequisitions(keywords, opts = {}) {
      if (shouldRouteThroughOfflineStack()) {
        const db = getDb()
        const [reqs, items, testItems, categories, patients, cases, reports] = await Promise.all([
          db.table('patient_requisitions').toArray(),
          db.table('patient_requisition_items').toArray(),
          db.table('test_items').toArray(),
          db.table('item_categories').toArray(),
          db.table('patients').toArray(),
          db.table('patient_cases').toArray(),
          db.table('lab_reports').toArray(),
        ])
        const testItemByUuid = new Map(testItems.map((t) => [t.uuid, t]))
        const categoryByUuid = new Map(categories.map((c) => [c.uuid, c]))
        const patientByUuid = new Map(patients.map((p) => [p.uuid, p]))
        const caseByUuid = new Map(cases.map((c) => [c.uuid, c]))
        // Locally-known coverage: any lab_report shell (pending or server)
        // points at a requisition. Coarse — the server tracks per-item
        // coverage via lab_report_items which we don't cache — but good
        // enough to hide requisitions we've already made batches for.
        const coveredReqUuids = new Set(reports.map((r) => r.patient_requisition_uuid).filter(Boolean))

        const eligibleReqs = reqs.filter((r) => r.status === 'paid' && !coveredReqUuids.has(r.uuid))
        const itemsByReq = new Map()
        for (const it of items) {
          const arr = itemsByReq.get(it.patient_requisition_uuid) || []
          arr.push(it)
          itemsByReq.set(it.patient_requisition_uuid, arr)
        }

        let rows = eligibleReqs.map((r) => {
          const rItems = itemsByReq.get(r.uuid) || []
          const testLines = rItems.filter((it) => it.source_type === 'test_item' && it.payment_uuid)
          if (opts.item_group_uuid) {
            const scoped = testLines.filter((it) => {
              const ti = testItemByUuid.get(it.source_uuid)
              const cat = ti?.item_category_uuid ? categoryByUuid.get(ti.item_category_uuid) : null
              return cat?.item_group_uuid === opts.item_group_uuid
            })
            if (!scoped.length) return null
          }
          if (!testLines.length) return null
          const p = patientByUuid.get(r.patient_uuid) || {}
          const c = caseByUuid.get(r.patient_case_uuid) || {}
          const catNames = Array.from(new Set(testLines.map((it) => {
            const ti = testItemByUuid.get(it.source_uuid)
            const cat = ti?.item_category_uuid ? categoryByUuid.get(ti.item_category_uuid) : null
            return cat?.name
          }).filter(Boolean))).sort().join(', ')
          return {
            patient_requisition_uuid: r.uuid,
            requisition_number: r.requisition_number,
            requisition_date: r.requisition_date,
            requested_by: r.created_by,
            patient_uuid: r.patient_uuid,
            patient_case_uuid: r.patient_case_uuid,
            patient_number: p.patient_number ?? null,
            patient_first_name: p.first_name ?? null,
            patient_last_name: p.last_name ?? null,
            patient_case_number: c.case_number ?? null,
            uncovered_count: testLines.length,
            uncovered_categories: catNames,
            uncovered_items: testLines.map((it) => it.name).join(', '),
          }
        }).filter(Boolean)

        if (keywords) {
          const kw = String(keywords).toLowerCase()
          rows = rows.filter((r) => [
            r.requisition_number, r.patient_number,
            r.patient_first_name, r.patient_last_name, r.patient_case_number,
          ].some((v) => v && String(v).toLowerCase().includes(kw)))
        }
        rows.sort((a, b) => String(b.requisition_date || '').localeCompare(String(a.requisition_date || '')))
        return rows.slice(0, 200)
      }
      return api.listEligibleRequisitions(keywords, opts)
    },

    /**
     * Step 2 — uncovered test items for a specific requisition + category
     * metadata. Offline just returns every paid test item on the requisition
     * with category info attached; the "not-already-covered" check that the
     * server does against lab_report_items isn't replicated (server catches
     * duplicates on sync).
     */
    async listUncoveredItems(patient_requisition_uuid) {
      if (shouldRouteThroughOfflineStack()) {
        const db = getDb()
        const [req, items, testItems, categories] = await Promise.all([
          db.table('patient_requisitions').get(patient_requisition_uuid),
          db.table('patient_requisition_items').where('patient_requisition_uuid').equals(patient_requisition_uuid).toArray(),
          db.table('test_items').toArray(),
          db.table('item_categories').toArray(),
        ])
        if (!req) {
          const err = new Error('Requisition not found in offline cache.')
          err.code = 'OFFLINE_MISS'
          throw err
        }
        const testItemByUuid = new Map(testItems.map((t) => [t.uuid, t]))
        const categoryByUuid = new Map(categories.map((c) => [c.uuid, c]))
        const shaped = items
          .filter((it) => it.source_type === 'test_item' && it.payment_uuid)
          .map((it) => {
            const ti = testItemByUuid.get(it.source_uuid)
            const cat = ti?.item_category_uuid ? categoryByUuid.get(ti.item_category_uuid) : null
            return {
              ...it,
              test_item_uuid: ti?.uuid ?? null,
              test_item_name: ti?.name ?? it.name,
              item_category_uuid: cat?.uuid ?? null,
              item_category_code: cat?.code ?? null,
              item_category_name: cat?.name ?? null,
              item_category_combine_printout: cat?.combine_printout ?? false,
            }
          })
        return { requisition: req, items: shaped }
      }
      return api.listUncoveredItems(patient_requisition_uuid)
    },

    async createBatch(payload) {
      // Offline path — pre-generate a client_uuid per group so the local
      // Dexie cache can point at the reports immediately (result entry
      // can proceed without waiting for sync). Server-side createBatch
      // uses the same uuids when it eventually processes the outbox
      // entry, so no post-sync ID remapping is needed.
      if (shouldRouteThroughOfflineStack()) {
        const db = getDb()
        const groups = (payload?.groups || []).map((g) => ({
          ...g,
          client_uuid: g.client_uuid || newUuid(),
        }))
        await enqueue(db, {
          entity_type: 'lab_report_batch',
          // Composite entry — use the requisition's uuid as the entry's
          // client_uuid so the outbox row is easy to correlate; individual
          // report client_uuids live on each group inside the payload.
          client_uuid: payload.patient_requisition_uuid,
          payload: {
            patient_requisition_uuid: payload.patient_requisition_uuid,
            groups,
          },
        })
        // Optimistic Dexie writes so the results list picks them up right
        // away. lab_number is server-generated; keep it null with a
        // __pending flag so the UI can mark them as unsynced.
        const now = new Date().toISOString()
        const shells = groups.map((g) => ({
          uuid: g.client_uuid,
          client_uuid: g.client_uuid,
          patient_requisition_uuid: payload.patient_requisition_uuid,
          status: 'draft',
          lab_number: null,
          item_category_uuid: g.item_category_uuid ?? null,
          test_items_summary: null,
          remarks: g.remarks ?? null,
          created_offline_at: now,
          created_at: now,
          updated_at: now,
          __pending: true,
        }))
        await db.table('lab_reports').bulkPut(shells)
        try { await useOfflineStore().refreshCounts() } catch (_) {}
        return shells
      }
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
