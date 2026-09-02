// Thin client for the /offline/* endpoints. Uses the same `api` fetch wrapper
// as the rest of the app, so bearer auth, warnings, and 401 handling are
// consistent. When offline mode is active, callers hand a long-lived
// offline JWT to setToken() via the auth store — nothing special needed
// here beyond the routes.

import { api } from './client.js'

export function enableOfflineDevice({ device_id, device_label, user_agent }) {
  return api.post('/offline/enable', { device_id, device_label, user_agent })
}

export function refreshOfflineToken({ device_id, device_clock }) {
  return api.post('/offline/refresh', { device_id, device_clock })
}

export function fetchOfflineBootstrap() {
  return api.get('/offline/bootstrap')
}

export function fetchOfflinePull(since) {
  return api.get('/offline/pull', { query: { since } })
}

export function postOfflineSync({ device_id, entries }) {
  return api.post('/offline/sync', { device_id, entries })
}

export function listOfflineDevices() {
  return api.get('/offline/devices')
}

export function revokeOfflineDevice(uuid, reason) {
  return api.post(`/offline/devices/${uuid}/revoke`, { reason })
}
