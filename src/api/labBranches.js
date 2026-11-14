import { api } from './client'

/**
 * Phase 3 - Branch result search endpoints. Called from BranchSearchDrawer
 * when a lab user needs to pull a FINAL result from another branch owned
 * by the same owner.
 */

export function listBranches() {
  return api.get('/lab-report/branches')
}

export function crossTenantSearch(filters = {}) {
  const query = {}
  if (filters.tenant_uuid) query.tenant_uuid = filters.tenant_uuid
  if (filters.date_from)   query.date_from   = filters.date_from
  if (filters.date_to)     query.date_to     = filters.date_to
  if (filters.keywords)    query.keywords    = filters.keywords
  if (filters.page_number != null) query.page_number = filters.page_number
  if (filters.page_size   != null) query.page_size   = filters.page_size
  return api.get('/lab-report/cross-tenant-search', { query })
}
