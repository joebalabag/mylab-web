import { ref, computed, readonly } from 'vue'

/**
 * PWA install prompt lifecycle. Handles the browser's `beforeinstallprompt`
 * event so we can show a custom "Install app" button anywhere in the app.
 *
 * Usage:
 *   const { canInstall, installed, promptInstall } = usePwaInstall()
 *   <button v-if="canInstall && !installed" @click="promptInstall">Install</button>
 *
 * Browser support:
 *   Chrome, Edge, Samsung Internet, and Opera fire `beforeinstallprompt` when
 *   the manifest + service-worker check passes. Safari (macOS/iOS) does NOT —
 *   users install via the browser's own Share → Add to Home Screen menu. We
 *   surface an `isSafari` hint for the caller so it can display an alternate
 *   nudge on Apple platforms.
 *
 * Suppression:
 *   Once installed (or the user dismisses the prompt with "Not now"), we stash
 *   a timestamp in localStorage so we don't re-nag on every page load. The
 *   timeout window is 7 days — respectful without disappearing forever.
 */
const DISMISS_KEY = 'pwa:install-dismissed-at'
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000

// Module-level state so every consumer shares the same event (only one
// beforeinstallprompt is fired per page load — no re-binding).
const deferredPrompt = ref(null)
const installed = ref(false)
const installing = ref(false)
let listenersBound = false

function isRecentlyDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) || 0)
    if (!at) return false
    return Date.now() - at < DISMISS_TTL_MS
  } catch (_) { return false }
}

function markDismissed() {
  try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch (_) { /* private mode */ }
}

function clearDismissed() {
  try { localStorage.removeItem(DISMISS_KEY) } catch (_) {}
}

function detectAlreadyInstalled() {
  // display-mode: standalone means the app is running from its installed
  // shortcut, not a browser tab. Best cross-browser heuristic.
  if (typeof window === 'undefined') return false
  const mq = window.matchMedia?.('(display-mode: standalone)')
  if (mq?.matches) return true
  // iOS Safari sets navigator.standalone when launched from the home screen.
  if (window.navigator?.standalone === true) return true
  return false
}

function bindListenersOnce() {
  if (listenersBound || typeof window === 'undefined') return
  listenersBound = true

  installed.value = detectAlreadyInstalled()

  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent Chrome's auto-mini-infobar so we control the UX ourselves.
    e.preventDefault()
    deferredPrompt.value = e
    // eslint-disable-next-line no-console
    console.info('[pwa] beforeinstallprompt captured — install button now available')
  })

  window.addEventListener('appinstalled', () => {
    installed.value = true
    deferredPrompt.value = null
    clearDismissed()
    // eslint-disable-next-line no-console
    console.info('[pwa] app installed')
  })

  // Diagnostic — the two most common reasons the prompt never fires. Log
  // once on startup so ops can spot the misconfiguration in devtools.
  // eslint-disable-next-line no-console
  console.info('[pwa] install listener bound',
    { standalone: installed.value, isSecure: window.isSecureContext, host: window.location.host })
}

// Bind at module-load time (before Vue mounts). `beforeinstallprompt` fires
// ONCE per page load, and Chrome fires it early — waiting for onMounted can
// miss the event on cold loads. Safe because the browser dispatches to any
// listener added before the event, even the very first one.
bindListenersOnce()

export function usePwaInstall() {

  // `canInstall` is the single boolean the UI should key off of. True when:
  //  - the browser fired beforeinstallprompt (event captured),
  //  - the app isn't already installed,
  //  - the user hasn't recently dismissed the prompt.
  const canInstall = computed(() =>
    !!deferredPrompt.value && !installed.value && !isRecentlyDismissed()
  )

  const isSafari = computed(() => {
    if (typeof navigator === 'undefined') return false
    const ua = navigator.userAgent || ''
    // Safari on macOS/iOS reports "Safari" but not "Chrome"/"CriOS"/"Edg"/"FxiOS".
    return /Safari/.test(ua) && !/Chrome|CriOS|Edg|FxiOS|OPR/.test(ua)
  })

  async function promptInstall() {
    if (!deferredPrompt.value) return { outcome: 'unavailable' }
    installing.value = true
    try {
      deferredPrompt.value.prompt()
      const choice = await deferredPrompt.value.userChoice
      // Chrome fires appinstalled asynchronously; we still clear the prompt
      // event locally so canInstall flips to false immediately.
      deferredPrompt.value = null
      if (choice?.outcome === 'dismissed') markDismissed()
      return choice
    } finally {
      installing.value = false
    }
  }

  function dismissInstall() {
    markDismissed()
    deferredPrompt.value = null
  }

  return {
    canInstall,
    installed: readonly(installed),
    installing: readonly(installing),
    isSafari,
    promptInstall,
    dismissInstall,
  }
}
