import { api } from './client'

function buildQuery(f = {}) {
  const q = {}
  if (f.tenant_uuid)  q.tenant_uuid  = f.tenant_uuid
  if (f.entity_type)  q.entity_type  = f.entity_type
  if (f.entity_uuid)  q.entity_uuid  = f.entity_uuid
  if (f.actor_uuid)   q.actor_uuid   = f.actor_uuid
  if (f.action)       q.action       = f.action
  if (f.date_from)    q.date_from    = f.date_from
  if (f.date_to)      q.date_to      = f.date_to
  if (f.keywords)     q.keywords     = f.keywords
  if (f.page_number != null) q.page_number = f.page_number
  if (f.page_size   != null) q.page_size   = f.page_size
  return q
}

export const listAuditLogs       = (f) => api.get('/audit-log/dashboard',       { query: buildQuery(f) })
export const listEntityHistory   = (type, uuid) => api.get(`/audit-log/entity/${encodeURIComponent(type)}/${encodeURIComponent(uuid)}`)
export const listSuperAuditLogs  = (f) => api.get('/super/audit-log/dashboard', { query: buildQuery(f) })
