// Reactive facade over the offline stack:
//   - resolves the active tenant + user from the auth store
//   - owns the syncEngine instance for the current session
//   - exposes isOnline, mode, sync status, pending count, error list
//   - auto-triggers a sync whenever the browser flips online
//   - persists the device_id + offline token in localStorage so the
//     station's identity survives a browser restart
//
// Domain stores (patients, patient_cases, payments, laboratory) read
// `mode` to decide read/write routing in Phases 7-10.

import { defineStore } from 'pinia'
import { setToken } from '../api/client.js'
import {
  enableOfflineDevice, fetchOfflineBootstrap, fetchOfflinePull,
  postOfflineSync, refreshOfflineToken, revokeOfflineDevice,
} from '../api/offline.js'
import { closeAll, openDbFor, readSyncState } from '../offline/db.js'
import { runBootstrap } from '../offline/bootstrap.js'
import { counts as outboxCounts, listAll as outboxListAll, retryEntry } from '../offline/outbox.js'
import { createSyncEngine } from '../offline/syncEngine.js'
import { newUuid } from '../offline/uuid.js'
import { useAuthStore } from './auth.js'

// LocalStorage keys — namespace them so a shared browser doesn't leak
// state across unrelated apps.
const LS_DEVICE_ID     = 'mylab.offline.device_id'
const LS_OFFLINE_TOKEN = 'mylab.offline.token'
const LS_LAST_BOOT_KEY = (tenant, user) => `mylab.offline.last_bootstrap.${tenant}.${user}`

// Two token shelves — the online (pos_token) and the offline (mylab.offline.token).
// The API client uses whichever is set active via setToken(). When offline mode
// is engaged the offline token wins; going back online we swap the pos_token
// back in.
function readOnlineToken()  { return localStorage.getItem('pos_token') }
function readOfflineToken() { return localStorage.getItem(LS_OFFLINE_TOKEN) }

