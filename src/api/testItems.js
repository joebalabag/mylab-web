import { api } from './client'

export const RESULT_TYPES = ['single', 'panel', 'narrative', 'culture', 'matrix']

export const RESULT_TYPE_LABELS = {
  single:    'Single value',
  panel:     'Panel (multiple values)',
  narrative: 'Narrative report',
  culture:   'Culture + sensitivity',
  matrix:    'Matrix (rows × cols grid)'
}

export function listTestItems(filters = {}) {
  const query = {}
  if (filters.tenant_uuid)        query.tenant_uuid        = filters.tenant_uuid
  if (filters.item_category_uuid) query.item_category_uuid = filters.item_category_uuid
  if (filters.item_group_uuid)    query.item_group_uuid    = filters.item_group_uuid
  if (filters.result_type)        query.result_type        = filters.result_type
  if (filters.keywords)           query.keywords           = filters.keywords
  if (Array.isArray(filters.status) && filters.status.length) query.status = filters.status
  query.page_number = filters.page_number ?? 0
  query.page_size   = filters.page_size   ?? 0
  return api.get('/test-item/dashboard', { query })
}

export function viewTestItem(uuid) {
  return api.get(`/test-item/view/${uuid}`)
}

export function createTestItem(payload) {
  return api.post('/test-item/create', payload)
}

export function updateTestItem(uuid, payload) {
  return api.patch(`/test-item/update/${uuid}`, payload)
}

export function deleteTestItem(uuid) {
  return api.delete(`/test-item/delete/${uuid}`)
}

export function setTestItemStatus(uuid, status) {
  return api.patch(`/test-item/set-status/${uuid}`, { status })
}

// Whole-list sync for a panel item's components. Server upserts by uuid,
// inserts rows without a uuid, and deletes any existing row whose uuid isn't
// in the payload. Send display_order to control report row order — omitted
// values fall back to array index.
export function syncTestItemComponents(uuid, components) {
  return api.put(`/test-item/${uuid}/components`, { components })
}
