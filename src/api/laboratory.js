import { api } from './client'

export const LAB_REPORT_STATUSES = ['draft', 'finalized', 'voided']
export const LAB_RESULT_FLAGS    = ['normal', 'low', 'high', 'abnormal', 'critical']

export function listLabReports(filters = {}) {
  const query = {}
  if (filters.tenant_uuid)              query.tenant_uuid              = filters.tenant_uuid
  if (filters.patient_uuid)             query.patient_uuid             = filters.patient_uuid
  if (filters.patient_requisition_uuid) query.patient_requisition_uuid = filters.patient_requisition_uuid
  if (filters.item_category_uuid)       query.item_category_uuid       = filters.item_category_uuid
  if (filters.item_group_uuid)          query.item_group_uuid          = filters.item_group_uuid
  if (filters.keywords)                 query.keywords                 = filters.keywords
  if (Array.isArray(filters.status) && filters.status.length) query.status = filters.status
  if (filters.date_from) query.date_from = filters.date_from
  if (filters.date_to)   query.date_to   = filters.date_to
  query.page_number = filters.page_number ?? 0
  query.page_size   = filters.page_size   ?? 0
  return api.get('/lab-report/dashboard', { query })
}

export function viewLabReport(uuid) {
  return api.get(`/lab-report/view/${uuid}`)
}

// Step 1 of Add Laboratory — paid requisitions with at least one uncovered test line.
// `opts.item_group_uuid` scopes the list to requisitions whose uncovered tests
// belong to a category under the given item_group (matches the dashboard filter).
export function listEligibleRequisitions(keywords, opts = {}) {
  const query = {}
  if (keywords) query.keywords = keywords
  if (opts.item_group_uuid) query.item_group_uuid = opts.item_group_uuid
  return api.get('/lab-report/eligible-requisitions', { query })
}

// Step 2 — uncovered test lines + item_category metadata for a given requisition.
export function listUncoveredItems(requisitionUuid) {
  return api.get(`/lab-report/uncovered-items/${requisitionUuid}`)
}

// Confirmed selection → one lab_report per group, drafts.
export function createLabReportBatch(payload) {
  return api.post('/lab-report/create-batch', payload)
}

// Bulk save on a draft report.
export function updateLabReportResults(uuid, payload) {
  return api.put(`/lab-report/${uuid}/results`, payload)
}

export function setLabReportFinal(uuid, payload = {}) {
  return api.patch(`/lab-report/${uuid}/set-final`, payload)
}

// Reopen a finalized report back to draft — clears the pathologist snapshot
// and finalized_at so the operator can amend results and re-finalize.
export function unsetLabReportFinal(uuid) {
  return api.patch(`/lab-report/${uuid}/unset-final`, {})
}

// Fetch the default signatory doctor derived from the report's item_group.
// Returns null when the group has no default signatory configured.
export function getLabReportDefaultSignatory(uuid) {
  return api.get(`/lab-report/${uuid}/default-signatory`)
}

export function voidLabReport(uuid, reason) {
  return api.patch(`/lab-report/${uuid}/void`, { reason })
}

// Public no-auth endpoint used by the QR-code landing page.
export function publicViewLabReport(token) {
  return api.get('/lab-report/public/view', { query: { t: token } })
}
