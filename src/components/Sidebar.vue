<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { version as appVersion } from '../../package.json'
import { useTenantStore } from '../stores/tenant'
import { useAuthStore } from '../stores/auth'
import { assetUrl } from '../api/client'
import HelpModal from './HelpModal.vue'
import MyLabLogo from '../assets/MyLab-icon.png'

const showHelp = ref(false)

const tenant    = useTenantStore()
const auth      = useAuthStore()

const props = defineProps({
  open: Boolean,
  collapsed: Boolean
})
defineEmits(['close', 'toggle-collapse'])

// Sidebar navigation, grouped by section. Groups with no header render as
// standalone rows (used for Welcome, the always-visible post-login landing).
// `mainNav` maps each entry to the access-template's main_navigation value —
// missing mainNav means the row is always visible.
const navGroups = [
  {
    label: null,
    items: [
      { to: '/home',            label: 'Welcome',         icon: 'home' },
      { to: '/dashboard',       label: 'Dashboard',       icon: 'chart', mainNav: 'dashboard' },
      { to: '/setup-readiness', label: 'Setup Readiness', icon: 'bolt',  mainNav: 'setup readiness' }
    ]
  },
  {
    label: 'Operations',
    items: [
      { to: '/patients',        label: 'Patients',        icon: 'users',   mainNav: 'patients' },
      { to: '/patient-cases',   label: 'Patient Cases',   icon: 'receipt', mainNav: 'patient cases' },
      { to: '/cashier',         label: 'Cashier',         icon: 'cash',    mainNav: 'cashier' },
      { to: '/laboratory',      label: 'Laboratory',      icon: 'flask',   mainNav: 'laboratory' }
    ]
  },
  {
    label: 'Catalog',
    items: [
      { to: '/item-groups',     label: 'Item Groups',     icon: 'stack',   mainNav: 'item groups' },
      { to: '/item-categories', label: 'Item Categories', icon: 'tag',     mainNav: 'item categories' },
      { to: '/test-items',      label: 'Test Items',      icon: 'chart',   mainNav: 'test items' },
      { to: '/item-packages',   label: 'Item Packages',   icon: 'box',     mainNav: 'item packages' },
      { to: '/discounts',       label: 'Discounts',       icon: 'percent', mainNav: 'discounts' }
    ]
  },
  {
    label: 'Finance',
    items: [
      { to: '/expenses',        label: 'Expenses',        icon: 'receipt', mainNav: 'expenses' }
    ]
  },
  {
    label: 'Reports',
    // `collapsible` groups render their label as a toggle chip; the items
    // slide open/closed. State is persisted in localStorage so switching
    // pages doesn't collapse the section back. `icon` shows next to the
    // header when collapsible; sub-items render with bullet dots instead
    // of per-item icons.
    collapsible: true,
    icon: 'chart',
    key: 'reports',
    items: [
      { to: '/reports/summary',         label: 'Summary',            icon: 'chart' },
      { to: '/reports/monthly-sales',   label: 'Monthly Sales',      icon: 'chart' },
      { to: '/reports/monthly-tests',   label: 'Monthly Tests',      icon: 'chart' },
      { to: '/reports/cashier-sales',   label: 'Cashier Sales',      icon: 'cash' },
      { to: '/reports/voids',           label: 'Voids',              icon: 'receipt' },
      { to: '/reports/daily-sales',     label: 'Daily Sales',        icon: 'cash' },
      { to: '/reports/daily-detailed-sales', label: 'Daily Detailed Sales', icon: 'receipt' },
      { to: '/reports/daily-tests',     label: 'Daily Test',         icon: 'flask' },
      { to: '/reports/discounts',       label: 'Discounts',          icon: 'percent' },
      { to: '/reports/expenses',        label: 'Expenses',           icon: 'receipt' },
      { to: '/reports/payment-summary', label: 'Payment Summary',    icon: 'card' },
      { to: '/reports/test-analytics',  label: 'Test Analytics',     icon: 'flask' }
    ]
  },
  {
    label: 'Administration',
    items: [
      { to: '/users',           label: 'User Management', icon: 'users',   mainNav: 'user management' },
      { to: '/subscription',    label: 'Subscription',    icon: 'card',    mainNav: 'subscription' },
      { to: '/settings/tenant', label: 'Company Settings', icon: 'gear',    mainNav: 'store settings' }
    ]
  }
]

// Filter each group's items by access + plan. Drop groups with zero visible
// items so we don't render an orphan header. Rows without a mainNav (Welcome)
// pass through both predicates.
const visibleGroups = computed(() =>
  navGroups
    .map((g) => ({
      label: g.label,
      collapsible: !!g.collapsible,
      icon: g.icon || null,
      key: g.key || g.label,
      items: g.items.filter((item) =>
        auth.canOpen(item.mainNav) && tenant.planAllowsMainNav(item.mainNav)
      )
    }))
    .filter((g) => g.items.length > 0)
)

