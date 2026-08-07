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
