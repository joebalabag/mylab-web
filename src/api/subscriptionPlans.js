import { api } from './client'

// Super admin CRUD for subscription plans. All endpoints require a super-admin bearer token.
// Server filters honored: keywords, status[], date_from, date_to, page_number, page_size.
export function listPlans(filters = {}) {
  const query = {}
  if (filters.keywords)  query.keywords  = filters.keywords
  if (filters.date_from) query.date_from = filters.date_from
  if (filters.date_to)   query.date_to   = filters.date_to
  if (Array.isArray(filters.status) && filters.status.length) query.status = filters.status
  query.page_number = filters.page_number ?? 0
  query.page_size   = filters.page_size   ?? 0
  return api.get('/subscription-plan/dashboard', { query })
}

export function viewPlan(uuid) {
  return api.get(`/subscription-plan/view/${uuid}`)
}

// Append-only price change log for a plan. Server returns rows ordered by
// changed_at DESC, up to 500. The first row (source='create', old_price=null)
// captures the plan's starting price so the trail is self-explanatory.
export function listPriceHistory(uuid) {
  return api.get(`/subscription-plan/price-history/${uuid}`)
}

function buildFormData(payload, file) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(payload || {})) {
    if (v === undefined) continue
    // Explicit null = "clear this field" — send an empty string; the API's
    // emptyToNull / emptyToUndef transformers handle both the same way.
    if (v === null) { fd.append(k, ''); continue }
    // Real arrays (allowed_modules) go as JSON-strings so commas inside the
    // value can't confuse the CSV fallback path on the server.
    if (Array.isArray(v)) { fd.append(k, JSON.stringify(v)); continue }
    if (v === '') continue
    fd.append(k, String(v))
  }
  if (file) fd.append('qrcode_for_payment', file)
  return fd
}

// If a file is provided, submit as multipart/form-data (the API accepts either).
// The optional file field is `qrcode_for_payment` (jpg / png / webp / gif / svg, up to 5 MB).
export function createPlan(payload, file) {
  if (file) {
    return api.post('/subscription-plan/create', buildFormData(payload, file), { isMultipart: true })
  }
  return api.post('/subscription-plan/create', payload)
}

export function updatePlan(uuid, payload, file) {
  if (file) {
    return api.patch(`/subscription-plan/update/${uuid}`, buildFormData(payload, file), { isMultipart: true })
  }
  return api.patch(`/subscription-plan/update/${uuid}`, payload)
}

export function deletePlan(uuid) {
  return api.delete(`/subscription-plan/delete/${uuid}`)
}

export function setPlanStatus(uuid, status) {
  return api.patch(`/subscription-plan/set-status/${uuid}`, { status })
}
