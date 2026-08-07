// IANA timezone list for the admin panel dropdown. Uses the browser's
// `Intl.supportedValuesOf('timeZone')` when available (Chrome 99+, Safari 15.4+,
// Firefox 93+), else falls back to a curated regional list so the dropdown
// still works on older runtimes.

const FALLBACK_ZONES = [
  'Asia/Manila',
  'Asia/Singapore',
  'Asia/Kuala_Lumpur',
  'Asia/Jakarta',
  'Asia/Bangkok',
  'Asia/Ho_Chi_Minh',
  'Asia/Hong_Kong',
  'Asia/Taipei',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Australia/Sydney',
  'Australia/Perth',
  'Pacific/Auckland',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Paris',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'UTC'
]

export const DEFAULT_TIMEZONE = 'Asia/Manila'

export function allTimezones() {
  try {
    if (typeof Intl.supportedValuesOf === 'function') {
      const zones = Intl.supportedValuesOf('timeZone')
      if (Array.isArray(zones) && zones.length) return zones
    }
  } catch (_) { /* ignore */ }
  return FALLBACK_ZONES
}

export function detectTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE }
  catch { return DEFAULT_TIMEZONE }
}
