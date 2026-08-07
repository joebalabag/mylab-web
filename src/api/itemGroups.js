import { api } from './client'

// Dashboard list. User tokens are auto-scoped on the server;
// tenant_uuid is only used by admin tokens.
export function listItemGroups(filters = {}) {
  const query = {}
  if (filters.tenant_uuid) query.tenant_uuid = filters.tenant_uuid
  if (filters.keywords)    query.keywords    = filters.keywords
  if (Array.isArray(filters.status) && filters.status.length) query.status = filters.status
  query.page_number = filters.page_number ?? 0
  query.page_size   = filters.page_size   ?? 0
  return api.get('/item-group/dashboard', { query })
}

export function viewItemGroup(uuid) {
  return api.get(`/item-group/view/${uuid}`)
}

export function createItemGroup(payload) {
  return api.post('/item-group/create', payload)
}

export function updateItemGroup(uuid, payload) {
  return api.patch(`/item-group/update/${uuid}`, payload)
}

export function deleteItemGroup(uuid) {
  return api.delete(`/item-group/delete/${uuid}`)
}

export function setItemGroupStatus(uuid, status) {
  return api.patch(`/item-group/set-status/${uuid}`, { status })
}

// Manifest of the pre-loaded standard catalog (group + categories + counts).
// Powers the "Import from pre-loaded" checklist on the Item Groups screen.
export function getPreloadedCatalog() {
  return api.get('/item-group/preloaded-catalog')
}

// Install the standard catalog. Pass an array of item-group codes to import
// only those groups (each group brings its own categories + test items).
// Omit / pass empty to install every group in the catalog.
export function importPreloadedCatalog(group_codes) {
  return api.post('/item-group/import-preloaded', { group_codes })
}
