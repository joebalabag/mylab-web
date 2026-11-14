import { api } from './client'

/**
 * Phase 2 - Owner-scoped resource endpoints. All require an owner bearer
 * token; backend asserts ownership on each call via owner_tenants.
 */

export function getSummary() {
  return api.get('/owner/me/summary')
}

export function listMyTenants() {
  return api.get('/owner/me/tenants')
}

export function updateMyTenant(uuid, patch) {
  return api.patch(`/owner/me/tenants/${uuid}`, patch)
}

/* Migrations — mirror super-admin /tenant/migration/* but owner-guarded */

export function migrationRecordCounts(tenant_uuid) {
  return api.get(`/owner/me/tenants/${tenant_uuid}/migration/record-counts`)
}

export function migrationDeleteTransactions(tenant_uuid, password) {
  return api.post(`/owner/me/tenants/${tenant_uuid}/migration/delete-transactions`, { password })
}

export function migrationDeleteLookupData(tenant_uuid, password) {
  return api.post(`/owner/me/tenants/${tenant_uuid}/migration/delete-lookup-data`, { password })
}

export function migrationDeletePatientRecords(tenant_uuid, password) {
  return api.post(`/owner/me/tenants/${tenant_uuid}/migration/delete-patient-records`, { password })
}

export function migrationCopyCatalog(target_tenant_uuid, { password, source_tenant_uuid, tables }) {
  return api.post(`/owner/me/tenants/${target_tenant_uuid}/migration/copy-catalog`, {
    password,
    source_tenant_uuid,
    tables,
  })
}

/* Catalog + price comparison */

export function listCatalog(tenant_uuid) {
  return api.get('/owner/me/catalog', { query: { tenant_uuid } })
}

export function compareCatalog() {
  return api.get('/owner/me/catalog/compare')
}

export function bulkPriceEdit(item_code, pricesByTenant, addsByTenant) {
  const body = { prices: pricesByTenant }
  if (addsByTenant && Object.keys(addsByTenant).length) body.add = addsByTenant
  return api.patch(`/owner/me/catalog/${encodeURIComponent(item_code)}/prices`, body)
}

/* Users across owner's tenants */

export function listUsers(filters = {}) {
  const query = {}
  if (filters.tenant_uuid) query.tenant_uuid = filters.tenant_uuid
  if (filters.role)        query.role        = filters.role
  if (filters.keywords)    query.keywords    = filters.keywords
  if (Array.isArray(filters.status) && filters.status.length) query.status = filters.status
  return api.get('/owner/me/users', { query })
}

export function createUser(payload) {
  return api.post('/owner/me/users', payload)
}

export function updateUser(uuid, payload) {
  return api.patch(`/owner/me/users/${uuid}`, payload)
}

export function setUserStatus(uuid, status) {
  return api.patch(`/owner/me/users/${uuid}/status`, { status })
}

export function deleteUser(uuid) {
  return api.delete(`/owner/me/users/${uuid}`)
}
