// Thin fetch wrapper for the MyLab API.
// Envelopes: { response, message, status, warnings? }
//   - `response` is the actual payload returned to callers.
//   - `warnings` (optional) is an array of { code, text } items — non-fatal
//     issues the server wants the client to surface (e.g. "payment saved but
//     receipt failed to upload"). Delivered via setWarningsHandler.
// Auth: Bearer JWT via Authorization header.

const BASE = (import.meta.env?.VITE_API_BASE || 'http://127.0.0.1:3010/api').replace(/\/+$/, '')
// Origin (no `/api` suffix) — used to build fully-qualified URLs for static assets
// served under /public/uploads/...
const ORIGIN = BASE.replace(/\/api\/?$/, '')

// Turn a server-relative image path (e.g. "/public/uploads/products/image/2026/07/x.jpg")
// into an absolute URL the browser can load directly from the API host.
export function assetUrl(path) {
  if (!path) return ''
  if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) return path
  return ORIGIN + (path.startsWith('/') ? path : '/' + path)
}

let currentToken = null
let tokenProvider = null              // fn () => string|null, resolved per request
let onUnauthorized = null
let onWarnings    = null

export function setToken(token) { currentToken = token || null }

// Register a per-request token resolver. `main.js` uses this to look at
// the current URL and return either the staff (`pos_token`) or super-admin
// (`pos_super_token`) token freshly from localStorage. Doing it per request
// lets a user open two tabs against the two consoles without their
// module-level `setToken()` calls clobbering each other.
export function setTokenProvider(fn) { tokenProvider = typeof fn === 'function' ? fn : null }

// If a provider is registered, prefer its result; otherwise fall back to
// the module-level `currentToken` (which the auth / superAdmin stores set
// via `setToken()` on login and boot).
function activeToken() {
  if (typeof tokenProvider === 'function') {
    try { return tokenProvider() || null } catch (_) { /* fall through */ }
  }
  return currentToken
}

export function getToken() { return activeToken() }
export function setUnauthorizedHandler(fn) { onUnauthorized = typeof fn === 'function' ? fn : null }
// Called with (warnings[], context) whenever a response envelope carries a
// non-empty warnings array. Registering a handler is optional — if none is
// set the warnings are silently ignored (backward compatible).
export function setWarningsHandler(fn) { onWarnings = typeof fn === 'function' ? fn : null }
// Fired when any API call returns 403 with `message === "subscription.expired"`.
// The store-side handler flips a "forced expired" flag so the global gate
// modal shows regardless of the tenant record's cached subscription snapshot.
let onSubscriptionExpired = null
export function setSubscriptionExpiredHandler(fn) { onSubscriptionExpired = typeof fn === 'function' ? fn : null }

function buildUrl(path, query) {
  const url = new URL(BASE + (path.startsWith('/') ? path : '/' + path))
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue
      if (Array.isArray(v)) {
        if (!v.length) continue
        for (const item of v) url.searchParams.append(k, String(item))
      } else {
        url.searchParams.append(k, String(v))
      }
    }
  }
  return url.toString()
}

async function request(method, path, { body, query, headers = {}, isMultipart = false, skipUnauthorizedHandler = false } = {}) {
  const url = buildUrl(path, query)
  const finalHeaders = { ...headers }
  if (!isMultipart && body !== undefined) finalHeaders['Content-Type'] = 'application/json'
  const bearer = activeToken()
  if (bearer) finalHeaders['Authorization'] = `Bearer ${bearer}`

  const init = { method, headers: finalHeaders }
  if (body !== undefined) init.body = isMultipart ? body : JSON.stringify(body)

  let res
  try {
    res = await fetch(url, init)
  } catch (netErr) {
    const err = new Error('Cannot reach the server. Check your connection.')
    err.cause = netErr
    err.status = 0
    throw err
  }

  let payload = null
  try { payload = await res.json() } catch (_) { /* non-JSON body — ignore */ }

  // Endpoints that carry their own credentials in the body (e.g. void authorization)
  // opt out of the global session-expired handler, so a wrong authorizer password
  // doesn't kick the signed-in cashier back to the login screen.
  if (res.status === 401 && onUnauthorized && !skipUnauthorizedHandler) onUnauthorized()

  // Backend-authoritative subscription-expired signal — flip the global gate
  // regardless of the client-side cached snapshot.
  if (res.status === 403 && payload?.message === 'subscription.expired' && onSubscriptionExpired) {
    try { onSubscriptionExpired(payload) } catch (_) { /* handler errors shouldn't break the request */ }
  }

  if (!res.ok) {
    const msg = payload?.message || res.statusText || `Request failed (${res.status})`
    const err = new Error(msg)
    err.status = res.status
    err.response = payload?.response ?? null
    err.payload = payload
    // Errors can also carry warnings the client may want to surface — e.g.
    // "we returned 4xx but here's context on partial state". Handler fires
    // for both success and failure so nothing is lost.
    if (Array.isArray(payload?.warnings) && payload.warnings.length && onWarnings) {
      try { onWarnings(payload.warnings, { method, path, status: res.status, error: err }) } catch (_) {}
    }
    throw err
  }
  if (Array.isArray(payload?.warnings) && payload.warnings.length && onWarnings) {
    try { onWarnings(payload.warnings, { method, path, status: res.status }) } catch (_) {}
  }
  return payload?.response ?? null
}

export const api = {
  get:    (path, opts)       => request('GET',    path, opts),
  post:   (path, body, opts) => request('POST',   path, { ...(opts || {}), body }),
  put:    (path, body, opts) => request('PUT',    path, { ...(opts || {}), body }),
  patch:  (path, body, opts) => request('PATCH',  path, { ...(opts || {}), body }),
  delete: (path, opts)       => request('DELETE', path, opts)
}
