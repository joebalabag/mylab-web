import { defineStore } from 'pinia'
import * as api from '../api/payments'
import {
  assertOnline,
  getDb,
  mirrorRows,
  paginate,
  queueCreate,
  shouldRouteThroughOfflineStack,
} from '../offline/storeSupport.js'

const emptyFilters = () => ({
  tenant_uuid: '',
  keywords: '',
  payment_method: '',
  status: [],
  date_from: '',
  date_to: ''
})

// Fields the cashier's Create Payment form owns. payment_number, subtotal,
// total, and the discount snapshot are computed server-side on sync from
// the referenced requisition items — offline can't recompute them because
// discount + item pricing rules live in the payment service.
const OFFLINE_CREATE_FIELDS = [
  'patient_case_uuid', 'items', 'discount_uuid', 'discount_open_amount',
  'payment_method', 'amount_tendered', 'channel', 'reference', 'billed_to',
  'notes',
]

function pick(obj, keys) {
  const out = {}
  for (const k of keys) if (obj?.[k] !== undefined) out[k] = obj[k]
  return out
}

// Payment list rows come joined with case + patient identity — replicate
// that shape for offline reads so PaymentsView doesn't have to branch.
async function decorateJoins(db, payments) {
  if (!payments.length) return payments
  const caseUuids = Array.from(new Set(payments.map((p) => p.patient_case_uuid).filter(Boolean)))
  const patientUuids = Array.from(new Set(payments.map((p) => p.patient_uuid).filter(Boolean)))
  const [cases, patients] = await Promise.all([
    db.table('patient_cases').where('uuid').anyOf(caseUuids).toArray(),
    db.table('patients').where('uuid').anyOf(patientUuids).toArray(),
  ])
  const cByUuid = new Map(cases.map((c) => [c.uuid, c]))
  const pByUuid = new Map(patients.map((p) => [p.uuid, p]))
  return payments.map((row) => {
    const c = cByUuid.get(row.patient_case_uuid)
    const p = pByUuid.get(row.patient_uuid)
    return {
      ...row,
      patient_case_number: c?.case_number ?? null,
      patient_case_type:   c?.case_type ?? null,
      patient_number:      p?.patient_number ?? null,
      patient_first_name:  p?.first_name ?? null,
      patient_middle_name: p?.middle_name ?? null,
      patient_last_name:   p?.last_name ?? null,
      patient_suffix:      p?.suffix ?? null,
    }
  })
}

