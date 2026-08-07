// Shared helpers for parsing user-uploaded CSV / XLSX files into a rows-of-objects
// shape ready for validation. XLSX support is loaded on demand so the ~500KB
// SheetJS bundle only ships when someone actually opens the importer.

export const IMPORT_ACCEPT = '.csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// Minimal RFC-4180-ish CSV parser. Handles quoted fields, embedded commas /
// newlines, and doubled-quote escapes. Returns an array of string arrays.
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  const src = String(text).replace(/^﻿/, '')       // strip BOM
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\n' || c === '\r') {
      // Only close the row on \n or the first of \r\n. Skip the paired \n after \r.
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field); field = ''
      rows.push(row); row = []
    } else field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  // Drop trailing all-empty rows Excel likes to add.
  while (rows.length && rows[rows.length - 1].every(v => String(v).trim() === '')) rows.pop()
  return rows
}

// Read an .xlsx / .xls file with SheetJS. Loaded via dynamic import so the
// library isn't in the main bundle. Returns rows of strings.
async function parseXlsx(file) {
  const XLSX = await import('xlsx')
  const buf  = await file.arrayBuffer()
  const wb   = XLSX.read(buf, { type: 'array' })
  const ws   = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return []
  // header: 1 → 2D array; defval: '' so blank cells become '' instead of undefined
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false, blankrows: false })
}

// Public entry point: hands back a { headers, rows } shape from either a CSV or
// XLSX file. Header keys are normalized to lowercase snake_case for matching.
export async function parseImportFile(file) {
  if (!file) throw new Error('No file provided')
  const name = String(file.name || '').toLowerCase()
  let matrix
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    matrix = await parseXlsx(file)
  } else {
    const text = await file.text()
    matrix = parseCsv(text)
  }
  if (!matrix.length) return { headers: [], rows: [] }
  const headers = matrix[0].map(h => String(h ?? '').trim().toLowerCase().replace(/\s+/g, '_'))
  const rows = matrix.slice(1).map(cols => {
    const obj = {}
    headers.forEach((h, i) => { obj[h] = cols[i] == null ? '' : String(cols[i]) })
    return obj
  })
  return { headers, rows }
}

// Boolean coercion that accepts common spreadsheet cell values.
export function coerceBool(v, fallback = false) {
  if (v === true || v === false) return v
  const s = String(v ?? '').trim().toLowerCase()
  if (!s) return fallback
  if (['true','1','yes','y','t'].includes(s)) return true
  if (['false','0','no','n','f'].includes(s)) return false
  return fallback
}

// Number coercion — strips thousands separators / currency symbols.
export function coerceNumber(v, fallback = 0) {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const s = String(v ?? '').replace(/[₱$,\s]/g, '').trim()
  if (!s) return fallback
  const n = Number(s)
  return Number.isFinite(n) ? n : fallback
}
