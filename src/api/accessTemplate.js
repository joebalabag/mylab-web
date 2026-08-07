import { api } from './client'

// Full access-template rows. Server usually returns everything in one call —
// the pagination surface is here for symmetry with the other dashboards.
// Filters honored server-side (best-effort): keywords, catalog, page_number, page_size.
export function listAccessTemplate(filters = {}) {
  const query = {}
  if (filters.keywords) query.keywords = filters.keywords
  if (filters.catalog)  query.catalog  = filters.catalog
  query.page_number = filters.page_number ?? 0
  query.page_size   = filters.page_size   ?? 0
  return api.get('/access-template/dashboard', { query })
}
