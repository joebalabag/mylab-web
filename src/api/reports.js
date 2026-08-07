import { api } from './client'

function withRange(f = {}) {
  const q = {}
  if (f.date_from)  q.date_from  = f.date_from
  if (f.date_to)    q.date_to    = f.date_to
  if (f.created_by) q.created_by = f.created_by
  if (f.category)   q.category   = f.category
  if (f.limit)      q.limit      = f.limit
  return q
}
function withYear(f = {}) {
  const q = {}
  if (f.year) q.year = f.year
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
export const getTestVolumeReport    = (f) => api.get('/reports/test-analytics/volume',    { query: withRange(f) })
export const getTestCategoriesReport= (f) => api.get('/reports/test-analytics/categories',{ query: withRange(f) })
export const getTestTATReport       = (f) => api.get('/reports/test-analytics/tat',       { query: withRange(f) })
