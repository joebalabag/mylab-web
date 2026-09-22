// The offline write journal. Every mutation captured while offline lands
// here as a pending row; the sync engine drains them in insertion order
// when connectivity returns.
//
// Row shape:
//   id                  — auto-incrementing key (drain order)
//   status              — 'pending' | 'syncing' | 'done' | 'error' | 'conflict'
//   entity_type         — 'patient' | 'patient_case' | 'payment' | 'lab_report_results'
//   client_uuid         — matches the tentative uuid used in Dexie's domain tables
//   idempotency_key     — server-side dedupe token; stable across retries
//   payload             — the exact body we'll POST to /offline/sync
//   created_at          — device wall-clock (ISO), used as created_offline_at
//   attempts            — retry counter
//   last_error          — most recent error message, if any
//   server_uuid         — filled in on successful sync
//   server_row          — snapshot the server returned, for post-sync UI refresh

import { newIdempotencyKey } from './uuid.js'

const MAX_BATCH = 50   // /offline/sync accepts up to 200; keep batches small
                       // so a single flake doesn't cost the whole queue.
const MAX_RETRIES = 8  // exponential backoff caps the retries; after this the
                       // row stays 'error' until the user manually retries.

/** Append a new pending entry. Returns the assigned row id. */
export async function enqueue(db, { entity_type, client_uuid, payload }) {
  const now = new Date().toISOString()
  const row = {
    status: 'pending',
    entity_type,
    client_uuid,
    idempotency_key: newIdempotencyKey(),
    payload,
    created_at: now,
    attempts: 0,
    last_error: null,
    server_uuid: null,
    server_row: null,
  }
  return db.table('outbox').add(row)
}

/** Count of rows in each terminal / transient state — for the status badge. */
export async function counts(db) {
  const rows = await db.table('outbox').toArray()
  const out = { pending: 0, syncing: 0, done: 0, error: 0, conflict: 0, total: rows.length }
  for (const r of rows) out[r.status] = (out[r.status] || 0) + 1
  return out
}

/** Next batch to drain — oldest pending first, capped at MAX_BATCH. */
export async function nextBatch(db) {
  return db
    .table('outbox')
    .where('status').equals('pending')
    .limit(MAX_BATCH)
    .sortBy('id')
}

/** Flip a batch of rows to 'syncing' so a second drain doesn't double-send. */
export async function markSyncing(db, ids) {
  if (!ids.length) return
  await db.transaction('rw', db.table('outbox'), async () => {
    for (const id of ids) {
      await db.table('outbox').update(id, { status: 'syncing' })
    }
  })
}

/** Apply a server result to a single outbox row. Called per entry after sync. */
export async function applyResult(db, id, result) {
  const patch = {
    status: result.status === 'ok' || result.status === 'duplicate' ? 'done' : result.status,
    server_uuid: result.server_uuid ?? null,
    server_row: result.server_row ?? null,
    last_error: result.error ?? null,
  }
  await db.table('outbox').update(id, patch)
}

/**
 * Requeue rows that ended up 'syncing' but never got a terminal result —
 * network dropped mid-request, tab closed, etc. Called on syncEngine boot
 * so orphans don't rot in the queue forever.
 */
export async function reviveOrphans(db) {
  const orphans = await db.table('outbox').where('status').equals('syncing').toArray()
  for (const row of orphans) {
    await db.table('outbox').update(row.id, { status: 'pending' })
  }
  return orphans.length
}

/**
 * Bump the retry counter and either requeue or park the row. Errors that
 * look transient (network) requeue as pending; others land at 'error' for
 * the user to inspect + retry manually.
 */
export async function handleTransientFailure(db, id, err) {
  const row = await db.table('outbox').get(id)
  if (!row) return
  const attempts = (row.attempts || 0) + 1
  if (attempts >= MAX_RETRIES) {
    await db.table('outbox').update(id, {
      status: 'error',
      attempts,
      last_error: String(err?.message || err || 'sync failed'),
    })
    return
  }
  await db.table('outbox').update(id, {
    status: 'pending',
    attempts,
    last_error: String(err?.message || err || 'sync failed'),
  })
}

/** Reset a stuck 'error' row to 'pending' — used by the manual retry button. */
export async function retryEntry(db, id) {
  const row = await db.table('outbox').get(id)
  if (!row) return
  await db.table('outbox').update(id, { status: 'pending', attempts: 0, last_error: null })
}

/** Purge synced rows older than N days — keeps the outbox from growing forever. */
export async function purgeDone(db, olderThanDays = 30) {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString()
  const rows = await db.table('outbox')
    .where('status').anyOf(['done'])
    .and((r) => r.created_at < cutoff)
    .toArray()
  for (const r of rows) await db.table('outbox').delete(r.id)
  return rows.length
}

/** Every entry ever — for the sync panel's history view. */
export async function listAll(db) {
  return db.table('outbox').orderBy('id').reverse().toArray()
}
