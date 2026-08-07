import { defineStore } from 'pinia'

// Global inbox for non-fatal server warnings delivered via the API response
// envelope's `warnings[]`. A registered handler in main.js pushes items here,
// and <WarningsToast /> (mounted once in App.vue) renders them.

let seq = 1
const DEFAULT_AUTO_DISMISS_MS = 6500
const DEDUPE_WINDOW_MS = 4000

function humanCode(code) {
  return String(code || '')
    .replace(/^warning\./i, '')
    .replace(/^notification\./i, '')
    .replace(/\./g, ' · ')
    .replace(/[-_]/g, ' ')
    .trim()
}

export const useWarningsStore = defineStore('warnings', {
  state: () => ({
    items: []   // { id, code, text, hint, tone, at, context }
  }),
  actions: {
    // Register a batch (typically from a single API response).
    pushBatch(warnings, context = {}) {
      const list = Array.isArray(warnings) ? warnings : []
      const now = Date.now()
      // Drop rapid duplicates by (code, text) — a chatty endpoint firing the
      // same warning within a few seconds should coalesce, not spam.
      for (const raw of list) {
        if (!raw || typeof raw !== 'object') continue
        const code = String(raw.code || '').trim()
        const text = String(raw.text || raw.message || '').trim()
        if (!code && !text) continue

        const dupe = this.items.find(w =>
          w.code === code && w.text === text && (now - w.at) < DEDUPE_WINDOW_MS)
        if (dupe) continue

        this.items.push({
          id: seq++,
          code,
          text,
          hint: humanCode(code),
          tone: 'amber',       // reserved for future ("info", "amber", "rose")
          at: now,
          context: context || {}
        })
      }
    },
    dismiss(id) {
      const idx = this.items.findIndex(w => w.id === id)
      if (idx >= 0) this.items.splice(idx, 1)
    },
    clear() { this.items = [] }
  }
})

export const WARNING_AUTO_DISMISS_MS = DEFAULT_AUTO_DISMISS_MS
