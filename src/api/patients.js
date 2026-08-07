import { api } from './client'

export const PATIENT_SEXES = ['M', 'F']
export const CIVIL_STATUSES = ['Single', 'Married', 'Widowed', 'Separated', 'Divorced']
export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-']

export function listPatients(filters = {}) {
  const query = {}
  if (filters.tenant_uuid) query.tenant_uuid = filters.tenant_uuid
  if (filters.keywords)    query.keywords    = filters.keywords
  if (Array.isArray(filters.status) && filters.status.length) query.status = filters.status
  query.page_number = filters.page_number ?? 0
  query.page_size   = filters.page_size   ?? 0
  return api.get('/patient/dashboard', { query })
}

// Duplicate-check search. Called from the Add flow BEFORE opening the full
// form so users can pick an existing record instead of creating a duplicate.
export function searchPatients({ first_name, last_name, birthdate, limit } = {}) {
  const query = {}
  if (first_name) query.first_name = first_name
  if (last_name)  query.last_name  = last_name
  if (birthdate)  query.birthdate  = birthdate
  if (limit)      query.limit      = limit
  return api.get('/patient/search', { query })
}

export function viewPatient(uuid) {
  return api.get(`/patient/view/${uuid}`)
}

export function createPatient(payload) {
  return api.post('/patient/create', payload)
}

export function updatePatient(uuid, payload) {
  return api.patch(`/patient/update/${uuid}`, payload)
}

export function deletePatient(uuid) {
  return api.delete(`/patient/delete/${uuid}`)
}

export function setPatientStatus(uuid, status) {
  return api.patch(`/patient/set-status/${uuid}`, { status })
}
