import { api } from './client'

// Tenant subscription payment CRUD.
// Admin token → cross-tenant. User token → auto-scoped to own tenant.
export function listPayments(filters = {}) {
  const query = {}
  if (filters.tenant_uuid)    query.tenant_uuid    = filters.tenant_uuid
  if (filters.payment_status) query.payment_status = filters.payment_status
  if (filters.keywords)       query.keywords       = filters.keywords
  if (filters.date_from)      query.date_from      = filters.date_from
  if (filters.date_to)        query.date_to        = filters.date_to
  if (Array.isArray(filters.status) && filters.status.length) query.status = filters.status
  query.page_number = filters.page_number ?? 0
  query.page_size   = filters.page_size   ?? 0
  return api.get('/tenant-subscription-payment/dashboard', { query })
}

export function viewPayment(uuid) {
  return api.get(`/tenant-subscription-payment/view/${uuid}`)
}

// Tenant (or admin on tenant's behalf) submits a proof-of-payment. The receipt
// image itself must be uploaded first via POST /ai-extraction/receipt, and its
// returned `file_url` passed here as `payment_attachment_url`.
//
// payload: {
//   tenant_uuid?,                 // admin token only
//   subscription_plan_uuid,       // required
//   amount_paid,                  // required
//   payment_attachment_url?,      // /public/... URL from /ai-extraction/receipt
//   payment_reference_number?,
//   payee_account_number?,
//   payment_method?,
//   payment_method_name?,
//   payment_datetime?,            // ISO 8601 with timezone offset
//   ai_extraction?                // whole extraction object from /ai-extraction/receipt
// }
export function uploadPayment(payload) {
  const body = {}
  for (const [k, v] of Object.entries(payload || {})) {
    if (v === undefined || v === null || v === '') continue
    body[k] = v
  }
  return api.post('/tenant-subscription-payment/upload', body)
}

// Admin only.
export function approvePayment(uuid, subscription_start) {
  return api.patch(`/tenant-subscription-payment/approve/${uuid}`,
    subscription_start ? { subscription_start } : {})
}

// Admin only.
export function rejectPayment(uuid, rejection_reason) {
  return api.patch(`/tenant-subscription-payment/reject/${uuid}`, { rejection_reason })
}

// Ask the backend to prepare a PayPal Order for a plan. Returns
// { order_id, amount, currency }. Feed order_id into the Smart Button.
export function paypalCreateOrder({ tenant_uuid, subscription_plan_uuid }) {
  const body = { subscription_plan_uuid }
  if (tenant_uuid) body.tenant_uuid = tenant_uuid
  return api.post('/tenant-subscription-payment/paypal/create-order', body)
}

// Capture the order after the shopper approves in the PayPal popup. Idempotent
// — safe to call again if the network drops. Returns the payment row and the
// activation_mode ('immediate' | 'scheduled' | 'noop').
export function paypalCaptureOrder({ tenant_uuid, order_id }) {
  const body = { order_id }
  if (tenant_uuid) body.tenant_uuid = tenant_uuid
  return api.post('/tenant-subscription-payment/paypal/capture-order', body)
}
