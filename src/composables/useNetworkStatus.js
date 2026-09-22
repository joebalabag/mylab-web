// Reactive online/offline flag with a light heartbeat.
//
// `navigator.onLine` alone lies: it flips to true the moment the browser
// gets a link-layer connection, which is exactly wrong for captive-portal
// hotels or a branch whose router is up but whose upstream ISP is dead.
// So we combine three signals:
//   - the browser's `online` / `offline` events (cheap, instant reaction)
//   - a periodic HEAD to /api/health (definitive, but with jitter to avoid
//     hammering the API from every open tab)
//   - visibility change (skip the heartbeat while the tab is hidden)
//
// The composable exposes:
//   isOnline    — reactive boolean
//   lastCheckAt — reactive ISO string
//   pingNow()   — force an immediate probe

import { onMounted, onUnmounted, ref } from 'vue'

// 15s is short enough that a returning connection triggers a sync within a
// noticeable-but-not-annoying window, and long enough that ten open tabs
// don't DoS the health endpoint. Jitter keeps two tabs from lining up.
const HEARTBEAT_MS = 15000
const HEARTBEAT_JITTER_MS = 5000

function healthUrl() {
  const base = (import.meta.env?.VITE_API_BASE || 'http://127.0.0.1:3010/api').replace(/\/+$/, '')
  return `${base}/health`
}

async function probe(timeoutMs = 4000) {
  // AbortSignal.timeout would be cleaner but not in older Safari; keep
  // manual for now.
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetch(healthUrl(), { method: 'HEAD', cache: 'no-store', signal: ctl.signal })
    // Any 2xx/3xx counts as reachable — even a 401 means the server answered.
    return res.status < 500
  } catch (_) {
    return false
  } finally {
    clearTimeout(timer)
  }
}

// Module-level singleton so multiple components observing the flag share one
// heartbeat instead of firing N pings per interval.
let singleton = null

export function useNetworkStatus() {
  if (singleton) return singleton

  const isOnline = ref(typeof navigator === 'undefined' ? true : navigator.onLine)
  const lastCheckAt = ref(null)
  let timerId = null

  async function pingNow() {
    const alive = await probe()
    isOnline.value = alive
    lastCheckAt.value = new Date().toISOString()
    return alive
  }

  function scheduleNext() {
    const jitter = Math.random() * HEARTBEAT_JITTER_MS
    timerId = setTimeout(async () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        await pingNow()
      }
      scheduleNext()
    }, HEARTBEAT_MS + jitter)
  }

  const onBrowserOnline  = () => { pingNow() }             // confirm quickly on link-up
  const onBrowserOffline = () => { isOnline.value = false } // trust the negative signal instantly
  const onVisibilityChange = () => { if (document.visibilityState === 'visible') pingNow() }

  onMounted(() => {
    window.addEventListener('online',  onBrowserOnline)
    window.addEventListener('offline', onBrowserOffline)
    document.addEventListener('visibilitychange', onVisibilityChange)
    pingNow()
    scheduleNext()
  })
  onUnmounted(() => {
    window.removeEventListener('online',  onBrowserOnline)
    window.removeEventListener('offline', onBrowserOffline)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    if (timerId) clearTimeout(timerId)
  })

  singleton = { isOnline, lastCheckAt, pingNow }
  return singleton
}