// ─── Collapsible group expand/collapse state ───
// Persist per-group open/closed across page loads. Auto-open the group whose
// child route is active so entering /reports/foo doesn't leave the section
// closed with no visible cue.
const GROUP_STATE_KEY = 'sidebar:group-open'
function loadGroupState() {
  try {
    const raw = localStorage.getItem(GROUP_STATE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch (_) { return {} }
}
const groupOpen = ref(loadGroupState())
function saveGroupState() {
  try { localStorage.setItem(GROUP_STATE_KEY, JSON.stringify(groupOpen.value)) } catch (_) {}
}
function isGroupOpen(g) {
  // Default all collapsible groups to open on first visit; user can collapse
  // and the closed state sticks. If any child route is active, force open.
  const stored = groupOpen.value[g.key]
  if (stored === undefined) return true
  return !!stored
}

// True when the current URL matches any of this group's child links —
// used to drive the "active" styling on the collapsible group header so
// it only reads as highlighted when the user is actually on that section.
function isGroupActive(g) {
  const p = route.path
  return (g.items || []).some(i => p === i.to || p.startsWith(i.to + '/'))
}
function toggleGroup(g) {
  groupOpen.value = { ...groupOpen.value, [g.key]: !isGroupOpen(g) }
  saveGroupState()
}

const route = useRoute()
// Auto-open a collapsible group when navigation lands on one of its children —
// prevents "I clicked a link in the sidebar and my breadcrumb disappeared".
watch(() => route.path, (p) => {
  for (const g of visibleGroups.value) {
    if (!g.collapsible) continue
    if (g.items.some(i => p.startsWith(i.to))) {
      if (!isGroupOpen(g)) {
        groupOpen.value = { ...groupOpen.value, [g.key]: true }
        saveGroupState()
      }
    }
  }
}, { immediate: true })
</script>

<template>
  <!-- Mobile overlay -->
  <transition name="fade">
    <div
      v-if="open"
      class="fixed inset-0 z-30 bg-slate-900/40 md:hidden"
      @click="$emit('close')"
    />
  </transition>

  <aside
    class="fixed inset-y-0 left-0 z-40 flex w-64 -translate-x-full transform flex-col border-r border-slate-200 bg-white
           transition-[width,transform] duration-200 md:translate-x-0"
    :class="[
      { 'translate-x-0': open },
      collapsed ? 'md:w-20' : 'md:w-64'
    ]"
  >
    <!-- Brand row -->
    <div class="relative flex h-16 shrink-0 items-center gap-3 border-b border-slate-100 px-5"
         :class="collapsed && 'md:justify-center md:px-0'">
      <img :src="MyLabLogo" alt="MyLab"
           class="h-9 w-9 shrink-0 rounded-lg object-contain" />
      <div :class="collapsed && 'md:hidden'">
        <div class="text-sm font-bold text-slate-800">MyLab</div>
        <div class="text-xs text-slate-500">Laboratory</div>
      </div>

      <!-- Desktop collapse toggle (only when expanded; when collapsed, use Topbar button) -->
      <button
        v-if="!collapsed"
        class="ml-auto hidden h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 md:inline-flex"
        title="Collapse sidebar"
        @click="$emit('toggle-collapse')"
      >
        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
    </div>

    <!-- Tenant logo -->
    <div v-if="tenant.logo"
         class="flex shrink-0 items-center justify-center border-b border-slate-100 px-4 py-5">
      <img :src="assetUrl(tenant.logo)"
           class="max-h-28 w-auto object-contain"
           :alt="tenant.name || 'Tenant logo'" />
    </div>

    <nav class="min-h-0 flex-1 overflow-y-auto p-3" :class="collapsed && 'md:px-2'">
      <div v-for="(group, gi) in visibleGroups" :key="group.key || `g-${gi}`"
           :class="gi > 0 && 'mt-3'">
        <!-- Collapsible group header: clickable, icon + label + chevron.
             Wears the brand-tinted "active" look ONLY when the current route
             is one of this group's children — otherwise stays neutral so it
             doesn't compete with the actually-active row. -->
        <button v-if="group.label && group.collapsible && !collapsed"
                type="button"
                @click="toggleGroup(group)"
                class="mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors"
                :class="isGroupActive(group)
                        ? 'bg-brand-50 text-brand-700 hover:bg-brand-100'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'">
          <span v-if="group.icon"
                class="inline-flex h-5 w-5 shrink-0 items-center justify-center"
                :class="isGroupActive(group) ? 'text-brand-600' : 'text-slate-400'"
                v-html="iconSvg(group.icon)"></span>
          <span class="flex-1 text-left">{{ group.label }}</span>
          <svg viewBox="0 0 24 24" class="h-4 w-4 transition-transform"
               :class="[
                 isGroupActive(group) ? 'text-brand-500' : 'text-slate-400',
                 isGroupOpen(group) ? 'rotate-180' : ''
               ]"
               fill="none" stroke="currentColor" stroke-width="2.5"
               stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        <!-- Static (non-collapsible) group header. -->
        <div v-else-if="group.label && !collapsed"
             class="mb-1 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
          {{ group.label }}
        </div>
        <!-- Thin divider stripe in icon-collapsed mode so groups still read
             as distinct even without headers. Skipped for the first group. -->
        <div v-else-if="group.label && collapsed && gi > 0"
             class="mx-auto my-2 hidden h-px w-6 bg-slate-200 md:block"></div>

        <!-- Items: hidden when the group is collapsible AND currently closed
             AND the sidebar itself isn't icon-only (icon-only mode ignores
             the collapsible state — nowhere else to reach the pages). -->
        <div v-show="collapsed || !group.collapsible || isGroupOpen(group)"
             class="overflow-hidden transition-[max-height]">
          <RouterLink
            v-for="item in group.items"
            :key="item.to"
            :to="item.to"
            :title="collapsed ? item.label : ''"
            @click="$emit('close')"
            class="mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600
                   hover:bg-slate-100 hover:text-slate-900"
            :class="[
              collapsed && 'md:justify-center md:px-0',
              // Collapsible-group children get the bullet + indent treatment;
              // top-level groups keep their per-item icons as-is.
              group.collapsible && !collapsed && 'pl-8'
            ]"
            active-class="!bg-brand-50 !text-brand-700 !font-semibold"
          >
            <!-- Bullet dot for collapsible sub-items, per-item icon otherwise -->
            <span v-if="group.collapsible && !collapsed"
                  class="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300"></span>
            <span v-else
                  class="inline-flex h-6 w-6 shrink-0 items-center justify-center text-slate-400"
                  v-html="iconSvg(item.icon)"></span>
            <span :class="collapsed && 'md:hidden'">{{ item.label }}</span>
          </RouterLink>
        </div>
      </div>
    </nav>

    <div class="shrink-0 border-t border-slate-100"
         :class="collapsed && 'md:hidden'">
      <button type="button"
              class="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              :title="collapsed ? 'Help / Getting Started' : ''"
              @click="showHelp = true">
        <svg viewBox="0 0 24 24" class="h-4 w-4 text-slate-500" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
          <path d="M12 17h.01"/>
        </svg>
        <span :class="collapsed && 'md:hidden'">Help &amp; Getting Started</span>
      </button>
      <div class="border-t border-slate-100 p-3 text-xs text-slate-400">
        v{{ appVersion }}
      </div>
    </div>
  </aside>

  <HelpModal :show="showHelp" @close="showHelp = false" />
