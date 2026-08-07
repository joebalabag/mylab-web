// Prepend the active terminal number to a record's ref in-place, so displays
// and printed receipts show "1-TX000026" instead of "TX000026".
//
// Client-side augmentation only — the backend DTOs do not currently accept a
// terminal_uuid on transaction / held-order create, so a fetched historical
// record cannot be reliably prefixed (we don't know which terminal it came
// from). This helper stamps *new* records created in the current session.

const ALREADY_PREFIXED = /^\d+-/

export function stampTerminalRef(rec, terminalNumber) {
  if (!rec || typeof rec !== 'object' || !rec.ref) return rec
  if (terminalNumber == null || terminalNumber === '') return rec
  const n = String(terminalNumber).trim()
  if (!n) return rec
  if (ALREADY_PREFIXED.test(rec.ref)) return rec
  rec.ref = `${n}-${rec.ref}`
  return rec
}
