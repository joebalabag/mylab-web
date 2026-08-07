import { api } from './client'

export const REQUISITION_STATUSES = ['draft', 'finalized', 'cancelled']
export const REQUISITION_SOURCE_TYPES = ['test_item', 'item_package']

export function listPatientRequisitions(filters = {}) {
  const query = {}
  if (filters.tenant_uuid)       query.tenant_uuid       = filters.tenant_uuid
  if (filters.patient_case_uuid) query.patient_case_uuid = filters.patient_case_uuid
  if (filters.patient_uuid)      query.patient_uuid      = filters.patient_uuid
  if (filters.keywords)          query.keywords          = filters.keywords
  if (Array.isArray(filters.status) && filters.status.length) query.status = filters.status
  query.page_number = filters.page_number ?? 0
  query.page_size   = filters.page_size   ?? 0
  return api.get('/patient-requisition/dashboard', { query })
}

export function viewPatientRequisition(uuid) {
  return api.get(`/patient-requisition/view/${uuid}`)
}

export function createPatientRequisition(payload) {
  return api.post('/patient-requisition/create', payload)
}

export function updatePatientRequisition(uuid, payload) {
  return api.patch(`/patient-requisition/update/${uuid}`, payload)
}

export function deletePatientRequisition(uuid) {
  return api.delete(`/patient-requisition/delete/${uuid}`)
}

export function setPatientRequisitionStatus(uuid, status) {
  return api.patch(`/patient-requisition/set-status/${uuid}`, { status })
}

// Bulk sync of requisition lines. Same semantics as the item-package sync.
// The server snapshots code/name/unit_price from the source (test_item or
// item_package) for any row without a uuid, then recomputes subtotal, reapplies
// the current discount, and updates total.
export function syncPatientRequisitionItems(uuid, items) {
  return api.put(`/patient-requisition/${uuid}/items`, { items })
}

// Apply/change/clear the requisition-level discount. Pass discount_uuid=null
// (or clear=true) to remove; discount_open_amount is required for open_amount
// discount type and ignored otherwise.
export function setPatientRequisitionDiscount(uuid, payload) {
  return api.patch(`/patient-requisition/${uuid}/discount`, payload)
}
