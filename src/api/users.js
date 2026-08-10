import { api } from './client'

// Dashboard list (admin token). Filters honored on the server:
//   tenant_uuid, status[], keywords, page_number, page_size
// (date_from/date_to intentionally NOT sent from the UI)
export function listUsers(filters = {}) {
  const query = {}
  if (filters.tenant_uuid) query.tenant_uuid = filters.tenant_uuid
  if (filters.keywords)    query.keywords    = filters.keywords
  if (Array.isArray(filters.status) && filters.status.length) query.status = filters.status
  query.page_number = filters.page_number ?? 0   // 0 = return all
  query.page_size   = filters.page_size   ?? 0
  return api.get('/user/dashboard', { query })
}

export function viewUser(uuid) {
  return api.get(`/user/view/${uuid}`)
}

// Lightweight availability probe for the create-user form's onblur check.
// Returns { available: bool, reason?: 'too_short' }.
export function checkUsernameAvailable(username) {
  return api.get('/user/username-available', { query: { username } })
}

export function createUser(payload) {
  return api.post('/user/create', payload)
}

export function updateUser(uuid, payload) {
  return api.patch(`/user/update/${uuid}`, payload)
}

export function deleteUser(uuid) {
  return api.delete(`/user/delete/${uuid}`)
}

export function setUserStatus(uuid, status) {
  return api.patch(`/user/set-status/${uuid}`, { status })
}

// Admin resetting a user's password from the dashboard (no old password required).
export function changeUserPassword(uuid, password, confirm_password) {
  return api.patch(`/user/change-password/${uuid}`, { password, confirm_password })
}

// Supervisor-credential check, tenant-scoped by the caller's user token.
// Server whitelists admin/manager roles by default (see
// UserService.verifyCredentials). Used by override flows — void authorization
// primarily — where a cashier must not be able to self-authorize.
//
// `skipUnauthorizedHandler: true` — a wrong supervisor password returns 401
// but the currently-signed-in cashier's session is still valid. Without
// this flag the global 401 handler would log the cashier out on every failed
// authorization attempt.
export function verifyCredentials(username, password) {
  return api.post(
    '/user/verify-credentials',
    { username, password },
    { skipUnauthorizedHandler: true },
  )
}

// Any-role variant — accepts every active tenant user regardless of role.
// Purpose: light "prove you know a valid password" gate for low-stakes
// actions (manual cash-drawer kick) where the supervisor requirement
// would just annoy small shops without any real security benefit. Still
// requires a real password check so a walk-in stranger can't kick the
// register open, but the cashier signed in can approve their own action.
export function verifyCredentialsAnyRole(username, password) {
  return api.post(
    '/user/verify-credentials',
    { username, password, allow_any_role: true },
    { skipUnauthorizedHandler: true },
  )
}
