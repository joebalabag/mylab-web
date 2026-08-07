import { api } from './client'

export function userLogin(username, password) {
  return api.post('/auth/user/login', { username, password })
}

export function adminLogin(username, password) {
  return api.post('/auth/admin/login', { username, password })
}

// Manager override — verify a supervisor's credentials for sensitive ops
// (voiding a payment, discount override) without issuing a new token. The
// verified user must be an admin/manager of the current tenant.
export function verifyManager(username, password) {
  return api.post('/auth/verify-manager', { username, password })
}

// User side — requires user token, verifies old_password server-side.
export function changeOwnPassword({ old_password, password, confirm_password }) {
  return api.patch('/user/profile/change-password', {
    old_password,
    password,
    confirm_password
  })
}

// Super-admin side — requires admin token, verifies old_password server-side.
export function changeOwnAdminPassword({ old_password, password, confirm_password }) {
  return api.patch('/admin/profile/change-password', {
    old_password,
    password,
    confirm_password
  })
}
