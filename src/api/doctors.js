import { api } from './client'

// Only lab- / diagnostic-test-related specialties. Doctors here sign off on
// generated reports (pathologist on lab, radiologist on imaging, etc.).
export const DOCTOR_SPECIALTIES = [
  'Pathologist',
  'Clinical Pathologist',
  'Anatomic Pathologist',
  'Radiologist',
  'Sonologist',
  'Cardiologist',
  'Nuclear Medicine Specialist',
  'Other',
]

export function listDoctors(filters = {}) {
  const query = {}
  if (filters.tenant_uuid) query.tenant_uuid = filters.tenant_uuid
  if (filters.specialty)   query.specialty   = filters.specialty
  if (filters.keywords)    query.keywords    = filters.keywords
  if (Array.isArray(filters.status) && filters.status.length) query.status = filters.status
  query.page_number = filters.page_number ?? 0
  query.page_size   = filters.page_size   ?? 0
  return api.get('/doctor/dashboard', { query })
}

export function viewDoctor(uuid) {
  return api.get(`/doctor/view/${uuid}`)
}

function buildFormData(payload, file) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(payload || {})) {
    if (v === undefined || v === null) continue
    fd.append(k, String(v))
  }
  if (file instanceof File) fd.append('esignature_image', file)
  return fd
}

export function createDoctor(payload, file) {
  return api.post('/doctor/create', buildFormData(payload, file), { isMultipart: true })
}

export function updateDoctor(uuid, payload, file) {
  return api.patch(`/doctor/update/${uuid}`, buildFormData(payload, file), { isMultipart: true })
}

export function deleteDoctor(uuid) {
  return api.delete(`/doctor/delete/${uuid}`)
}

export function setDoctorStatus(uuid, status) {
  return api.patch(`/doctor/set-status/${uuid}`, { status })
}
