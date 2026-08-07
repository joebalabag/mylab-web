import { api } from './client'

export const CASE_TYPES = ['OPD', 'IPD', 'ER']
export const CASE_STATUSES = ['open', 'closed', 'cancelled']

export function listPatientCases(filters = {}) {
  const query = {}
  if (filters.tenant_uuid)  query.tenant_uuid  = filters.tenant_uuid
  if (filters.patient_uuid) query.patient_uuid = filters.patient_uuid
  if (filters.case_type)    query.case_type    = filters.case_type
  if (filters.keywords)     query.keywords     = filters.keywords
  if (filters.date_from)    query.date_from    = filters.date_from
  if (filters.date_to)      query.date_to      = filters.date_to
  if (Array.isArray(filters.status) && filters.status.length) query.status = filters.status
  query.page_number = filters.page_number ?? 0
  query.page_size   = filters.page_size   ?? 0
  return api.get('/patient-case/dashboard', { query })
}

export function viewPatientCase(uuid) {
  return api.get(`/patient-case/view/${uuid}`)
}

export function createPatientCase(payload) {
  return api.post('/patient-case/create', payload)
}

export function updatePatientCase(uuid, payload) {
  return api.patch(`/patient-case/update/${uuid}`, payload)
}

export function deletePatientCase(uuid) {
  return api.delete(`/patient-case/delete/${uuid}`)
}

export function setPatientCaseStatus(uuid, status) {
  return api.patch(`/patient-case/set-status/${uuid}`, { status })
}
