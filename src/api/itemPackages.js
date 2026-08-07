import { api } from './client'

export function listItemPackages(filters = {}) {
  const query = {}
  if (filters.tenant_uuid) query.tenant_uuid = filters.tenant_uuid
  if (filters.keywords)    query.keywords    = filters.keywords
  if (Array.isArray(filters.status) && filters.status.length) query.status = filters.status
  query.page_number = filters.page_number ?? 0
  query.page_size   = filters.page_size   ?? 0
  return api.get('/item-package/dashboard', { query })
}

export function viewItemPackage(uuid) {
  return api.get(`/item-package/view/${uuid}`)
}

export function createItemPackage(payload) {
  return api.post('/item-package/create', payload)
}

export function updateItemPackage(uuid, payload) {
  return api.patch(`/item-package/update/${uuid}`, payload)
}

export function deleteItemPackage(uuid) {
  return api.delete(`/item-package/delete/${uuid}`)
}

export function setItemPackageStatus(uuid, status) {
  return api.patch(`/item-package/set-status/${uuid}`, { status })
}

// Whole-list sync for a package's items. Server upserts by uuid,
// inserts rows without a uuid, deletes any row not in the payload, and
// recomputes parent.package_price = SUM(new_price).
export function syncItemPackageItems(uuid, items) {
  return api.put(`/item-package/${uuid}/items`, { items })
}