// Compute an optimistic total from the payload items. This is illustrative
// only — the server recomputes on sync using the authoritative requisition
// item pricing, and the final row's `total` is refreshed then. Good enough
// for the receipt draft the cashier hands to the patient while offline.
function estimateTotal(items) {
  if (!Array.isArray(items) || !items.length) return 0
  return items.reduce((sum, it) => sum + Math.max(0, Number(it?.line_total ?? 0) - Number(it?.line_discount_amount ?? 0)), 0)
}

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
        const pageParams = {
          page_number: overrides.page_number ?? 0,
          page_size:   overrides.page_size ?? 0,
        }

        if (shouldRouteThroughOfflineStack()) {
          const db = getDb()
          let rows = await db.table('payments').toArray()
          if (merged.payment_method) rows = rows.filter((r) => r.payment_method === merged.payment_method)
          if (merged.status?.length) rows = rows.filter((r) => merged.status.includes(r.status))
          if (merged.date_from) rows = rows.filter((r) => (r.payment_date || '') >= merged.date_from)
          if (merged.date_to)   rows = rows.filter((r) => (r.payment_date || '') <= `${merged.date_to} 23:59:59`)
          rows = await decorateJoins(db, rows)

          const res = paginate(rows, {
            ...pageParams,
            keywords: merged.keywords,
            matchFn: (r, kw) => (
              String(r.payment_number || '').toLowerCase().includes(kw) ||
              String(r.patient_case_number || '').toLowerCase().includes(kw) ||
              String(r.patient_number || '').toLowerCase().includes(kw) ||
              String(r.patient_first_name || '').toLowerCase().includes(kw) ||
              String(r.patient_last_name || '').toLowerCase().includes(kw) ||
              String(r.reference || '').toLowerCase().includes(kw)
            ),
          })
          this.items      = res.results
          this.total      = res.total
          this.pageNumber = res.page_number
          this.pageSize   = res.page_size
          return res
        }

        const res = await api.listPayments({
          tenant_uuid:    merged.tenant_uuid    || undefined,
          keywords:       merged.keywords       || undefined,
          payment_method: merged.payment_method || undefined,
          status:         merged.status?.length ? merged.status : undefined,
          date_from:      merged.date_from      || undefined,
          date_to:        merged.date_to        || undefined,
          ...pageParams,
        })
        this.items      = Array.isArray(res?.results) ? res.results : []
        this.total      = res?.total || this.items.length
        this.pageNumber = res?.page_number || 0
        this.pageSize   = res?.page_size || 0
        // Strip joined columns before mirroring so Dexie stores payment rows
        // in their raw shape.
        const stripJoins = this.items.map(({
          patient_case_number, patient_case_type,
          patient_number, patient_first_name, patient_middle_name,
          patient_last_name, patient_suffix,
          items: _items, // items array is a server-side detail; not needed for list
          ...rest
        }) => rest)
        await mirrorRows('payments', stripJoins)
        return res
      } catch (e) {
        this.error = e?.message || 'Failed to load payments'
        throw e
      } finally {
        this.loading = false
      }
    },

    async create(payload) {
      if (shouldRouteThroughOfflineStack()) {
        const clean = pick(payload, OFFLINE_CREATE_FIELDS)
        const est = estimateTotal(clean.items)
        const optimistic = await queueCreate({
          table: 'payments',
          entity_type: 'payment',
          payload: clean,
          extraFields: {
            payment_number: null,
            payment_date: new Date().toISOString(),
            subtotal: est,
            total: est,
            status: 'completed',
          },
        })
        const db = getDb()
        const [decorated] = await decorateJoins(db, [optimistic])
        this.items.unshift(decorated)
        this.total += 1
        return decorated
      }

      const created = await api.createPayment(payload)
      if (created?.uuid) {
        this.items.unshift(created)
        this.total += 1
        // Persist server row (minus joins) into the offline cache.
        const { patient_case_number: _pcn, patient_case_type: _pct,
                patient_number: _pn, patient_first_name: _pf,
                patient_middle_name: _pm, patient_last_name: _pl,
                patient_suffix: _ps, items: _its, ...lean } = created
        await mirrorRows('payments', [lean])
      }
      return created
    },

    /**
     * Cashier picker step 1 — cases with at least one unpaid finalized (or
     * partially_paid) requisition item. Server does one joined SQL; offline
     * we rebuild the same shape from four Dexie tables (patient_cases,
     * patient_requisitions, patient_requisition_items, patients).
     */
    async listUnpaidCases({ keywords } = {}) {
      if (shouldRouteThroughOfflineStack()) {
        const db = getDb()
        const [reqs, items, cases, patients] = await Promise.all([
          db.table('patient_requisitions').toArray(),
          db.table('patient_requisition_items').toArray(),
          db.table('patient_cases').toArray(),
          db.table('patients').toArray(),
        ])
        const reqByUuid = new Map(reqs.map((r) => [r.uuid, r]))
        const caseByUuid = new Map(cases.map((c) => [c.uuid, c]))
        const patientByUuid = new Map(patients.map((p) => [p.uuid, p]))

        // Group unpaid items by case, then join in case + patient identity.
        const perCase = new Map()
        for (const it of items) {
          if (it.payment_uuid) continue                             // already paid
          const req = reqByUuid.get(it.patient_requisition_uuid)
          if (!req) continue
          if (!['finalized', 'partially_paid'].includes(req.status)) continue
          const c = caseByUuid.get(req.patient_case_uuid)
          if (!c) continue
          const bucket = perCase.get(c.uuid) || {
            case_uuid: c.uuid,
            case_number: c.case_number,
            case_type: c.case_type,
            admission_date: c.admission_date,
            patient_uuid: c.patient_uuid,
            unpaid_total: 0,
            unpaid_count: 0,
          }
          bucket.unpaid_total += Number(it.line_selling_price ?? it.line_total ?? 0)
          bucket.unpaid_count += 1
          perCase.set(c.uuid, bucket)
        }

        let rows = Array.from(perCase.values()).map((b) => {
          const p = patientByUuid.get(b.patient_uuid) || {}
          return {
            ...b,
            patient_number: p.patient_number ?? null,
            first_name: p.first_name ?? null,
            middle_name: p.middle_name ?? null,
            last_name: p.last_name ?? null,
            suffix: p.suffix ?? null,
            sex: p.sex ?? null,
            birthdate: p.birthdate ?? null,
          }
        })
        if (keywords) {
          const kw = String(keywords).toLowerCase()
          rows = rows.filter((r) => (
            String(r.case_number || '').toLowerCase().includes(kw) ||
            String(r.patient_number || '').toLowerCase().includes(kw) ||
            String(r.first_name || '').toLowerCase().includes(kw) ||
            String(r.last_name || '').toLowerCase().includes(kw)
          ))
        }
        rows.sort((a, b) => String(b.admission_date || '').localeCompare(String(a.admission_date || '')))
        return rows.slice(0, 40)
      }
      return api.listUnpaidCases({ keywords })
    },

    /**
     * Cashier picker step 2 — the individual unpaid items for a case,
     * grouped in the same shape the server returns (pri.* + req headers).
     */
    async listUnpaidItems(patient_case_uuid) {
      if (shouldRouteThroughOfflineStack()) {
        const db = getDb()
        const [reqs, items] = await Promise.all([
          db.table('patient_requisitions').where('patient_case_uuid').equals(patient_case_uuid).toArray(),
          db.table('patient_requisition_items').toArray(),
        ])
        const reqByUuid = new Map(reqs.map((r) => [r.uuid, r]))
        const rows = items
          .filter((it) => reqByUuid.has(it.patient_requisition_uuid) && !it.payment_uuid)
          .filter((it) => ['finalized', 'partially_paid'].includes(reqByUuid.get(it.patient_requisition_uuid).status))
          .map((it) => {
            const r = reqByUuid.get(it.patient_requisition_uuid)
            return {
              ...it,
              requisition_number: r.requisition_number,
              requisition_date: r.requisition_date,
              requisition_status: r.status,
            }
          })
        rows.sort((a, b) => {
          const c = String(a.requisition_date || '').localeCompare(String(b.requisition_date || ''))
          return c !== 0 ? c : Number(a.display_order || 0) - Number(b.display_order || 0)
        })
        return rows
      }
      return api.listUnpaidItems(patient_case_uuid)
    },

    async voidPayment(uuid) {
      // Voiding a payment touches the linked requisition items' paid flags —
      // that's a server-side transaction that can't be replayed offline.
      assertOnline('void a payment')
      const updated = await api.voidPayment(uuid)
      if (updated?.uuid) {
        const idx = this.items.findIndex(p => p.uuid === uuid)
        if (idx >= 0) this.items[idx] = { ...this.items[idx], ...updated }
        await mirrorRows('payments', [updated])
      }
      return updated
    },

    setFilters(patch) { this.filters = { ...this.filters, ...patch } },
    resetFilters()    { this.filters = emptyFilters() }
  }
})
