import { defineStore } from 'pinia'

const STORAGE_KEY = 'mylab_theme_mode'
const VALID_MODES = ['light', 'dark', 'system']

function readStoredMode() {
  const raw = localStorage.getItem(STORAGE_KEY)
  return VALID_MODES.includes(raw) ? raw : 'system'
}

function systemPrefersDark() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches
}

export const useThemeStore = defineStore('theme', {
  state: () => ({
    mode: readStoredMode(),
    systemDark: systemPrefersDark(),
  }),
  getters: {
    // The mode the UI should actually render — collapses 'system' to a real value.
    resolved: (s) => (s.mode === 'system' ? (s.systemDark ? 'dark' : 'light') : s.mode),
    isDark: (s) => (s.mode === 'system' ? s.systemDark : s.mode === 'dark'),
  },
  actions: {
    setMode(next) {
      if (!VALID_MODES.includes(next)) return
      this.mode = next
      localStorage.setItem(STORAGE_KEY, next)
    },
    // MainLayout calls this once on mount so system preference changes
    // repaint the app without a reload while the user leaves mode = 'system'.
    startWatchingSystem() {
      if (this._mql) return
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
      this._mql = window.matchMedia('(prefers-color-scheme: dark)')
      this._onChange = (e) => { this.systemDark = e.matches }
      if (this._mql.addEventListener) this._mql.addEventListener('change', this._onChange)
      else this._mql.addListener(this._onChange)
    },
    stopWatchingSystem() {
      if (!this._mql) return
      if (this._mql.removeEventListener) this._mql.removeEventListener('change', this._onChange)
      else this._mql.removeListener(this._onChange)
      this._mql = null
      this._onChange = null
    },
  },
})
