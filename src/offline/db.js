// IndexedDB schema for offline mode. Owns:
//   - Cached reference data (test items, doctors, discounts, etc.) so the
//     forms can render without the network.
//   - Rolling window of patient / patient_case / payment / lab_report rows
//     so lookup screens work airplane-mode.
//   - `outbox` — every write captured while offline, drained by syncEngine
//     when connectivity returns.
//   - `sync_state` — per-tenant metadata: device_id, offline_token, last
//     bootstrap / pull cursors, error trail.
//
// Table naming stays plural to match the server response shape 1:1 — makes
// bootstrap ingestion a straight for-loop, no key mapping.

import Dexie from 'dexie'

// One database per user + tenant. That keeps a shared workstation clean when
// two staff log in on the same browser — the second user opens their own DB,
// never sees the first user's cached patients or outbox. Actual DB name is
// resolved lazily by openDbFor().
const DB_PREFIX = 'mylab_offline'

// Schema version. Bump whenever an indexed store changes; Dexie applies
// upgrades in order on next open. The initial ship uses v1 across the board.
const SCHEMA_V1 = {
  // Reference data — keyed by server uuid. Indexed on tenant_uuid + a
  // status-ish column when it helps the lookup screens filter without a
  // full-table scan.
  test_items:      'uuid, tenant_uuid, code, status',
  item_groups:     'uuid, tenant_uuid',
  item_categories: 'uuid, tenant_uuid',
  item_packages:   'uuid, tenant_uuid',
  doctors:         'uuid, tenant_uuid, status',
  discounts:       'uuid, tenant_uuid, status',
  users:           'uuid, tenant_uuid, username',

  // Journey data — dual-indexed by uuid AND client_uuid so lookups by either
  // side resolve without a scan. Server uuid stays authoritative once known;
  // client_uuid persists for the outbox → server correlation.
  patients:        'uuid, client_uuid, tenant_uuid, patient_number, [tenant_uuid+last_name], updated_at',
  patient_cases:   'uuid, client_uuid, tenant_uuid, patient_uuid, case_number, updated_at',
  payments:        'uuid, client_uuid, tenant_uuid, patient_case_uuid, payment_number, updated_at',
  lab_reports:     'uuid, client_uuid, tenant_uuid, patient_case_uuid, lab_number, status, updated_at',
  // Full-detail lab report snapshots (items + values). Populated on demand
  // when a report is opened online, so the tech can enter typed values
  // offline against the freshest structure. Keyed by report uuid.
  lab_report_details: 'uuid, tenant_uuid, updated_at',

  // Outbox — auto-incrementing id so drain order matches capture order.
  // Composite index on (status, id) supports the "give me next N pending"
  // query without an in-memory sort.
  outbox: '++id, status, entity_type, client_uuid, idempotency_key, [status+id], created_at',

  // Sync state — single row keyed by 'current'. Small enough that a full
  // rewrite on every update is cheaper than a normalized store.
  sync_state: 'key',
}

// Cache open handles per DB name — Dexie tolerates multiple opens but
// creating one per request is wasteful.
const openHandles = new Map()

/** Compose the DB name for a given (tenant, user) pair. */
export function dbNameFor(tenant_uuid, user_uuid) {
  return `${DB_PREFIX}::${tenant_uuid || 'none'}::${user_uuid || 'none'}`
}

/**
 * Open (or reuse) the Dexie handle for a given user+tenant. Idempotent —
 * safe to call from any store initializer or composable.
 */
export function openDbFor(tenant_uuid, user_uuid) {
  const name = dbNameFor(tenant_uuid, user_uuid)
  const cached = openHandles.get(name)
  if (cached) return cached

  const db = new Dexie(name)
  db.version(1).stores(SCHEMA_V1)
  openHandles.set(name, db)
  return db
}

/** Close and forget every open handle. Used on logout. */
export async function closeAll() {
  for (const [, db] of openHandles) {
    try { db.close() } catch (_) { /* already closed */ }
  }
  openHandles.clear()
}

/**
 * Nuke a specific offline DB — e.g. when an admin revokes the device or the
 * user explicitly wants to start over. Frees storage immediately.
 */
export async function deleteDbFor(tenant_uuid, user_uuid) {
  const name = dbNameFor(tenant_uuid, user_uuid)
  const db = openHandles.get(name)
  if (db) { try { db.close() } catch (_) {} openHandles.delete(name) }
  try { await Dexie.delete(name) } catch (_) { /* ignore */ }
}

/** Convenience — pull the single-row sync state, applying defaults. */
export async function readSyncState(db) {
  const row = await db.table('sync_state').get('current')
  return row || { key: 'current' }
}

export async function writeSyncState(db, patch) {
  const current = await readSyncState(db)
  const next = { ...current, ...patch, key: 'current' }
  await db.table('sync_state').put(next)
  return next
}
