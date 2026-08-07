import { api } from './client'

// Expenses — operational cost tracking (delivery, utilities, salary, supplies,
// rent, transportation, others). Full CRUD + void.
//
// Endpoint layout mirrors the other feature groups already in this repo
// (transactions, discounts, kds). If the real backend uses different paths
// or field names, this file is the single translation point.

export function listDashboard(filters = {}) {
  const query = { page_number: 0, page_size: 0 }
  if (filters.tenant_uuid)         query.tenant_uuid   = filters.tenant_uuid
  if (filters.user_uuid)           query.user_uuid     = filters.user_uuid
  if (filters.category)            query.category      = filters.category
  if (filters.keywords)            query.keywords      = filters.keywords
  if (filters.date_from)           query.date_from     = filters.date_from
  if (filters.date_to)             query.date_to       = filters.date_to
  if (Array.isArray(filters.status) && filters.status.length) query.status = filters.status
  if (filters.page_number != null) query.page_number   = filters.page_number
  if (filters.page_size   != null) query.page_size     = filters.page_size
  return api.get('/expense/dashboard', { query })
}

export function viewExpense(uuid) {
  return api.get(`/expense/view/${uuid}`)
}

// payload: { tenant_uuid?, user_uuid?, expense_date, category, description,
//            amount, notes? }
export function createExpense(payload) {
  return api.post('/expense/create', stripEmpty(payload))
}

// payload: same mutable subset as create — expense_date, category,
// description, amount, notes.
export function updateExpense(uuid, payload) {
  return api.patch(`/expense/update/${uuid}`, stripEmpty(payload))
}

// payload: { reason }. Backend flips status to 'voided' and stamps
// voided_at / voided_by_* metadata. Voided rows stay visible in the list
// so history is preserved.
export function voidExpense(uuid, payload) {
  return api.patch(`/expense/void/${uuid}`, payload || {})
}

// Drop keys the API treats as invalid when empty. Booleans and zeros pass
// through so `amount: 0` still lands if a caller ever needs it.
function stripEmpty(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null || v === '') continue
    out[k] = v
  }
  return out
}
