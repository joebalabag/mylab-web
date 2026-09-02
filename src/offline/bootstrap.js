// First-time cache seed. Called once per station after "Enable offline mode",
// and again in the background on the first login of each day so the local
// cache stays within the rolling window the server enforces.
//
// Bootstrap is idempotent — Dexie tables are overwritten (put) not appended,
// so re-running just refreshes stale rows. Progress events feed the UI so
// the user sees a live progress bar during the big first pull.

import { openDbFor, writeSyncState } from './db.js'

// Tables in the bootstrap payload → Dexie table names (identical here, kept
// as a map so a future rename on either side is a one-line change).
const CACHED_TABLES = [
  ['test_items',      'test_items'],
  ['item_groups',     'item_groups'],
  ['item_categories', 'item_categories'],
  ['item_packages',   'item_packages'],
  ['doctors',         'doctors'],
  ['discounts',       'discounts'],
  ['users',           'users'],
  ['patients',        'patients'],
  ['patient_cases',   'patient_cases'],
  ['patient_requisitions',      'patient_requisitions'],
  ['patient_requisition_items', 'patient_requisition_items'],
  ['payments',        'payments'],
  ['lab_reports',     'lab_reports'],
]

/**
 * Full bootstrap. `fetchBootstrap` is injected so we don't pull in the api
 * client module here (keeps this file testable with a mock).
 *
 * onProgress({ stage, table?, count?, total? }) — optional. Stages:
 *   'downloading' → server call in flight
 *   'writing'     → per-table write to Dexie
 *   'done'        → finished; state persisted
 */
export async function runBootstrap({ tenant_uuid, user_uuid, fetchBootstrap, onProgress }) {
  const db = openDbFor(tenant_uuid, user_uuid)
  const emit = (payload) => { try { onProgress?.(payload) } catch (_) {} }

  emit({ stage: 'downloading' })
  const payload = await fetchBootstrap()

  // Reference + journey data — write each table, emit per-table progress so a
  // large bootstrap surfaces smoothly in the UI instead of a single freeze.
  for (const [src, dest] of CACHED_TABLES) {
    const rows = Array.isArray(payload?.[src]) ? payload[src] : []
    if (rows.length) {
      await db.table(dest).bulkPut(rows)
    }
    emit({ stage: 'writing', table: dest, count: rows.length })
  }

  // Cache the tenant blob under sync_state (there's only one, no dedicated table).
  await writeSyncState(db, {
    tenant: payload?.tenant || null,
    last_bootstrap_at: new Date().toISOString(),
    server_time_at_bootstrap: payload?.server_time || null,
    history_days: payload?.history_days || null,
  })

  emit({ stage: 'done' })
  return payload
}

/**
 * Incremental pull. Applies the delta into Dexie the same way bootstrap does,
 * but scoped to `updated_at > since`. Called by syncEngine on reconnect and
 * on every login.
 */
export async function runPull({ tenant_uuid, user_uuid, since, fetchPull }) {
  const db = openDbFor(tenant_uuid, user_uuid)
  const payload = await fetchPull(since)

  for (const [src, dest] of CACHED_TABLES) {
    const rows = Array.isArray(payload?.[src]) ? payload[src] : []
    if (rows.length) await db.table(dest).bulkPut(rows)
  }
  await writeSyncState(db, {
    last_pull_at: new Date().toISOString(),
    server_time_at_last_pull: payload?.server_time || null,
  })
  return payload
}
