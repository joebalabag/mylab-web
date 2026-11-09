import { api } from './client'

/**
 * Phase 2 - Owner authentication + self-service.
 * All endpoints under /auth/owner/* are public (login, forgot, reset);
 * /owner/me/* require an owner bearer token.
 */

export function ownerLogin(username, password) {
  return api.post('/auth/owner/login', { username, password })
}

export function forgotOwnerPassword(username) {
  return api.post('/auth/owner/forgot-password', { username })
}

export function verifyOwnerResetToken(token) {
  return api.get('/auth/owner/reset-password/verify', { query: { token } })
}

export function resetOwnerPassword(token, new_password, confirm_password) {
  return api.post('/auth/owner/reset-password', { token, new_password, confirm_password })
}

export function getMe() {
  return api.get('/owner/me')
}

export function updateMyProfile(patch) {
  return api.patch('/owner/me', patch)
}

export function changeMyPassword(old_password, password) {
  return api.patch('/owner/me/change-password', {
    old_password,
    password,
    confirm_password: password,
  })
}

export function uploadMyLogo(file) {
  const fd = new FormData()
  fd.append('logo', file)
  return api.post('/owner/me/logo', fd, { isMultipart: true })
}

export function clearMyLogo() {
  return api.delete('/owner/me/logo')
}
