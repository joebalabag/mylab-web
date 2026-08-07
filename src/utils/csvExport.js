/**
 * Minimal CSV exporter. `rows` is an array of plain objects; `columns` is an
 * ordered array of { key, label } (label defaults to key). Values are
 * stringified and CSV-escaped (quotes doubled, whole field wrapped in quotes
 * when it contains commas / quotes / newlines).
 *
 * Triggers a browser download of the built CSV file. No server round-trip.
 */
export function exportCsv(filename, rows, columns) {
  const cols = (columns && columns.length)
    ? columns.map(c => (typeof c === 'string' ? { key: c, label: c } : c))
    : Object.keys(rows[0] || {}).map(k => ({ key: k, label: k }))

  const esc = (v) => {
    if (v === null || v === undefined) return ''
    const s = typeof v === 'number' ? String(v) : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = cols.map(c => esc(c.label)).join(',')
  const body   = rows.map(r => cols.map(c => esc(r[c.key])).join(',')).join('\r\n')
  const csv    = header + '\r\n' + body

  // BOM so Excel treats it as UTF-8.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 500)
}

export function printReport() {
  window.print()
}
