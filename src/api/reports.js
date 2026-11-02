import { api } from './client'

// Super-admin override — when set, every /reports/* request forwards this
// tenant_uuid. The backend only honors it on admin tokens (user tokens are
// always scoped to their own tenant), so it's a no-op when a staff user
// sets it. Set/clear from the Super → Tenant Reports wrapper view.
let adminTenantOverride = null
export function setReportsTenantOverride(uuid) {
  adminTenantOverride = uuid || null
}
export function getReportsTenantOverride() { return adminTenantOverride }

function withRange(f = {}) {
  const q = {}
  const tenant = f.tenant_uuid || adminTenantOverride
  if (tenant)           q.tenant_uuid    = tenant
  if (f.date_from)      q.date_from      = f.date_from
  if (f.date_to)        q.date_to        = f.date_to
  if (f.created_by)     q.created_by     = f.created_by
  if (f.category)       q.category       = f.category
  if (f.payment_method) q.payment_method = f.payment_method
  if (f.settlement)     q.settlement     = f.settlement
  if (f.limit)          q.limit          = f.limit
  return q
}
function withYear(f = {}) {
  const q = {}
  const tenant = f.tenant_uuid || adminTenantOverride
  if (tenant)  q.tenant_uuid = tenant
  if (f.year)  q.year        = f.year
  return q
}

export const getSummaryReport       = (f) => api.get('/reports/summary',                  { query: withRange(f) })
export const getMonthlySalesReport  = (f) => api.get('/reports/monthly-sales',            { query: withYear(f) })
export const getMonthlyTestsReport  = (f) => api.get('/reports/monthly-tests',            { query: withYear(f) })
export const getCashierSalesReport  = (f) => api.get('/reports/cashier-sales',            { query: withRange(f) })
export const getVoidReport          = (f) => api.get('/reports/voids',                    { query: withRange(f) })
export const getDailySalesReport    = (f) => api.get('/reports/daily-sales',              { query: withRange(f) })
export const getDailyTestsReport    = (f) => api.get('/reports/daily-tests',              { query: withRange(f) })
export const getDailyDetailedSales  = (f) => api.get('/reports/daily-detailed-sales',     { query: withRange(f) })
export const getDiscountReport      = (f) => api.get('/reports/discounts',                { query: withRange(f) })
export const getExpenseReport       = (f) => api.get('/reports/expenses',                 { query: withRange(f) })
export const getPaymentSummaryReport= (f) => api.get('/reports/payment-summary',          { query: withRange(f) })
export const getArrangementsReport  = (f) => api.get('/reports/arrangements',             { query: withRange(f) })
export const getTestVolumeReport    = (f) => api.get('/reports/test-analytics/volume',    { query: withRange(f) })
export const getTestCategoriesReport= (f) => api.get('/reports/test-analytics/categories',{ query: withRange(f) })
export const getTestTATReport       = (f) => api.get('/reports/test-analytics/tat',       { query: withRange(f) })
