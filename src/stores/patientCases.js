import { defineStore } from 'pinia'
import * as api from '../api/patientCases'
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
  patient_uuid: '',
  case_type: '',
  keywords: '',
  status: []
})

// Fields the Add-case form collects. case_number stays server-side (it's
// serialized per (tenant, case_type) with an advisory lock).
const OFFLINE_CREATE_FIELDS = [
  'patient_uuid', 'case_type', 'admission_date',
  'chief_complaint', 'attending_physician', 'referring_physician',
  'notes',
]

function pick(obj, keys) {
  const out = {}
  for (const k of keys) if (obj?.[k] !== undefined) out[k] = obj[k]
  return out
}

// The dashboard endpoint returns cases joined with patient identity columns.
// Offline reads have to rebuild the same shape by joining against the local
// patients table so PatientCasesView doesn't have to branch on data source.
async function decoratePatientColumns(db, cases) {
  if (!cases.length) return cases
  const uuids = Array.from(new Set(cases.map((c) => c.patient_uuid).filter(Boolean)))
  const patients = await db.table('patients').where('uuid').anyOf(uuids).toArray()
  const byUuid = new Map(patients.map((p) => [p.uuid, p]))
  return cases.map((c) => {
    const p = byUuid.get(c.patient_uuid)
    if (!p) return c
    return {
      ...c,
      patient_number:      p.patient_number ?? null,
      patient_first_name:  p.first_name ?? null,
      patient_middle_name: p.middle_name ?? null,
      patient_last_name:   p.last_name ?? null,
      patient_suffix:      p.suffix ?? null,
      patient_sex:         p.sex ?? null,
      patient_birthdate:   p.birthdate ?? null,
    }
  })
}

export const usePatientCasesStore = defineStore('patientCases', {
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
    byUuid: (s) => (uuid) => s.items.find(c => c.uuid === uuid) || null
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
          let rows = await db.table('patient_cases').toArray()
          if (merged.patient_uuid) rows = rows.filter((r) => r.patient_uuid === merged.patient_uuid)
          if (merged.case_type)    rows = rows.filter((r) => r.case_type === merged.case_type)
          if (merged.status?.length) rows = rows.filter((r) => merged.status.includes(r.status))
          rows = await decoratePatientColumns(db, rows)

          const res = paginate(rows, {
            ...pageParams,
            keywords: merged.keywords,
            matchFn: (r, kw) => (
              String(r.case_number || '').toLowerCase().includes(kw) ||
              String(r.patient_number || '').toLowerCase().includes(kw) ||
              String(r.patient_first_name || '').toLowerCase().includes(kw) ||
              String(r.patient_last_name || '').toLowerCase().includes(kw) ||
              String(r.chief_complaint || '').toLowerCase().includes(kw)
            ),
          })
          this.items      = res.results
          this.total      = res.total
          this.pageNumber = res.page_number
          this.pageSize   = res.page_size
          return res
        }

        const res = await api.listPatientCases({
          tenant_uuid:  merged.tenant_uuid  || undefined,
          patient_uuid: merged.patient_uuid || undefined,
          case_type:    merged.case_type    || undefined,
          keywords:     merged.keywords     || undefined,
          status:       merged.status?.length ? merged.status : undefined,
          ...pageParams,
        })
        this.items      = Array.isArray(res?.results) ? res.results : []
        this.total      = res?.total || this.items.length
        this.pageNumber = res?.page_number || 0
        this.pageSize   = res?.page_size || 0
        // Mirror lean case rows — strip the join columns to avoid polluting
        // the Dexie schema with patient_* fields the server-side write path
        // doesn't recognize.
        const stripJoins = this.items.map(({
          patient_number, patient_first_name, patient_middle_name,
          patient_last_name, patient_suffix, patient_sex, patient_birthdate,
          ...rest
        }) => rest)
        await mirrorRows('patient_cases', stripJoins)
        return res
      } catch (e) {
        this.error = e?.message || 'Failed to load patient cases'
        throw e
      } finally {
        this.loading = false
      }
    },

    async create(payload) {
      if (shouldRouteThroughOfflineStack()) {
        const clean = pick(payload, OFFLINE_CREATE_FIELDS)
        // patient_uuid may reference a still-pending offline-created patient —
        // the server-side sync dispatcher resolves it either way. Nothing
        // special needed here; the client_uuid we recorded when creating the
        // patient locally IS what lives in `patient_uuid` on this case row.
        const optimistic = await queueCreate({
          table: 'patient_cases',
          entity_type: 'patient_case',
          payload: clean,
          extraFields: {
            case_number: null,
            case_type: clean.case_type || 'OPD',
            status: 'open',
            admission_date: clean.admission_date || new Date().toISOString(),
          },
        })
        // Decorate with local patient identity so PatientCasesView renders
        // the row exactly like the joined server response.
        const db = getDb()
        const [decorated] = await decoratePatientColumns(db, [optimistic])
        this.items.unshift(decorated)
        this.total += 1
        return decorated
      }

      const created = await api.createPatientCase(payload)
      if (created?.uuid) {
        this.items.unshift(created)
        this.total += 1
        await mirrorRows('patient_cases', [created])
      }
      return created
    },

    async update(uuid, payload) {
      assertOnline('edit a patient case')
      const updated = await api.updatePatientCase(uuid, payload)
      if (updated?.uuid) {
        const idx = this.items.findIndex(c => c.uuid === uuid)
        if (idx >= 0) this.items[idx] = { ...this.items[idx], ...updated }
        await mirrorRows('patient_cases', [updated])
      }
      return updated
    },

    async remove(uuid) {
      assertOnline('delete a patient case')
      await api.deletePatientCase(uuid)
      const before = this.items.length
      this.items = this.items.filter(c => c.uuid !== uuid)
      if (this.items.length < before) this.total = Math.max(0, this.total - 1)
    },

    async setStatus(uuid, status) {
      assertOnline('change case status')
      const updated = await api.setPatientCaseStatus(uuid, status)
      if (updated?.uuid) {
        const idx = this.items.findIndex(c => c.uuid === uuid)
        if (idx >= 0) this.items[idx] = { ...this.items[idx], ...updated }
        await mirrorRows('patient_cases', [updated])
      }
      return updated
    },

    setFilters(patch) { this.filters = { ...this.filters, ...patch } },
    resetFilters()    { this.filters = emptyFilters() }
  }
})
