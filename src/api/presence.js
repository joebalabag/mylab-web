import { api } from './client'

// Presence — in-memory (server-side) tracker of who's currently online.
// Heartbeat: called by the offline store every ~30s per authenticated tab.
// Active users: super-admin panel query.

export function sendHeartbeat() {
  return api.post('/presence/heartbeat', {})
}

export function listActiveUsers({ minutes } = {}) {
  const query = {}
  if (minutes) query.minutes = minutes
  return api.get('/presence/active-users', { query })
}
