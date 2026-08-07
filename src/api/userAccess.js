import { api } from './client'

// Fetch a user's current access grants.
// Response shape may be one of:
//   { items:   [ { navigation_id, has_access }, ... ] }
//   { results: [ { navigation_id, has_access }, ... ] }
//   [ { navigation_id, has_access }, ... ]
//   [ navigation_id, ... ]                          — just the granted ids
export function getUserAccess(userUuid) {
  return api.get(`/user-access/for-user/${userUuid}`)
}

// Save (upsert) a user's granted access. The server expects an item for every
// navigation_id in the template — granted rows get has_access: true, revoked
// rows get has_access: false. Callers should send the full template, not just
// the deltas, so the server can persist deactivations too.
//
// items: [ { navigation_id: number, has_access: boolean }, ... ]
export function saveUserAccess(userUuid, items) {
  const body = { items: Array.isArray(items) ? items : [] }
  return api.post(`/user-access/save/${userUuid}`, body)
}
