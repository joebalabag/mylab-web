import { api } from './client'

// Public tenant self-registration. No auth header required — the endpoint
// creates a PENDING tenant record and (server-side) queues a verification
// email to the contact address.
//
// payload: {
//   store_name,       // Store name (required)
//   contact_email,    // Owner email — used for verification + admin login
//   contact_number?,  // Optional phone
//   owner_name?,      // Person signing the account up
//   city?,
//   province?,
//   country?,
//   timezone?         // Client-detected IANA zone (silent hint from browser)
// }
//
// The client omits the Authorization header automatically when no token is
// set, so no special "public" flag is needed.
export function registerTenant(payload) {
  const body = {}
  for (const [k, v] of Object.entries(payload || {})) {
    if (v === undefined || v === null || v === '') continue
    body[k] = v
  }
  return api.post('/public/tenant/register', body)
}

// Confirm an email verification token. Called from the /verify frontend route
// which receives the token as a query param on the email click-through link.
//
// Success response is expected to include enough info to personalize the
// "You're verified" screen:
//   { email, store_name, ... }
// On failure the client throws an Error whose message carries the reason.
export function verifyRegistration(token) {
  return api.post('/public/tenant/verify', { token })
}

// Ask the server to resend the verification email for a pending account.
// The endpoint deliberately returns generic success even for unknown /
// already-verified addresses so we don't leak account existence — treat
// any 2xx response as "attempted; check the inbox". Rate-limited server-side.
export function resendVerification(contactEmail) {
  return api.post('/public/tenant/resend-verification', {
    contact_email: String(contactEmail || '').trim()
  })
}

// Active trial (free) subscription plans offered on the register page. No
// auth — the register form calls this on mount to populate the plan picker.
// Server returns minimal fields the picker needs (see PublicSubscriptionPlanController).
export function listPublicTrials() {
  return api.get('/public/subscription-plan/trials')
}

// All active subscription plans (trial + paid) for the marketing landing page.
// Same field shape as listPublicTrials plus `is_trial` so the pricing grid can
// badge free plans. No auth.
export function listPublicPlans() {
  return api.get('/public/subscription-plan/list')
}
