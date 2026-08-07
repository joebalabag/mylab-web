import { api } from './client'

export function listItemCategories(filters = {}) {
  const query = {}
  if (filters.tenant_uuid)     query.tenant_uuid     = filters.tenant_uuid
  if (filters.item_group_uuid) query.item_group_uuid = filters.item_group_uuid
  if (filters.keywords)        query.keywords        = filters.keywords
  if (Array.isArray(filters.status) && filters.status.length) query.status = filters.status
  query.page_number = filters.page_number ?? 0
  query.page_size   = filters.page_size   ?? 0
  return api.get('/item-category/dashboard', { query })
}

export function viewItemCategory(uuid) {
  return api.get(`/item-category/view/${uuid}`)
}

export function createItemCategory(payload) {
  return api.post('/item-category/create', payload)
}

export function updateItemCategory(uuid, payload) {
  return api.patch(`/item-category/update/${uuid}`, payload)
}

export function deleteItemCategory(uuid) {
  return api.delete(`/item-category/delete/${uuid}`)
}

export function setItemCategoryStatus(uuid, status) {
  return api.patch(`/item-category/set-status/${uuid}`, { status })
}
