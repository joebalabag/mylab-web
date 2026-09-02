// Tiny wrappers over crypto.randomUUID so callers don't sprinkle globals.
// `randomUUID` is present in every browser we support (Chrome 92+ / iOS 15+),
// but the standard-library check keeps us honest if that ever shifts.

const hasNative = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'

export function newUuid() {
  if (hasNative) return crypto.randomUUID()
  // Manual v4 as a last resort — good enough for client_uuid + idempotency_key
  // uniqueness; server treats them as opaque strings anyway.
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

// A dedicated idempotency key generator so we can swap in a prefix scheme
// later without hunting call sites.
export function newIdempotencyKey() { return newUuid() }
