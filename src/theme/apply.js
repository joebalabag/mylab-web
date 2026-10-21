import { THEME_PRESETS } from './presets'

const SHADE_KEYS = ['50','100','200','300','400','500','600','700','800','900']

// Lightness ramp used when deriving shades from a custom hex. Tuned to
// mimic Tailwind's own palette curve — not perfect, but gets within a
// shade or two for most hues. Presets are hand-tuned and skip this.
const LIGHTNESS_RAMP = {
  50: 0.97, 100: 0.93, 200: 0.86, 300: 0.76, 400: 0.65,
  500: 0.54, 600: 0.46, 700: 0.37, 800: 0.30, 900: 0.24
}

export function applyTenantTheme(hex) {
  if (!hex) return clearTenantTheme()
  const normalized = normalizeHex(hex)
  if (!normalized) return clearTenantTheme()
  const preset = THEME_PRESETS.find((p) => p.hex.toLowerCase() === normalized)
  const shades = preset ? preset.shades : deriveShades(normalized)
  const root = document.documentElement
  for (const k of SHADE_KEYS) root.style.setProperty(`--brand-${k}`, shades[k])
}

export function clearTenantTheme() {
  const root = document.documentElement
  for (const k of SHADE_KEYS) root.style.removeProperty(`--brand-${k}`)
}

export function normalizeHex(h) {
  if (!h) return ''
  const s = String(h).trim().toLowerCase()
  const bare = s.startsWith('#') ? s.slice(1) : s
  if (!/^[0-9a-f]{6}$/.test(bare)) return ''
  return `#${bare}`
}

function deriveShades(hex) {
  const { h, s } = hexToHsl(hex)
  const out = {}
  for (const k of SHADE_KEYS) out[k] = hslToRgbTriplet(h, s, LIGHTNESS_RAMP[k])
  return out
}

function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0, s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      case b: h = (r - g) / d + 4; break
    }
    h *= 60
  }
  return { h, s, l }
}

function hslToRgbTriplet(h, s, l) {
  // Pastels (very light shades) look washed out on strong brand hues, so
  // nudge saturation down a touch at the extremes to match hand-tuned
  // Tailwind palettes more closely.
  const sat = (l > 0.9 || l < 0.15) ? s * 0.75 : s
  const c = (1 - Math.abs(2 * l - 1)) * sat
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if      (h < 60)  { r = c; g = x; b = 0 }
  else if (h < 120) { r = x; g = c; b = 0 }
  else if (h < 180) { r = 0; g = c; b = x }
  else if (h < 240) { r = 0; g = x; b = c }
  else if (h < 300) { r = x; g = 0; b = c }
  else              { r = c; g = 0; b = x }
  return `${Math.round((r + m) * 255)} ${Math.round((g + m) * 255)} ${Math.round((b + m) * 255)}`
}
