import { api } from './client'

export const PAYMENT_METHODS = [
  'cash', 'ewallet', 'bank_transfer',
  'accounts_receivable', 'insurance', 'paid_outside', 'charity', 'other'
]
export const PAYMENT_METHOD_LABELS = {
  cash:                 'Cash',
  ewallet:              'eWallet',
  bank_transfer:        'Bank Transfer',
  accounts_receivable:  'Accounts Receivable',
  insurance:            'Insurance',
  paid_outside:         'Paid Outside',
  charity:              'Charity / Waived',
  other:                'Other',
}

// Common e-wallet providers. Free-typed 'Other' lets ops enter anything
// (Coins.ph, ShopeePay, etc.) without a UI change.
export const EWALLET_TYPES = [
  'GCash', 'Maya', 'GrabPay', 'ShopeePay', 'PayPal', 'Other'
]

// Methods that need a payer channel + reference at capture time but still
// count as cash-in-hand (no follow-up settlement needed).
export const CHANNELED_PAYMENT_METHODS = ['ewallet', 'bank_transfer']
export function isChanneledPayment(method) {
  return CHANNELED_PAYMENT_METHODS.includes(method)
}

// Methods that don't collect at the counter — the payment record unblocks
// the requisition, but the actual money is expected to arrive later (or
// never, for charity). Each requires a billed_to + reference and can be
// resolved later via /payment/resolve. Charity is auto-resolved on creation.
export const NON_CASH_ARRANGEMENT_METHODS = [
  'accounts_receivable', 'insurance', 'paid_outside', 'charity', 'other'
]
export function isNonCashArrangement(method) {
  return NON_CASH_ARRANGEMENT_METHODS.includes(method)
}

// Charity waivers don't need follow-up collection — treat as resolved-on-create.
export function isSelfResolvingArrangement(method) {
  return method === 'charity'
}
export const PAYMENT_STATUSES = ['completed', 'voided']

export function listPayments(filters = {}) {
  const query = {}
  if (filters.tenant_uuid)       query.tenant_uuid       = filters.tenant_uuid
  if (filters.patient_case_uuid) query.patient_case_uuid = filters.patient_case_uuid
  if (filters.patient_uuid)      query.patient_uuid      = filters.patient_uuid
  if (filters.payment_method)    query.payment_method    = filters.payment_method
  if (filters.keywords)          query.keywords          = filters.keywords
  if (filters.date_from)         query.date_from         = filters.date_from
  if (filters.date_to)           query.date_to           = filters.date_to
  if (Array.isArray(filters.status) && filters.status.length) query.status = filters.status
  query.page_number = filters.page_number ?? 0
  query.page_size   = filters.page_size   ?? 0
  return api.get('/payment/dashboard', { query })
}

export function viewPayment(uuid) {
  return api.get(`/payment/view/${uuid}`)
}

// Cases with unpaid finalized (or partially_paid) items — for the search-first
// picker in the New Payment flow.
export function listUnpaidCases(filters = {}) {
  const query = {}
  if (filters.keywords) query.keywords = filters.keywords
  return api.get('/payment/unpaid-cases', { query })
}

export function listUnpaidItems(patient_case_uuid) {
  return api.get('/payment/unpaid-items', { query: { patient_case_uuid } })
}

export function createPayment(payload) {
  return api.post('/payment/create', payload)
}

export function voidPayment(uuid) {
  return api.patch(`/payment/void/${uuid}`, {})
}

// Mark an arrangement (A/R, Insurance, Paid Outside, Other) as settled.
// Payload:
//   resolved_method:    the method actually used to settle (cash / ewallet / bank_transfer)
//   resolved_channel:   ewallet/bank provider (optional)
//   resolved_reference: transaction / OR # (optional)
//   resolved_notes:     free text (optional)
export function resolveArrangement(uuid, payload) {
  return api.patch(`/payment/resolve/${uuid}`, payload)
}
