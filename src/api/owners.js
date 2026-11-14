import { api } from './client'

/**
 * Owner CRUD + tenant-assignment API client. All endpoints require a
 * super-admin bearer token in Phase 1. Phase 2 opens owner-side
 * (/auth/owner/login + /owner/me/*) endpoints — those live in a separate
 * file when they arrive.
 */

export function listOwners(filters = {}) {
  const query = {}
  if (filters.keywords) query.keywords = filters.keywords
  if (Array.isArray(filters.status) && filters.status.length) query.status = filters.status
  query.page_number = filters.page_number ?? 0
  query.page_size   = filters.page_size   ?? 0
  return api.get('/owner/dashboard', { query })
}

export function viewOwner(uuid) {
  return api.get(`/owner/view/${uuid}`)
}

export function checkOwnerUsernameAvailable(username) {
  return api.get('/owner/username-available', { query: { username } })
}

export function createOwner(payload) {
  return api.post('/owner/create', payload)
}

export function updateOwner(uuid, payload) {
  return api.patch(`/owner/update/${uuid}`, payload)
}

export function setOwnerStatus(uuid, status) {
  return api.patch(`/owner/set-status/${uuid}`, { status })
}

export function deleteOwner(uuid) {
  return api.delete(`/owner/delete/${uuid}`)
}

// Triggers a password-reset email for the owner. The reset-link verify +
// consume endpoints land in Phase 2 alongside /auth/owner/login — until
// then the email can be inspected for QA purposes but the link won't
// complete the reset.
export function requestOwnerPasswordReset(uuid) {
  return api.post(`/owner/reset-password/${uuid}`)
}

export function listAssignedTenants(uuid) {
  return api.get(`/owner/${uuid}/tenants`)
}

export function listUnassignedTenants() {
  return api.get('/owner/unassigned-tenants')
}

export function assignTenant(owner_uuid, tenant_uuid) {
  return api.post(`/owner/${owner_uuid}/assign-tenant`, { tenant_uuid })
}

export function unassignTenant(owner_uuid, tenant_uuid) {
  return api.delete(`/owner/${owner_uuid}/assign-tenant/${tenant_uuid}`)
}
