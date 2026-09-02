// Requisition store — drop-in replacement for the api/patientRequisitions
// call sites in PatientCasesView. Each exported action mirrors the API
// function name so the view refactor is import-only.
//
// Offline mode routes creates + finalize through a single composite outbox
// entry (`patient_requisition`) that the server-side dispatcher unpacks
// into create → syncItems → setStatus in one transaction. Edits, deletes,
// status changes on existing rows, and discount management stay online-only
// for v1 — they mostly happen after the requisition is on the server anyway
// (edited by a manager, voided, etc.).

import { defineStore } from 'pinia'
import * as api from '../api/patientRequisitions'
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
import { useAuthStore } from './auth.js'

// Compose one Dexie item row from a form-side line. offline-only helper —
// mirrors the server's snapshotting so the local carts render correctly
// against the cached test_items / item_packages.
function buildOfflineItemRow(input, requisition_uuid, tenant_uuid, catalog) {
  const src = input.source_type === 'test_item'
    ? catalog.testItemsByUuid.get(input.source_uuid)
    : catalog.packagesByUuid.get(input.source_uuid)
  const code = src?.code ?? null
  const name = src?.name ?? null
  const unit_price = Number(input.unit_price ?? src?.selling_price ?? 0)
  const quantity = Number(input.quantity ?? 1)
  const line_total = Math.round(unit_price * quantity * 100) / 100
  return {
    uuid: input.uuid || newUuid(),
    tenant_uuid,
    patient_requisition_uuid: requisition_uuid,
    source_type: input.source_type,
    source_uuid: input.source_uuid,
    code,
    name,
    quantity,
    unit_price,
    line_total,
    line_discount_amount: 0,
    line_selling_price: line_total,
    package_uuid: input.package_uuid ?? null,
    package_code: input.package_code ?? null,
    package_name: input.package_name ?? null,
    display_order: input.display_order ?? 0,
    payment_uuid: null,
    paid_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    __pending: true,
  }
}