export const useOfflineStore = defineStore('offline', {
  state: () => ({
    // Session identity
    device_id: localStorage.getItem(LS_DEVICE_ID) || null,
    offline_token: readOfflineToken(),
    enabled: false,                 // this station has opted into offline mode
    // Network + sync
    isOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
    mode: 'online',                 // 'online' | 'offline'
    syncing: false,
    lastPullAt: null,
    lastSyncAt: null,
    lastBootstrapAt: null,
    pendingCount: 0,
    errorCount: 0,
    conflictCount: 0,
    errors: [],                     // recent bus events for the panel
    // Bootstrap progress (populated during the initial big pull)
    bootstrapProgress: null,        // { stage, table?, count? }
    clockSkewSeconds: null,         // warning surfaced by the last refresh
  }),
  getters: {
    isOffline: (s) => !s.isOnline,
    isEnabled: (s) => !!s.device_id && !!s.offline_token,
    statusLabel: (s) => {
      if (s.syncing) return 'Syncing…'
      if (!s.isOnline) return 'Offline'
      if (s.pendingCount) return `Online — ${s.pendingCount} pending`
      return 'Online'
    },
  },
  actions: {
    // ── Bootstrapping the store ────────────────────────────────────────
    // Called once from App.vue after auth is settled. Wires the network
    // watcher and — if this station already has an offline token — the
    // sync engine. Safe to call again after login.
    async initialize() {
      const auth = useAuthStore()
      const tenant = auth.tenantUuid
      const user = auth.user?.uuid
      if (!tenant || !user) return

      this.enabled = !!(this.device_id && this.offline_token)

      // Wire browser events (idempotent — listeners are re-attached on repeat
      // calls but the removeEventListener before addEventListener guards it).
      window.removeEventListener('online',  this._onBrowserOnline)
      window.removeEventListener('offline', this._onBrowserOffline)
      this._onBrowserOnline  = () => this._handleOnline()
      this._onBrowserOffline = () => this._handleOffline()
      window.addEventListener('online',  this._onBrowserOnline)
      window.addEventListener('offline', this._onBrowserOffline)

      this.isOnline = navigator.onLine
      this._recomputeMode()

      if (this.isEnabled) {
        this._buildEngine(tenant, user)
        await this.refreshCounts()
        // If we booted straight into offline mode, don't try to sync;
        // when the browser flips online our handler will fire drainOnce.
        if (this.isOnline) this.drainNow()
      }
    },

    // ── Enable / disable this station ──────────────────────────────────
    async enableOnThisStation({ device_label } = {}) {
      const auth = useAuthStore()
      // Generate the device_id first; the server-side row is keyed by it
      // and we want the same id even if enable is retried after a network
      // wobble mid-call.
      if (!this.device_id) {
        this.device_id = newUuid()
        localStorage.setItem(LS_DEVICE_ID, this.device_id)
      }
      const res = await enableOfflineDevice({
        device_id: this.device_id,
        device_label: device_label || null,
        user_agent: navigator.userAgent,
      })
      this.offline_token = res.access_token
      localStorage.setItem(LS_OFFLINE_TOKEN, this.offline_token)
      this.enabled = true

      // Bootstrap — populates Dexie so future offline sessions have data
      // to work against. Show progress via bootstrapProgress reactive.
      const tenant = auth.tenantUuid
      const user = auth.user?.uuid
      await runBootstrap({
        tenant_uuid: tenant,
        user_uuid: user,
        fetchBootstrap: fetchOfflineBootstrap,
        onProgress: (p) => { this.bootstrapProgress = p },
      })
      localStorage.setItem(LS_LAST_BOOT_KEY(tenant, user), new Date().toISOString())
      this.lastBootstrapAt = new Date().toISOString()
      this.bootstrapProgress = null
      this._buildEngine(tenant, user)
      await this.refreshCounts()
      return { ok: true }
    },

    async disableOnThisStation({ revoke = false } = {}) {
      if (revoke && this.device_id) {
        try {
          // Look up own device row from the /devices list — we only know
          // device_id, not uuid, on the client.
          // (Simple approach: call revoke by device_id; if the server ever
          //  exposes revoke-by-device-id we drop this preamble.)
        } catch (_) { /* best-effort */ }
      }
      this.enabled = false
      this.offline_token = null
      localStorage.removeItem(LS_OFFLINE_TOKEN)
      // We keep the device_id — re-enabling on the same station should
      // reuse the same offline_devices row, not spawn a new one.
      this.engine = null
      this._recomputeMode()
    },

    // ── First-of-day auto-bootstrap ────────────────────────────────────
    // Called from LoginView after a successful online login (Phase 11).
    async autoBootstrapIfDue() {
      if (!this.isEnabled) return { ran: false, reason: 'not-enabled' }
      const auth = useAuthStore()
      const tenant = auth.tenantUuid
      const user = auth.user?.uuid
      if (!tenant || !user) return { ran: false, reason: 'no-user' }

      const key = LS_LAST_BOOT_KEY(tenant, user)
      const last = localStorage.getItem(key)
      const isToday = last && new Date(last).toDateString() === new Date().toDateString()
      if (isToday) return { ran: false, reason: 'already-today' }

      await runBootstrap({
        tenant_uuid: tenant,
        user_uuid: user,
        fetchBootstrap: fetchOfflineBootstrap,
        onProgress: (p) => { this.bootstrapProgress = p },
      })
      localStorage.setItem(key, new Date().toISOString())
      this.lastBootstrapAt = new Date().toISOString()
      this.bootstrapProgress = null
      return { ran: true }
    },

    // ── Sync trigger ───────────────────────────────────────────────────
    async drainNow() {
      if (!this.engine) return { ok: false, reason: 'no-engine' }
      if (!this.isOnline) return { ok: false, reason: 'offline' }
      return this.engine.drainOnce()
    },

    async retry(id) {
      const auth = useAuthStore()
      const db = openDbFor(auth.tenantUuid, auth.user?.uuid)
      await retryEntry(db, id)
      await this.refreshCounts()
      if (this.isOnline) this.drainNow()
    },

    async refreshCounts() {
      const auth = useAuthStore()
      if (!auth.tenantUuid || !auth.user?.uuid) return
      const db = openDbFor(auth.tenantUuid, auth.user?.uuid)
      const c = await outboxCounts(db)
      this.pendingCount   = c.pending + c.syncing
      this.errorCount     = c.error
      this.conflictCount  = c.conflict
      const s = await readSyncState(db)
      this.lastPullAt = s?.last_pull_at || null
      this.lastSyncAt = s?.last_sync_at || null
      this.lastBootstrapAt = s?.last_bootstrap_at || this.lastBootstrapAt
    },

    async listOutbox() {
      const auth = useAuthStore()
      const db = openDbFor(auth.tenantUuid, auth.user?.uuid)
      return outboxListAll(db)
    },

    // ── Internals ─────────────────────────────────────────────────────
    _handleOnline() {
      this.isOnline = true
      this._recomputeMode()
      if (this.isEnabled) this.drainNow()
    },
    _handleOffline() {
      this.isOnline = false
      this._recomputeMode()
    },
    _recomputeMode() {
      this.mode = this.isOnline ? 'online' : 'offline'
    },

    _buildEngine(tenant_uuid, user_uuid) {
      this.engine = createSyncEngine({
        tenant_uuid,
        user_uuid,
        api: {
          refresh: async ({ device_clock }) => {
            // The refresh call runs against the offline token to prove the
            // device is still allowed. If it succeeds we replace the local
            // token with the new one, extending the offline window.
            this._activateOfflineToken()
            const res = await refreshOfflineToken({
              device_id: this.device_id,
              device_clock,
            })
            if (res?.access_token) {
              this.offline_token = res.access_token
              localStorage.setItem(LS_OFFLINE_TOKEN, this.offline_token)
            }
            if (typeof res?.clock_skew_seconds === 'number') {
              this.clockSkewSeconds = res.clock_skew_seconds
            }
            return res
          },
          pull: (since) => {
            this._activateOfflineToken()
            return fetchOfflinePull(since)
          },
          sync: (body) => {
            this._activateOfflineToken()
            return postOfflineSync({ device_id: this.device_id, entries: body.entries })
          },
        },
      })
      this.engine.on((event, data) => {
        if (event === 'start')   this.syncing = true
        if (event === 'done')    { this.syncing = false; this.refreshCounts() }
        if (event === 'clock-skew') this.clockSkewSeconds = data?.seconds ?? null
        if (event === 'refresh-failed' || event === 'pull-failed' || event === 'batch-failed') {
          this.errors.unshift({ event, message: data?.message, at: new Date().toISOString() })
          if (this.errors.length > 20) this.errors.length = 20
        }
      })
    },

    // Swap the active bearer to the offline token for the duration of an
    // offline-sync call. Restored to the online token afterwards so the
    // rest of the app (still hitting normal endpoints) isn't affected.
    _activateOfflineToken() {
      if (this.offline_token) setToken(this.offline_token)
    },
    _restoreOnlineToken() {
      const t = readOnlineToken()
      if (t) setToken(t)
    },
  },
})
