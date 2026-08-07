import { api } from './client'

export const DISCOUNT_TYPES = ['percent', 'fix', 'open_amount']

// Dashboard list. User tokens are auto-scoped on the server;
// tenant_uuid is only used by admin tokens.
export function listDiscounts(filters = {}) {
  const query = {}
  if (filters.tenant_uuid)   query.tenant_uuid   = filters.tenant_uuid
  if (filters.keywords)      query.keywords      = filters.keywords
  if (filters.discount_type) query.discount_type = filters.discount_type
  if (Array.isArray(filters.status) && filters.status.length) query.status = filters.status
  query.page_number = filters.page_number ?? 0
  query.page_size   = filters.page_size   ?? 0
  return api.get('/discount/dashboard', { query })
}

export function viewDiscount(uuid) {
  return api.get(`/discount/view/${uuid}`)
}

export function createDiscount(payload) {
  return api.post('/discount/create', payload)
}

export function updateDiscount(uuid, payload) {
  return api.patch(`/discount/update/${uuid}`, payload)
}

export function deleteDiscount(uuid) {
  return api.delete(`/discount/delete/${uuid}`)
}

export function setDiscountStatus(uuid, status) {
  return api.patch(`/discount/set-status/${uuid}`, { status })
}
