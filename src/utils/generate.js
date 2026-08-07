// Small helpers for generating login credentials for auto-provisioned accounts.
// Ambiguous characters (0/O, 1/l/I) are excluded so people can read them off a screen.
const PASS_CHARS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function randomPassword(len = 10) {
  const buf = new Uint32Array(len)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(buf)
  } else {
    for (let i = 0; i < len; i++) buf[i] = Math.floor(Math.random() * 0xffffffff)
  }
  let out = ''
  for (let i = 0; i < len; i++) out += PASS_CHARS[buf[i] % PASS_CHARS.length]
  return out
}

// Build a stable, sanitized admin username from a tenant code, avoiding duplicates.
// `existingUsernames` is a Set of lowercased usernames already in use.
export function makeAdminUsername(tenantCode, existingUsernames) {
  const cleaned = String(tenantCode || 'store').toLowerCase().replace(/[^a-z0-9]/g, '')
  const base = 'admin.' + (cleaned || 'store')
  if (!existingUsernames.has(base)) return base
  let n = 2
  while (existingUsernames.has(`${base}${n}`)) n++
  return `${base}${n}`
}
