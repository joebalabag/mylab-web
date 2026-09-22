import { defineStore } from 'pinia'
import * as api from '../api/patients'
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
  status: []
})

// Fields the Add-patient form actually collects. Anything the server infers
// (patient_number, timestamps, MRN) stays server-side even on offline creates
// — the online sync path re-generates them via the domain service.
const OFFLINE_CREATE_FIELDS = [
  'first_name', 'middle_name', 'last_name', 'suffix',
  'sex', 'birthdate', 'civil_status', 'nationality',
  'contact_number', 'email',
  'address_street1', 'address_street2', 'city', 'province', 'postal_code', 'country',
  'blood_type', 'allergies', 'notes',
  'senior_citizen_number', 'pwd_number', 'national_id',
  'emergency_contact_name', 'emergency_contact_relation', 'emergency_contact_number',
  'philhealth_number', 'company', 'referring_physician', 'occupation',
]

function pick(obj, keys) {
  const out = {}
  for (const k of keys) if (obj?.[k] !== undefined) out[k] = obj[k]
  return out
}

export const usePatientsStore = defineStore('patients', {
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
    activeItems: (s) => s.items.filter(p => p.status === 'active'),
    byUuid:      (s) => (uuid) => s.items.find(p => p.uuid === uuid) || null
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

        // Offline branch — Dexie snapshot with client-side filter + paginate.
        if (shouldRouteThroughOfflineStack()) {
          const db = getDb()
          const rows = await db.table('patients').toArray()
          const res = paginate(rows, {
            ...pageParams,
            keywords: merged.keywords,
            matchFn: (r, kw) => (
              String(r.patient_number || '').toLowerCase().includes(kw) ||
              String(r.first_name || '').toLowerCase().includes(kw) ||
              String(r.middle_name || '').toLowerCase().includes(kw) ||
              String(r.last_name || '').toLowerCase().includes(kw) ||
              String(r.contact_number || '').toLowerCase().includes(kw) ||
              String(r.national_id || '').toLowerCase().includes(kw)
            ),
          })
          this.items      = res.results
          this.total      = res.total
          this.pageNumber = res.page_number
          this.pageSize   = res.page_size
          return res
        }

        // Online path — API is authoritative, mirror the result into Dexie
        // so a future offline session sees a fresh snapshot.
        const res = await api.listPatients({
          tenant_uuid: merged.tenant_uuid || undefined,
          keywords:    merged.keywords    || undefined,
          status:      merged.status?.length ? merged.status : undefined,
          ...pageParams,
        })
        this.items      = Array.isArray(res?.results) ? res.results : []
        this.total      = res?.total || this.items.length
        this.pageNumber = res?.page_number || 0
        this.pageSize   = res?.page_size || 0
        await mirrorRows('patients', this.items)
        return res
      } catch (e) {
        this.error = e?.message || 'Failed to load patients'
        throw e
      } finally {
        this.loading = false
      }
    },

    async create(payload) {
      if (shouldRouteThroughOfflineStack()) {
        // Offline: outbox + optimistic local row. patient_number stays null
        // until sync — the UI shows "pending" for those rows.
        const clean = pick(payload, OFFLINE_CREATE_FIELDS)
        const optimistic = await queueCreate({
          table: 'patients',
          entity_type: 'patient',
          payload: clean,
          extraFields: { patient_number: null, status: 'active' },
        })
        this.items.unshift(optimistic)
        this.total += 1
        return optimistic
      }

      const created = await api.createPatient(payload)
      if (created?.uuid) {
        this.items.unshift(created)
        this.total += 1
        await mirrorRows('patients', [created])
      }
      return created
    },

    // Edits / deletes / status changes are online-only in v1. See offline
    // scope decisions in docs/OFFLINE_MODE.md.
    async update(uuid, payload) {
      assertOnline('edit a patient')
      const updated = await api.updatePatient(uuid, payload)
      if (updated?.uuid) {
        const idx = this.items.findIndex(p => p.uuid === uuid)
        if (idx >= 0) this.items[idx] = { ...this.items[idx], ...updated }
        await mirrorRows('patients', [updated])
      }
      return updated
    },

    async remove(uuid) {
      assertOnline('delete a patient')
      await api.deletePatient(uuid)
      const before = this.items.length
      this.items = this.items.filter(p => p.uuid !== uuid)
      if (this.items.length < before) this.total = Math.max(0, this.total - 1)
    },

    async setStatus(uuid, status) {
      assertOnline('change patient status')
      const updated = await api.setPatientStatus(uuid, status)
      if (updated?.uuid) {
        const idx = this.items.findIndex(p => p.uuid === uuid)
        if (idx >= 0) this.items[idx] = { ...this.items[idx], ...updated }
        await mirrorRows('patients', [updated])
      }
      return updated
    },

    setFilters(patch) { this.filters = { ...this.filters, ...patch } },
    resetFilters()    { this.filters = emptyFilters() }
  }
})
