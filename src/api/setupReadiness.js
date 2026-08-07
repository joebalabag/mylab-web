import { api } from './client'

export function getSetupReadinessStatus() {
  return api.get('/setup-readiness/status')
}
