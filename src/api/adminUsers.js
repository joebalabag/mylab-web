import { api } from './client'

// Super admin CRUD. All endpoints require a super-admin bearer token.
// Server filters honored: keywords, status[], role, page_number, page_size.
export function listAdmins(filters = {}) {
  const query = {}
  if (filters.keywords) query.keywords = filters.keywords
  if (filters.role)     query.role     = filters.role
  if (Array.isArray(filters.status) && filters.status.length) query.status = filters.status
  query.page_number = filters.page_number ?? 0
  query.page_size   = filters.page_size   ?? 0
  return api.get('/admin/dashboard', { query })
}

export function viewAdmin(uuid) {
  return api.get(`/admin/view/${uuid}`)
}

export function createAdmin(payload) {
  return api.post('/admin/create', payload)
}

export function updateAdmin(uuid, payload) {
  return api.patch(`/admin/update/${uuid}`, payload)
}

export function deleteAdmin(uuid) {
  return api.delete(`/admin/delete/${uuid}`)
}

export function setAdminStatus(uuid, status) {
  return api.patch(`/admin/set-status/${uuid}`, { status })
}

// Super admin resetting another admin's password (no old password required).
export function changeAdminPassword(uuid, password, confirm_password) {
  return api.patch(`/admin/change-password/${uuid}`, { password, confirm_password })
}
