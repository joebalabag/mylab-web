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
import { sendHeartbeat as sendPresenceHeartbeat } from '../api/presence.js'
import { closeAll, deleteDbFor, openDbFor, readSyncState } from '../offline/db.js'
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

// ── Heartbeat tuning ──────────────────────────────────────────────────
// Frequency of the /health probe when we believe we're online. Short enough
// to catch a broken uplink within one interaction, long enough to be cheap
// (5 tabs × 2 pings/min = 10 req/min per active operator). Chrome
// auto-throttles background timers, so hidden tabs actually poll slower.
const HEARTBEAT_INTERVAL_ONLINE_MS  = 30_000
// When confirmed offline, back off to reduce churn — one dropped ping
// costs almost nothing but N tabs each retrying every 30s does add up.
const HEARTBEAT_INTERVAL_OFFLINE_MS = 60_000
// Per-probe timeout. Anything longer than this is treated as a failure so
// a stalled TCP handshake doesn't mask the disconnect.
const HEARTBEAT_TIMEOUT_MS = 5_000
// Consecutive failures required before we flip the badge to Offline. Two
// is enough to filter out the "one transient blip" case without adding a
// full minute of latency to real disconnects.
const HEARTBEAT_FAILURE_THRESHOLD = 2

export const useOfflineStore = defineStore('offline', {
  state: () => ({
    // Session identity
    device_id: localStorage.getItem(LS_DEVICE_ID) || null,
    offline_token: readOfflineToken(),
    enabled: false,                 // this station has opted into offline mode
    // Network + sync
    isOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
    // Heartbeat-derived signal. Set when consecutive /health probes fail —
    // used to catch cases where navigator.onLine lies (localhost, VPN,
    // captive portals). isOffline getter OR's this with !isOnline so
    // either signal flipping true engages the offline stack.
    heartbeatFailing: false,
    _heartbeatFailStreak: 0,
    _heartbeatTimer: null,
    _heartbeatVisibilityHandler: null,
    _heartbeatPagehideHandler: null,
    _heartbeatStopped: false,       // stopped explicitly (logout / disable)
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
    // In-flight guard for auto-enable — prevents a MainLayout+LoginView
    // race from double-registering the same browser as two devices.
    _enableInFlight: false,
    // Last auto-register failure surfaced to the badge / settings, so a
    // silent /offline/enable rejection (tenant flag off, network wobble
    // at login time, etc.) doesn't leave the operator in a broken state
    // wondering why every request fails with "check your connection".
    enableError: null,
  }),
  getters: {
    // Either signal being offline puts us in offline mode. Browser events
    // give fast detection when they work; heartbeat catches the localhost
    // and lying-navigator.onLine cases.
    isOffline: (s) => !s.isOnline || s.heartbeatFailing,
    isEnabled: (s) => !!s.device_id && !!s.offline_token,
    isBootstrapping: (s) => !!s.bootstrapProgress,
    statusLabel: (s) => {
      if (s.bootstrapProgress) {
        const t = s.bootstrapProgress?.table
        return t ? `Downloading · ${t}…` : 'Downloading offline data…'
      }
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

      // Start the API-reachability heartbeat. Guards on tab visibility so
      // background tabs don't burn resources; skipped when no auth token.
      this._startHeartbeat()

      if (this.isEnabled) {
        this._buildEngine(tenant, user)
        await this.refreshCounts()
        // If we booted straight into offline mode, don't try to sync;
        // when the browser flips online our handler will fire drainOnce.
        if (this.isOnline) {
          this.drainNow()
          // First-of-day incremental bootstrap so the cache doesn't age
          // beyond the server's rolling window. Fire-and-forget — the
          // badge surfaces bootstrapProgress so the user sees it running.
          this.autoBootstrapIfDue().catch(() => {})
        }
      } else if (this.isOnline) {
        // Station has never been registered — auto-enable in the background
        // so the user can keep working online while the initial cache
        // downloads. Silent failures are non-fatal; the next login retries.
        this._autoEnableIfEligible().catch(() => {})
      }
    },

    // Guarded auto-register. Runs at most once at a time per browser tab —
    // stops MainLayout.onMounted + LoginView.submit from double-firing on
    // the same login and creating two offline_devices rows.
    async _autoEnableIfEligible() {
      if (this._enableInFlight || this.isEnabled) return
      this._enableInFlight = true
      try {
        await this.enableOnThisStation()
        this.enableError = null
      } catch (e) {
        // Common causes: tenant offline_mode_enabled=false, or transient
        // network. Surface the reason so the operator can see WHY offline
        // mode isn't engaging (badge popover + Settings panel both read
        // this). The Settings panel's Enable button still works as a
        // manual retry.
        this.enableError = e?.message || 'Offline mode registration failed.'
      } finally {
        this._enableInFlight = false
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

    // Nuclear reset — wipes device_id, offline_token, first-of-day flag,
    // and the local IndexedDB. Used for testing the "first-ever station"
    // flow without opening an incognito window; also handy for operators
    // if the local cache ever gets into a bad state. Optionally re-runs
    // initialize() so the auto-register kicks in immediately.
    async resetThisStation({ reinitialize = true } = {}) {
      const auth = useAuthStore()
      const tenant = auth.tenantUuid
      const user = auth.user?.uuid

      // In-memory state
      this.device_id = null
      this.offline_token = null
      this.enabled = false
      this.engine = null
      this.pendingCount = 0
      this.errorCount = 0
      this.conflictCount = 0
      this.errors = []
      this.lastPullAt = null
      this.lastSyncAt = null
      this.lastBootstrapAt = null
      this.bootstrapProgress = null

      // Persistent state
      localStorage.removeItem(LS_DEVICE_ID)
      localStorage.removeItem(LS_OFFLINE_TOKEN)
      Object.keys(localStorage)
        .filter((k) => k.startsWith('mylab.offline.last_bootstrap.'))
        .forEach((k) => localStorage.removeItem(k))

      // Dexie — deletes reference cache, journey cache, outbox, sync_state.
      if (tenant && user) {
        try { await deleteDbFor(tenant, user) } catch (_) { /* best-effort */ }
      }

      if (reinitialize) {
        // Fires the auto-register + bootstrap path so the badge starts
        // showing "Downloading…" immediately after the button click.
        this.initialize().catch(() => {})
      }
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
      // Bind to the composite offline signal — heartbeat can flip the mode
      // even when navigator.onLine says we're up.
      this.mode = this.isOffline ? 'offline' : 'online'
    },

    // ── /health heartbeat ────────────────────────────────────────────
    // Chrome/Edge report navigator.onLine=true whenever ANY interface is
    // up (loopback, VPN, disconnected Ethernet with cached IP). That means
    // the browser-event path misses real disconnects. This poller does the
    // one thing the browser can't lie about: it actually tries to reach
    // the API. Two consecutive failures flip us into offline mode; one
    // success flips back.
    //
    // Guards:
    //   • Skip when the tab is hidden — Chrome throttles background timers
    //     to 1/min anyway, and there's nothing for the operator to see.
    //   • Skip when there's no auth token (login page) — the app isn't
    //     doing transactions there, no point checking.
    //   • AbortController-based timeout so a stalled TCP handshake counts
    //     as a failure instead of hanging the interval.
    _startHeartbeat() {
      if (typeof window === 'undefined') return
      this._heartbeatStopped = false
      // Fire an immediate probe so a page that loads while the API is
      // already down flips to Offline within seconds instead of 30.
      this._heartbeatTick()
      this._scheduleNextHeartbeat()
      // Visibility handler — when the tab is brought back into focus,
      // probe right away so the badge is accurate the moment the operator
      // returns.
      if (this._heartbeatVisibilityHandler) {
        document.removeEventListener('visibilitychange', this._heartbeatVisibilityHandler)
      }
      this._heartbeatVisibilityHandler = () => {
        if (!document.hidden) this._heartbeatTick()
      }
      document.addEventListener('visibilitychange', this._heartbeatVisibilityHandler)
      // pagehide "goodbye" — tell the server to remove us from the presence
      // map the instant the tab is closing. keepalive:true lets the request
      // complete after the page is destroyed. Chosen over sendBeacon because
      // Beacon can't carry an Authorization header. pagehide covers close,
      // navigation-away, and bfcache eviction; beforeunload does not.
      if (this._heartbeatPagehideHandler) {
        window.removeEventListener('pagehide', this._heartbeatPagehideHandler)
      }
      this._heartbeatPagehideHandler = () => {
        const token = localStorage.getItem('pos_token')
        if (!token) return
        const base = (import.meta.env?.VITE_API_BASE || '/api').replace(/\/+$/, '')
        try {
          fetch(`${base}/presence/forget`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: '{}',
            keepalive: true,
          })
        } catch (_) { /* best-effort — user is leaving anyway */ }
      }
      window.addEventListener('pagehide', this._heartbeatPagehideHandler)
    },
    _stopHeartbeat() {
      this._heartbeatStopped = true
      if (this._heartbeatTimer) {
        clearTimeout(this._heartbeatTimer)
        this._heartbeatTimer = null
      }
      if (this._heartbeatVisibilityHandler) {
        document.removeEventListener('visibilitychange', this._heartbeatVisibilityHandler)
        this._heartbeatVisibilityHandler = null
      }
      if (this._heartbeatPagehideHandler) {
        window.removeEventListener('pagehide', this._heartbeatPagehideHandler)
        this._heartbeatPagehideHandler = null
      }
    },
    _scheduleNextHeartbeat() {
      if (this._heartbeatStopped) return
      if (this._heartbeatTimer) clearTimeout(this._heartbeatTimer)
      const delay = this.heartbeatFailing
        ? HEARTBEAT_INTERVAL_OFFLINE_MS
        : HEARTBEAT_INTERVAL_ONLINE_MS
      this._heartbeatTimer = setTimeout(() => this._heartbeatTick(), delay)
    },
    async _heartbeatTick() {
      if (this._heartbeatStopped) return
      // Skip hidden tabs — no user waiting, and Chrome will throttle us
      // anyway. The visibilitychange handler probes again on focus.
      if (typeof document !== 'undefined' && document.hidden) {
        this._scheduleNextHeartbeat()
        return
      }
      // Skip when there's no session — we're on login/register and the
      // API host might not even be resolvable yet.
      const auth = useAuthStore()
      if (!auth.tenantUuid) {
        this._scheduleNextHeartbeat()
        return
      }

      let ok = false
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), HEARTBEAT_TIMEOUT_MS)
      try {
        const base = (import.meta.env?.VITE_API_BASE || '/api').replace(/\/+$/, '')
        const res = await fetch(`${base}/health`, {
          method: 'GET',
          cache: 'no-store',
          signal: ctrl.signal,
        })
        ok = res.ok
      } catch (_) {
        ok = false
      } finally {
        clearTimeout(t)
      }

      if (ok) {
        // Recover immediately on the first success — any pending sync work
        // can start draining right away.
        if (this.heartbeatFailing) {
          this.heartbeatFailing = false
          this._heartbeatFailStreak = 0
          this._recomputeMode()
          if (this.isEnabled && this.isOnline) this.drainNow()
        } else {
          this._heartbeatFailStreak = 0
        }
        // Piggyback: while we know the API is reachable and we hold a live
        // auth token, ping /presence/heartbeat so the super-admin
        // active-users panel keeps this session marked online even when the
        // operator isn't clicking anything. Fire-and-forget — any error is
        // strictly cosmetic (interceptor stamping on real requests is the
        // primary signal).
        if (auth.isAuthenticated) {
          sendPresenceHeartbeat().catch(() => {})
        }
        // If offline mode never successfully registered (auto-enable
        // failed silently at login time, or the tenant flag was off then
        // flipped on later), retry now that we've proven the API is
        // reachable. Guards inside prevent duplicate registrations.
        if (!this.isEnabled && this.isOnline) {
          this._autoEnableIfEligible().catch(() => {})
        }
      } else {
        this._heartbeatFailStreak += 1
        if (!this.heartbeatFailing && this._heartbeatFailStreak >= HEARTBEAT_FAILURE_THRESHOLD) {
          this.heartbeatFailing = true
          this._recomputeMode()
        }
      }
      this._scheduleNextHeartbeat()
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
