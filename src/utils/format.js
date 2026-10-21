// Strip anything that isn't a lowercase letter, digit, hyphen, or underscore.
// Used by the username inputs across the user-creation forms (tenant staff,
// super admins, super-admin-editing-tenant-user) to enforce a consistent
// identifier format and avoid characters that break shell escaping, URL
// paths, email local-parts, etc. Lowercases so "JDCruz" → "jdcruz".
export const sanitizeUsername = (v) =>
  String(v ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '')

// Compound-surname particles that attach to the surname rather than being
// treated as given names. "Juan de la Cruz" → surname "de la Cruz", not three
// separate name tokens.
const SURNAME_PARTICLES = new Set([
  'de', 'del', 'dela', 'delos', 'delas',
  'la', 'las', 'los',
  'van', 'der', 'von',
  'da', 'do', 'dos', 'di', 'du',
  'san', 'santa',
])

// Suggest a base username from a full name using the "initials + surname" rule:
//   Juan de la Cruz        → jdelacruz
//   Juan Miguel de la Cruz → jmdelacruz
//   James Mike Bond        → jmbond
// Returns a lowercased [a-z0-9]+ string, or '' when the input has no usable
// letters. Callers should probe for uniqueness and append a numeric suffix
// when the base is taken.
// Combining-diacritics block (U+0300–U+036F). Written via RegExp + escape
// sequence so this file stays plain ASCII and travels safely through editors
// and build pipelines.
const DIACRITICS_RE = new RegExp('[\\u0300-\\u036f]', 'g')

export function suggestUsername(fullName) {
  const normalized = String(fullName ?? '')
    .normalize('NFD')
    .replace(DIACRITICS_RE, '')
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return ''
  const tokens = normalized.split(' ').filter(Boolean)
  if (tokens.length === 0) return ''
  if (tokens.length === 1) return tokens[0].replace(/[^a-z0-9]/g, '')

  // Walk backward from the last token, absorbing surname particles.
  let surnameStart = tokens.length - 1
  while (surnameStart > 1 && SURNAME_PARTICLES.has(tokens[surnameStart - 1])) {
    surnameStart--
  }
  const givenNames = tokens.slice(0, surnameStart)
  const surnameTokens = tokens.slice(surnameStart)
  const initials = givenNames.map(t => t[0] || '').join('')
  const surname = surnameTokens.join('').replace(/[^a-z0-9]/g, '')
  return (initials + surname).replace(/[^a-z0-9]/g, '')
}

export const money = (n) => {
  const v = Number(n || 0)
  return '₱' + v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export const number = (n) => Number(n || 0).toLocaleString('en-PH')

// Build a "YYYY-MM-DD" string from a Date's LOCAL calendar day. Using
// toISOString() slices the UTC date, which rolls over ~8 hours early in
// Manila and shows yesterday's date after midnight — always use this.
function toLocalISO(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Today's calendar date in the browser's local timezone as "YYYY-MM-DD".
export const todayISO = () => toLocalISO(new Date())

// Today minus N days as "YYYY-MM-DD" (still in local time).
export const daysAgoISO = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - Number(n || 0))
  return toLocalISO(d)
}

export const dateOnly = (d) => {
  if (!d) return ''
  const parsed = d instanceof Date ? d : new Date(d)
  if (isNaN(parsed.getTime())) return ''
  return toLocalISO(parsed)
}

// Parse a value the API may return (Date, ISO string, or "YYYY-MM-DD HH:mm:ss+08:00").
// Returns null when the input is missing or unparseable.
function parseDate(v) {
  if (v == null || v === '') return null
  const d = v instanceof Date ? v : new Date(v)
  return isNaN(d.getTime()) ? null : d
}

// Full 12-hour datetime: "Jul 3, 2026, 3:47:12 PM"
export const formatDateTime = (v, fallback = '—') => {
  const d = parseDate(v)
  if (!d) return fallback
  return d.toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit',
    hour12: true
  })
}

// Date only: "Jul 3, 2026"
export const formatDate = (v, fallback = '—') => {
  const d = parseDate(v)
  if (!d) return fallback
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

// Time only: "3:47 PM"
export const formatTime = (v, fallback = '—') => {
  const d = parseDate(v)
  if (!d) return fallback
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}
