import { api } from './client'

// All endpoints share the same date-range query. `date_from` / `date_to`
// are YYYY-MM-DD (inclusive). The backend clamps `date_to` to end-of-day.
function withRange(f = {}) {
  const q = {}
  if (f.date_from) q.date_from = f.date_from
  if (f.date_to)   q.date_to   = f.date_to
  if (f.limit)     q.limit     = f.limit
  return q
}

export const getRevenueSummary  = (f) => api.get('/analytics/revenue-summary',  { query: withRange(f) })
export const getRevenueTrend    = (f) => api.get('/analytics/revenue-trend',    { query: withRange(f) })
export const getMethodBreakdown = (f) => api.get('/analytics/method-breakdown', { query: withRange(f) })
export const getReceivables     = (f) => api.get('/analytics/receivables-aging',{ query: withRange(f) })
export const getThroughput      = (f) => api.get('/analytics/throughput',       { query: withRange(f) })
export const getTopItems        = (f) => api.get('/analytics/top-items',        { query: withRange(f) })
export const getProfitability   = (f) => api.get('/analytics/profitability',    { query: withRange(f) })
