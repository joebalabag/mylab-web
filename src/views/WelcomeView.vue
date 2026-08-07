<script setup>
// Default landing view after a tenant user signs in via /login.
//
// Deliberately lightweight — greeting + tenant/role subtext + quick-launch
// tiles filtered by the user's granted access rows. Time updates via a
// 60-second interval so the greeting-hour phrase stays honest without
// re-rendering every second.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useTenantStore } from '../stores/tenant'

const auth = useAuthStore()
const tenant = useTenantStore()

const now = ref(new Date())
let ticker = null
onMounted(() => { ticker = setInterval(() => { now.value = new Date() }, 60_000) })
onBeforeUnmount(() => { if (ticker) clearInterval(ticker) })

const hour = computed(() => now.value.getHours())
const greetingWord = computed(() => {
  const h = hour.value
  if (h < 5)  return 'Working late'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
})
const todayLabel = computed(() =>
  now.value.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
)
const clockLabel = computed(() =>
  now.value.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
)

// Quick-launch catalog. mainNav mirrors the sidebar's access keys so tiles
// disappear for modules the user hasn't been granted.
const tiles = [
  { to: '/patients',        label: 'Patients',        hint: 'Register & manage patient records', icon: 'users',  tone: 'emerald', mainNav: 'patients' },
  { to: '/patient-cases',   label: 'Patient Cases',   hint: 'Register OPD/IPD cases + requisitions', icon: 'receipt', tone: 'amber', mainNav: 'patient cases' },
  { to: '/cashier',         label: 'Cashier',         hint: 'Settle finalized requisitions & print receipts', icon: 'cash', tone: 'violet', mainNav: 'cashier' },
  { to: '/item-groups',     label: 'Item Groups',     hint: 'Top-level buckets (Lab, Imaging…)', icon: 'stack',  tone: 'sky',     mainNav: 'item groups' },
  { to: '/item-categories', label: 'Item Categories', hint: 'Sections under each group',         icon: 'tag',    tone: 'teal',    mainNav: 'item categories' },
  { to: '/test-items',      label: 'Test Items',      hint: 'Individual orderable tests',        icon: 'chart',  tone: 'indigo',  mainNav: 'test items' },
  { to: '/item-packages',   label: 'Item Packages',   hint: 'Bundled tests with package pricing', icon: 'box',   tone: 'amber',   mainNav: 'item packages' },
  { to: '/discounts',       label: 'Discounts',       hint: 'Promos & price rules',         icon: 'percent',tone: 'fuchsia', mainNav: 'discounts' },
  { to: '/expenses',        label: 'Expenses',        hint: 'Track operational costs',      icon: 'receipt',tone: 'rose',    mainNav: 'expenses' },
  { to: '/users',           label: 'User Management', hint: 'Staff accounts & access',      icon: 'users',  tone: 'slate',   mainNav: 'user management' },
  { to: '/settings/tenant', label: 'Company Settings', hint: 'Company information & branding', icon: 'gear',   tone: 'zinc',    mainNav: 'store settings' }
]
const visibleTiles = computed(() => tiles.filter(t => t.always || auth.canOpen(t.mainNav)))

// Tailwind class maps — kept explicit (no dynamic concatenation) so the JIT
// compiler actually emits them.
const toneBg = {
  indigo:  'bg-brand-50 ring-brand-100  hover:bg-brand-100/70  hover:ring-brand-300',
  emerald: 'bg-emerald-50 ring-emerald-100 hover:bg-emerald-100/70 hover:ring-emerald-300',
  amber:   'bg-amber-50 ring-amber-100    hover:bg-amber-100/70   hover:ring-amber-300',
  rose:    'bg-rose-50 ring-rose-100      hover:bg-rose-100/70    hover:ring-rose-300',
  sky:     'bg-sky-50 ring-sky-100        hover:bg-sky-100/70     hover:ring-sky-300',
  teal:    'bg-teal-50 ring-teal-100      hover:bg-teal-100/70    hover:ring-teal-300',
  fuchsia: 'bg-fuchsia-50 ring-fuchsia-100 hover:bg-fuchsia-100/70 hover:ring-fuchsia-300',
  violet:  'bg-violet-50 ring-violet-100  hover:bg-violet-100/70  hover:ring-violet-300',
  cyan:    'bg-cyan-50 ring-cyan-100      hover:bg-cyan-100/70    hover:ring-cyan-300',
  slate:   'bg-slate-50 ring-slate-100    hover:bg-slate-100/70   hover:ring-slate-300',
  zinc:    'bg-zinc-50 ring-zinc-100      hover:bg-zinc-100/70    hover:ring-zinc-300'
}
const toneIcon = {
  indigo: 'text-brand-600',  emerald: 'text-emerald-600', amber: 'text-amber-600',
  rose:   'text-rose-600',    sky:     'text-sky-600',     teal:  'text-teal-600',
  fuchsia:'text-fuchsia-600', violet:  'text-violet-600',  cyan:  'text-cyan-600',
  slate:  'text-slate-600',   zinc:    'text-zinc-600'
}