export const usePatientRequisitionsStore = defineStore('patientRequisitions', {
  state: () => ({}),
  actions: {
    async list(filters = {}) {
      if (shouldRouteThroughOfflineStack()) {
        const db = getDb()
        let rows = await db.table('patient_requisitions').toArray()
        if (filters.patient_case_uuid) rows = rows.filter((r) => r.patient_case_uuid === filters.patient_case_uuid)
        if (filters.patient_uuid)      rows = rows.filter((r) => r.patient_uuid === filters.patient_uuid)
        if (filters.status?.length)    rows = rows.filter((r) => filters.status.includes(r.status))
        return paginate(rows, {
          page_number: filters.page_number ?? 0,
          page_size:   filters.page_size   ?? 0,
          keywords: filters.keywords,
          matchFn: (r, kw) => (
            String(r.requisition_number || '').toLowerCase().includes(kw) ||
            String(r.physician || '').toLowerCase().includes(kw)
          ),
        })
      }
      const res = await api.listPatientRequisitions(filters)
      const rows = Array.isArray(res?.results) ? res.results : []
      await mirrorRows('patient_requisitions', rows)
      return res
    },

    async view(uuid) {
      if (shouldRouteThroughOfflineStack()) {
        const db = getDb()
        const row = await db.table('patient_requisitions').get(uuid)
        if (!row) {
          const err = new Error('Requisition not found in offline cache.')
          err.code = 'OFFLINE_MISS'
          throw err
        }
        const items = await db.table('patient_requisition_items')
          .where('patient_requisition_uuid').equals(uuid)
          .toArray()
        return { ...row, items }
      }
      const row = await api.viewPatientRequisition(uuid)
      if (row?.uuid) {
        await mirrorRows('patient_requisitions', [{ ...row, items: undefined }])
        if (Array.isArray(row.items)) await mirrorRows('patient_requisition_items', row.items)
      }
      return row
    },

    /**
     * Composite create + syncItems + optional finalize. Same signature the
     * online path in PatientCasesView used to build up sequentially — the
     * view now calls this one method whether online or offline.
     */
    async saveComposite({
      patient_case_uuid, patient_uuid,
      requisition_date, notes, physician,
      items = [], finalize = true,
    }) {
      if (shouldRouteThroughOfflineStack()) {
        const auth = useAuthStore()
        const db = getDb()
        const client_uuid = newUuid()
        const now = new Date().toISOString()

        // Load catalog snapshots so item rows render correctly locally.
        const [testItems, packages] = await Promise.all([
          db.table('test_items').toArray(),
          db.table('item_packages').toArray(),
        ])
        const catalog = {
          testItemsByUuid: new Map(testItems.map((t) => [t.uuid, t])),
          packagesByUuid:  new Map(packages.map((p) => [p.uuid, p])),
        }
        const localItems = items.map((input, idx) =>
          buildOfflineItemRow({ ...input, display_order: idx }, client_uuid, auth.tenantUuid, catalog),
        )
        const subtotal = localItems.reduce((s, it) => s + Number(it.line_total || 0), 0)

        const optimistic = {
          uuid: client_uuid,
          client_uuid,
          tenant_uuid: auth.tenantUuid,
          patient_case_uuid,
          patient_uuid,
          requisition_number: null,
          requisition_date: requisition_date || now,
          notes: notes || null,
          physician: physician || null,
          subtotal,
          total: subtotal,
          status: finalize ? 'finalized' : 'draft',
          created_offline_at: now,
          created_at: now,
          updated_at: now,
          __pending: true,
        }
        await db.table('patient_requisitions').put(optimistic)
        if (localItems.length) await db.table('patient_requisition_items').bulkPut(localItems)

        await enqueue(db, {
          entity_type: 'patient_requisition',
          client_uuid,
          payload: {
            patient_case_uuid,
            patient_uuid,
            requisition_date: requisition_date || undefined,
            notes: notes || undefined,
            physician: physician || undefined,
            items: items.map((r, idx) => ({
              source_type: r.source_type,
              source_uuid: r.source_uuid,
              quantity: Number(r.quantity) || 1,
              unit_price: Number(r.unit_price) || 0,
              display_order: idx,
              package_uuid: r.package_uuid || undefined,
              package_code: r.package_code || undefined,
              package_name: r.package_name || undefined,
            })),
            finalize,
          },
        })
        try { await useOfflineStore().refreshCounts() } catch (_) {}
        return optimistic
      }

      // Online: original sequential flow (moved out of PatientCasesView).
      const created = await api.createPatientRequisition({
        patient_case_uuid, notes, physician, requisition_date,
      })
      const rows = items.map((r, idx) => ({
        source_type: r.source_type,
        source_uuid: r.source_uuid,
        quantity: Number(r.quantity) || 1,
        unit_price: Number(r.unit_price) || 0,
        display_order: idx,
        package_uuid: r.package_uuid || undefined,
        package_code: r.package_code || undefined,
        package_name: r.package_name || undefined,
      }))
      await api.syncPatientRequisitionItems(created.uuid, rows)
      if (finalize) await api.setPatientRequisitionStatus(created.uuid, 'finalized')
      const full = await api.viewPatientRequisition(created.uuid)
      if (full?.uuid) {
        await mirrorRows('patient_requisitions', [{ ...full, items: undefined }])
        if (Array.isArray(full.items)) await mirrorRows('patient_requisition_items', full.items)
      }
      return full || created
    },

    async updateHeader(uuid, payload) {
      assertOnline('edit a requisition')
      return api.updatePatientRequisition(uuid, payload)
    },

    async syncItems(uuid, rows) {
      assertOnline('edit requisition items')
      return api.syncPatientRequisitionItems(uuid, rows)
    },

    async setDiscount(uuid, payload) {
      assertOnline('change a requisition discount')
      return api.setPatientRequisitionDiscount(uuid, payload)
    },

    async setStatus(uuid, status) {
      assertOnline('change requisition status')
      return api.setPatientRequisitionStatus(uuid, status)
    },

    async remove(uuid) {
      assertOnline('delete a requisition')
      return api.deletePatientRequisition(uuid)
    },
  },
})
