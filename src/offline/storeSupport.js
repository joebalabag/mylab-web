// Shared building blocks for the domain stores (patients, patient_cases,
// payments, laboratory) to route reads and writes through Dexie + the
// outbox when the station is offline. Keeping this in one place means the
// four domain stores can be rewritten with a nearly-identical shape and
// bug fixes only need to land once.
//
// Design contract:
//   isOffline()          — snapshot the offline store's current mode
//   getDb()              — resolve the Dexie handle for the active tenant/user
//   queueCreate(...)     — enqueue an outbox entry + optimistic Dexie insert
//   mirrorRows(...)      — write server rows into Dexie so a follow-up
//                          offline session sees the freshest snapshot
//   assertOnline(action) — throw a friendly error when a write path can't
//                          run offline (edits, deletes, status changes)

import { openDbFor } from './db.js'
import { enqueue } from './outbox.js'
import { newUuid } from './uuid.js'
import { useOfflineStore } from '../stores/offline.js'
import { useAuthStore } from '../stores/auth.js'

export function isOffline() {
  return useOfflineStore().isOffline
}

export function offlineMode() {
  return useOfflineStore().mode
}

/**
 * True only when this station has enabled offline mode AND is currently
 * offline. Every domain-store branch that routes through Dexie should
 * gate on this — plain online sessions never touch IndexedDB.
 */
export function shouldRouteThroughOfflineStack() {
  const offline = useOfflineStore()
  return offline.isEnabled && offline.isOffline
}

export function getDb() {
  const auth = useAuthStore()
  return openDbFor(auth.tenantUuid, auth.user?.uuid)
}

/**
 * Refuse a write that can't be replayed by the sync engine. The message
 * mirrors the /offline/USER_MANUAL wording so operators recognise it.
 */
export function assertOnline(action = 'this action') {
  if (shouldRouteThroughOfflineStack()) {
    const err = new Error(`Cannot ${action} while offline. Reconnect to continue.`)
    err.code = 'OFFLINE_UNSUPPORTED'
    throw err
  }
}

/**
 * Persist server rows into Dexie so subsequent offline reads see them.
 * Called from every online read path — cheap, idempotent bulkPut.
 */
export async function mirrorRows(table, rows) {
  if (!rows || !rows.length) return
  const offline = useOfflineStore()
  if (!offline.isEnabled) return
  try {
    const db = getDb()
    await db.table(table).bulkPut(rows)
  } catch (_) {
    // Never let a mirror failure surface to the caller — the online read
    // already succeeded; the Dexie miss just means the offline snapshot
    // stays as stale as it was.
  }
}

/**
 * Optimistically add an offline-created row to Dexie AND enqueue it in the
 * outbox. Returns the tentative row (already stamped with client_uuid /
 * created_offline_at) so the caller can push it into local Pinia state.
 *
 * `payload` is the same body the online endpoint would receive — the sync
 * dispatcher on the server re-uses the domain create service, so shape
 * parity keeps both paths honest.
 */
export async function queueCreate({ table, entity_type, payload, extraFields = {} }) {
  const auth = useAuthStore()
  const db = getDb()
  const client_uuid = newUuid()
  const now = new Date().toISOString()

  const optimistic = {
    ...payload,
    ...extraFields,
    uuid: client_uuid,
    client_uuid,
    tenant_uuid: auth.tenantUuid,
    created_offline_at: now,
    created_at: now,
    updated_at: now,
    status: payload?.status || extraFields?.status || 'active',
    // Marker the domain UI can use to visually distinguish rows that haven't
    // synced yet (e.g. dashed border, "pending" chip).
    __pending: true,
  }

  await db.table(table).put(optimistic)
  await enqueue(db, { entity_type, client_uuid, payload: { ...payload, client_uuid } })
  // Refresh badge counts so the top-bar reflects the new pending entry.
  try { await useOfflineStore().refreshCounts() } catch (_) {}
  return optimistic
}

// ── Dexie query helpers ─────────────────────────────────────────────────
// The domain stores need a consistent "search + paginate" shape whether the
// rows come from the API or Dexie. These helpers make Dexie output look
// like the API's { results, total, page_number, page_size } envelope.

function normalizeKeyword(s) {
  return String(s || '').trim().toLowerCase()
}

/**
 * Paginate + keyword-filter an array in-memory. Cheap for the offline
 * window (weeks of a single-branch's records fit fine in memory).
 *
 * matchFn(row, kw) → boolean. Called per row; return true to include.
 */
export function paginate(rows, { page_number = 0, page_size = 0, keywords, matchFn }) {
  const kw = normalizeKeyword(keywords)
  let filtered = rows
  if (kw && typeof matchFn === 'function') {
    filtered = rows.filter((r) => matchFn(r, kw))
  }
  filtered.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
  const total = filtered.length
  const results = page_size > 0
    ? filtered.slice(page_number * page_size, page_number * page_size + page_size)
    : filtered
  return { results, total, page_number, page_size }
}
