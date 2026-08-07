import { api } from './client'

export function listTenants(filters = {}) {
  const query = {}
  if (filters.keywords) query.keywords = filters.keywords
  if (Array.isArray(filters.status) && filters.status.length) query.status = filters.status
  query.page_number = filters.page_number ?? 0
  query.page_size   = filters.page_size   ?? 0
  return api.get('/tenant/dashboard', { query })
}

export function viewTenant(uuid) {
  return api.get(`/tenant/view/${uuid}`)
}

// `files` is either a single logo File (legacy) or an object
// { company_logo?, lab_header_image? } — both properties optional. Kept
// backwards-compatible so existing callers that pass a File keep working.
function buildFormData(payload, files) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(payload || {})) {
    // Only skip fields the caller explicitly left absent. Empty strings are a
    // legitimate value on PATCH — e.g. clearing the receipt header — and
    // dropping them here silently reverted user edits back to the DB value.
    if (v === undefined || v === null) continue
    // Send booleans as "1"/"0". "false"/"true" strings look right but many
    // backends coerce with Boolean(v) which returns true for any non-empty
    // string — so `false` would round-trip as true. "1"/"0" is unambiguous
    // for class-transformer, ParseBoolPipe, and standard PHP/Python/Ruby.
    if (typeof v === 'boolean') fd.append(k, v ? '1' : '0')
    else fd.append(k, String(v))
  }
  if (files instanceof File) {
    fd.append('company_logo', files)
  } else if (files && typeof files === 'object') {
    if (files.company_logo)     fd.append('company_logo', files.company_logo)
    if (files.lab_header_image) fd.append('lab_header_image', files.lab_header_image)
  }
  return fd
}

export function createTenant(payload, files) {
  return api.post('/tenant/create', buildFormData(payload, files), { isMultipart: true })
}

export function updateTenant(uuid, payload, files) {
  return api.patch(`/tenant/update/${uuid}`, buildFormData(payload, files), { isMultipart: true })
}

export function deleteTenant(uuid) {
  return api.delete(`/tenant/delete/${uuid}`)
}

export function setTenantStatus(uuid, status) {
  return api.patch(`/tenant/set-status/${uuid}`, { status })
}

// Super-admin override: change a tenant's current subscription end date and/or
// amount, with a mandatory reason for the audit trail. Any of the value fields
// may be omitted to leave that field unchanged; alter_reason is always required.
// payload: {
//   current_subscription_expiry?,        // "YYYY-MM-DD" or ISO datetime
//   current_subscription_plan_amount?,   // number
//   alter_reason                         // required
// }
export function alterTenantSubscription(uuid, payload) {
  const body = {}
  for (const [k, v] of Object.entries(payload || {})) {
    if (v === undefined || v === null || v === '') continue
    body[k] = v
  }
  return api.patch(`/tenant/alter-subscription/${uuid}`, body)
}
