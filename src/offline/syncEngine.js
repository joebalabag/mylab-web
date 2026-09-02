// The sync orchestrator. Runs one job at a time per tab (a mutex ensures
// two triggers — say a manual retry + the online-event auto-trigger — don't
// race). Job pipeline:
//   1. refresh offline token (also proves the device isn't revoked)
//   2. incremental pull   (so reference data is fresh before we replay)
//   3. drain outbox       (one batch at a time, applying per-entry results)
//   4. emit summary
//
// The engine is UI-agnostic — it fires events via `on()`; the Pinia store
// subscribes and mirrors state into reactivity for the badge + panel.

import { openDbFor, readSyncState, writeSyncState } from './db.js'
import { runPull } from './bootstrap.js'
import {
  applyResult, counts, handleTransientFailure, markSyncing, nextBatch, reviveOrphans,
} from './outbox.js'

// Simple pub/sub — no external event-emitter dependency.
function createBus() {
  const listeners = new Set()
  return {
    on(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    emit(event, data) { for (const fn of listeners) { try { fn(event, data) } catch (_) {} } },
  }
}

export function createSyncEngine({ tenant_uuid, user_uuid, api }) {
  // `api` is the offline API surface: { refresh, pull, sync }. Injected so
  // tests can swap in fakes without touching the fetch client.
  const bus = createBus()
  let running = false
  let paused = false

  async function drainOnce() {
    if (running) { bus.emit('skip', { reason: 'busy' }); return { ok: true, skipped: true } }
    if (paused)  { bus.emit('skip', { reason: 'paused' }); return { ok: true, skipped: true } }
    running = true
    const db = openDbFor(tenant_uuid, user_uuid)
    const summary = { refreshed: false, pulled: false, synced: 0, errors: 0, conflicts: 0 }

    try {
      bus.emit('start')

      // 1. Refresh — also acts as the "am I still allowed offline?" check.
      try {
        const refreshed = await api.refresh({ device_clock: new Date().toISOString() })
        summary.refreshed = true
        if (refreshed?.skew_warning) {
          bus.emit('clock-skew', { seconds: refreshed.clock_skew_seconds })
        }
      } catch (err) {
        bus.emit('refresh-failed', { message: err?.message || 'refresh failed' })
        // Fatal for this run — without a valid token nothing else will work.
        return { ok: false, error: err?.message || 'refresh failed' }
      }

      // 2. Pull latest reference + journey data.
      try {
        const state = await readSyncState(db)
        const since = state?.last_pull_at || new Date(0).toISOString()
        await runPull({ tenant_uuid, user_uuid, since, fetchPull: api.pull })
        summary.pulled = true
        bus.emit('pulled')
      } catch (err) {
        bus.emit('pull-failed', { message: err?.message || 'pull failed' })
        // Non-fatal — we can still try to push local writes. The next tick
        // will retry the pull.
      }

      // 3. Drain outbox. Any 'syncing' rows left over from a killed tab are
      //    revived to 'pending' first.
      await reviveOrphans(db)

      // Drain-until-empty, one batch at a time. If a batch call fails hard
      // (network drop), bounce out — the online watchdog will trigger us
      // again shortly. Individual entry errors just apply their result and
      // move on.
      while (true) {
        const batch = await nextBatch(db)
        if (!batch.length) break
        const ids = batch.map((r) => r.id)
        await markSyncing(db, ids)

        let response
        try {
          response = await api.sync({
            entries: batch.map((r) => ({
              entity_type: r.entity_type,
              client_uuid: r.client_uuid,
              idempotency_key: r.idempotency_key,
              created_offline_at: r.created_at,
              payload: r.payload,
            })),
          })
        } catch (err) {
          // Whole-batch failure — put the batch back to pending with an
          // incremented attempt counter and bail on this run.
          for (const row of batch) await handleTransientFailure(db, row.id, err)
          bus.emit('batch-failed', { message: err?.message || 'sync failed' })
          break
        }

        const resultsByKey = new Map((response?.results || []).map((r) => [r.idempotency_key, r]))
        for (const row of batch) {
          const result = resultsByKey.get(row.idempotency_key)
          if (!result) {
            await handleTransientFailure(db, row.id, new Error('no result for entry'))
            continue
          }
          await applyResult(db, row.id, result)
          if (result.status === 'ok' || result.status === 'duplicate') summary.synced += 1
          else if (result.status === 'conflict') summary.conflicts += 1
          else summary.errors += 1
        }
        bus.emit('batch-done', { count: batch.length })
      }

      await writeSyncState(db, { last_sync_at: new Date().toISOString() })
      const c = await counts(db)
      bus.emit('done', { summary, counts: c })
      return { ok: true, summary, counts: c }
    } finally {
      running = false
    }
  }

  return {
    on: bus.on,
    isRunning: () => running,
    pause() { paused = true },
    resume() { paused = false },
    drainOnce,
  }
}
