import { api } from './client'

// Server-authoritative subscription cycle history for a tenant. Each row is one
// activated subscription period (start → end + amount + source payment).
export function listForTenant(tenantUuid) {
  return api.get(`/tenant-subscription-history/for-tenant/${tenantUuid}`)
}
