import { api } from './client'

// POST /ai-extraction/receipt — multipart with a single `file` field.
// Returns { file_url, filename, original_name, size_bytes, mime_type, extraction? }
// where extraction (when present) has:
//   payment_reference_number, payee_account_number, payment_method,
//   payment_method_name, payment_datetime, confidence, raw
export function extractReceipt(file) {
  const fd = new FormData()
  fd.append('file', file)
  return api.post('/ai-extraction/receipt', fd, { isMultipart: true })
}