function iconSvg(name) {
  const paths = {
    grid:    '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    cash:    '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>',
    bolt:    '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    chef:    '<path d="M6 13h12v7a2 2 0 01-2 2H8a2 2 0 01-2-2v-7z"/><path d="M6 13a4 4 0 01-1-7.7A4 4 0 0112 3a4 4 0 017 2.3A4 4 0 0118 13"/><line x1="9" y1="17" x2="9" y2="19"/><line x1="15" y1="17" x2="15" y2="19"/>',
    box:     '<path d="M21 8l-9 4-9-4 9-4 9 4z"/><path d="M3 8v8l9 4 9-4V8"/>',
    stack:   '<path d="M12 3l9 4-9 4-9-4 9-4z"/><path d="M3 12l9 4 9-4"/><path d="M3 17l9 4 9-4"/>',
    tag:     '<path d="M20.6 12.6l-8-8A2 2 0 0011.2 4H5a1 1 0 00-1 1v6.2a2 2 0 00.6 1.4l8 8a2 2 0 002.8 0l5.2-5.2a2 2 0 000-2.8z"/><circle cx="8" cy="8" r="1.4"/>',
    percent: '<line x1="19" y1="5" x2="5" y2="19"/><circle cx="7.5" cy="7.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/>',
    chart:   '<line x1="3" y1="20" x2="21" y2="20"/><rect x="6" y="10" width="3" height="8"/><rect x="11" y="6" width="3" height="12"/><rect x="16" y="13" width="3" height="5"/>',
    users:   '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/><circle cx="17" cy="9" r="3"/><path d="M22 20c0-3-2-5-5-5"/>',
    gear:    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/>',
    receipt: '<path d="M6 2v20l3-2 3 2 3-2 3 2V2z"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="13" y2="15"/>'
  }
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="h-6 w-6">${paths[name] || ''}</svg>`
}
</script>

<template>
  <div class="mx-auto flex max-w-6xl flex-col gap-6">
    <!-- Greeting header -->
    <section class="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 p-6 text-white shadow-lg sm:p-8">
      <div class="absolute inset-0 opacity-25"
           style="background-image: radial-gradient(circle at 15% 20%, rgba(255,255,255,.4) 0, transparent 40%),
                                  radial-gradient(circle at 85% 70%, rgba(255,255,255,.25) 0, transparent 45%);"></div>
      <div class="relative flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <div class="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/70">
            {{ todayLabel }} · {{ clockLabel }}
          </div>
          <h1 class="mt-1 text-2xl font-extrabold sm:text-3xl">
            {{ greetingWord }}, {{ auth.user?.name || auth.user?.username || 'there' }} 👋
          </h1>
          <p class="mt-1 text-sm text-white/85 sm:text-base">
            <template v-if="tenant.name">
              You're signed in at <b class="font-semibold">{{ tenant.name }}</b><span v-if="tenant.code" class="font-mono text-white/70"> · {{ tenant.code }}</span>.
            </template>
            <template v-else>Welcome back to MyLab.</template>
          </p>
          <div v-if="auth.user?.role"
               class="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest ring-1 ring-white/25">
            <span class="inline-block h-1.5 w-1.5 rounded-full bg-white/80"></span>
            {{ auth.user.role }}
          </div>
        </div>
        <div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-2xl font-extrabold ring-1 ring-white/25 sm:h-16 sm:w-16">
          {{ (auth.user?.name || 'U').charAt(0).toUpperCase() }}
        </div>
      </div>
    </section>

    <!-- Quick launch tiles -->
    <section>
      <div class="mb-2 flex items-baseline justify-between">
        <h2 class="text-sm font-bold uppercase tracking-widest text-slate-600">Quick launch</h2>
        <div class="text-xs text-slate-400">
          {{ visibleTiles.length }} module{{ visibleTiles.length === 1 ? '' : 's' }}
        </div>
      </div>
      <div v-if="visibleTiles.length"
           class="grid gap-3"
           style="grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));">
        <RouterLink v-for="t in visibleTiles" :key="t.to" :to="t.to"
                    class="group flex flex-col gap-2 rounded-xl p-4 ring-1 transition"
                    :class="toneBg[t.tone] || toneBg.slate">
          <span class="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white/70 shadow-sm ring-1 ring-white/60"
                :class="toneIcon[t.tone] || toneIcon.slate"
                v-html="iconSvg(t.icon)"></span>
          <div>
            <div class="text-sm font-bold text-slate-800">{{ t.label }}</div>
            <div class="text-[11px] text-slate-500">{{ t.hint }}</div>
          </div>
        </RouterLink>
      </div>
      <div v-else
           class="rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
        No modules granted to your account yet. Ask an admin to assign access.
      </div>
    </section>
  </div>
</template>