</template>

<script>
function iconSvg (name) {
  const paths = {
    home:    '<path d="M3 12l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    grid:    '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    cash:    '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>',
    box:     '<path d="M21 8l-9 4-9-4 9-4 9 4z"/><path d="M3 8v8l9 4 9-4V8"/>',
    tag:     '<path d="M20.6 12.6l-8-8A2 2 0 0011.2 4H5a1 1 0 00-1 1v6.2a2 2 0 00.6 1.4l8 8a2 2 0 002.8 0l5.2-5.2a2 2 0 000-2.8z"/><circle cx="8" cy="8" r="1.4"/>',
    stack:   '<path d="M12 3l9 4-9 4-9-4 9-4z"/><path d="M3 12l9 4 9-4"/><path d="M3 17l9 4 9-4"/>',
    percent: '<line x1="19" y1="5" x2="5" y2="19"/><circle cx="7.5" cy="7.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/>',
    chart:   '<line x1="3" y1="20" x2="21" y2="20"/><rect x="6" y="10" width="3" height="8"/><rect x="11" y="6" width="3" height="12"/><rect x="16" y="13" width="3" height="5"/>',
    users:   '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/><circle cx="17" cy="9" r="3"/><path d="M22 20c0-3-2-5-5-5"/>',
    bolt:    '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    gear:    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/>',
    card:    '<rect x="2" y="6" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="6" y1="15" x2="10" y2="15"/>',
    receipt: '<path d="M6 2v20l3-2 3 2 3-2 3 2V2z"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="13" y2="15"/>',
    generic: '<path d="M4 6h16M4 12h16M4 18h10"/><circle cx="18" cy="18" r="2"/>',
    chef:    '<path d="M6 13h12v7a2 2 0 01-2 2H8a2 2 0 01-2-2v-7z"/><path d="M6 13a4 4 0 01-1-7.7A4 4 0 0112 3a4 4 0 017 2.3A4 4 0 0118 13"/><line x1="9" y1="17" x2="9" y2="19"/><line x1="15" y1="17" x2="15" y2="19"/>',
    flame:   '<path d="M8 2s2 4 2 7-3 4-3 7a5 5 0 0010 0c0-2-1-3-2-4 0 3-2 4-2 4s2-6-2-9c-1 2-3 2-3-5z"/>',
    flask:   '<path d="M9 3h6M10 3v6L4.5 19a2 2 0 001.7 3h11.6a2 2 0 001.7-3L14 9V3"/><line x1="7" y1="14" x2="17" y2="14"/>'
  }
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5">${paths[name] || ''}</svg>`
}
export default { name: 'Sidebar' }
</script>
