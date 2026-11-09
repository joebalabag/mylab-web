<script setup>
import { RouterLink, useRouter } from 'vue-router'
import { useOwnerStore } from '../stores/owner'
import { assetUrl } from '../api/client'
import MyLabLogo from '../assets/MyLab-icon.png'

defineProps({
  open: Boolean,
  collapsed: Boolean
})
defineEmits(['close', 'toggle-collapse'])

const owner = useOwnerStore()
const router = useRouter()

const nav = [
  { to: '/owner/dashboard',        label: 'Dashboard',        icon: 'grid' },
  { to: '/owner/tenants',          label: 'Tenants',          icon: 'store' },
  { to: '/owner/tenant-reports',   label: 'Tenant Reports',   icon: 'folder-chart' },
  // Migrations is intentionally hidden for now — endpoint + view still
  // exist (/owner/migrations) and can be re-exposed by re-adding this row.
  // { to: '/owner/migrations',    label: 'Migrations',       icon: 'swap' },
  { to: '/owner/catalog',          label: 'Catalog',          icon: 'list' },
  { to: '/owner/catalog/compare',  label: 'Price Comparison', icon: 'chart' },
  { to: '/owner/users',            label: 'Users',            icon: 'users' },
  { to: '/owner/settings',         label: 'Settings',         icon: 'cog' }
]

function logout() {
  owner.logout()
  router.push({ name: 'owner-login' })
}
</script>

<template>
  <transition name="fade">
    <div
      v-if="open"
      class="fixed inset-0 z-30 bg-slate-950/50 md:hidden"
      @click="$emit('close')"
    />
  </transition>

  <aside
    class="fixed inset-y-0 left-0 z-40 flex w-64 -translate-x-full transform flex-col border-r border-slate-800 bg-slate-950 text-slate-200
           transition-[width,transform] duration-200 md:translate-x-0"
    :class="[
      { 'translate-x-0': open },
      collapsed ? 'md:w-20' : 'md:w-64'
    ]"
  >
    <div class="relative flex h-16 items-center gap-3 border-b border-slate-800 px-5"
         :class="collapsed && 'md:justify-center md:px-0'">
      <img :src="MyLabLogo" alt="MyLab"
           class="h-9 w-9 shrink-0 rounded-lg bg-white/10 object-contain p-1" />
      <div :class="collapsed && 'md:hidden'">
        <div class="text-sm font-bold text-white">MyLab</div>
        <div class="text-[10px] uppercase tracking-widest text-amber-300">Owner Console</div>
      </div>

      <button
        v-if="!collapsed"
        class="ml-auto hidden h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-800 hover:text-slate-100 md:inline-flex"
        title="Collapse sidebar"
        @click="$emit('toggle-collapse')"
      >
        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
    </div>

    <!-- Owner branding banner — sits at the top of the menu, before Dashboard.
         Collapses to just the logo square when the sidebar is collapsed. -->
    <div v-if="owner.currentUser?.logo_url || owner.currentUser?.business_name"
         class="border-b border-slate-800 p-3"
         :class="collapsed && 'md:px-2'">
      <RouterLink
        to="/owner/dashboard"
        :title="collapsed ? (owner.currentUser?.business_name || 'Owner') : ''"
        class="flex items-center gap-3 rounded-lg bg-slate-900/60 p-2 ring-1 ring-inset ring-slate-800 hover:ring-amber-500/30"
        :class="collapsed && 'md:justify-center md:p-1.5'"
      >
        <div class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white"
             :class="collapsed && 'md:h-10 md:w-10'">
          <img
            v-if="owner.currentUser?.logo_url"
            :src="assetUrl(owner.currentUser.logo_url)"
            :alt="owner.currentUser?.business_name || 'Owner logo'"
            class="h-full w-full object-contain"
          />
          <span v-else class="text-sm font-bold text-slate-700">
            {{ (owner.currentUser?.business_name || owner.currentUser?.name || 'O').slice(0,1).toUpperCase() }}
          </span>
        </div>
        <div class="min-w-0" :class="collapsed && 'md:hidden'">
          <div class="truncate text-sm font-semibold text-white">
            {{ owner.currentUser?.business_name || owner.currentUser?.name }}
          </div>
          <div class="truncate text-[10px] uppercase tracking-widest text-amber-300">
            Your branches
          </div>
        </div>
      </RouterLink>
    </div>

    <nav class="flex-1 overflow-y-auto p-3" :class="collapsed && 'md:px-2'">
      <RouterLink
        v-for="item in nav"
        :key="item.to"
        :to="item.to"
        :title="collapsed ? item.label : ''"
        @click="$emit('close')"
        class="mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300
               hover:bg-slate-800 hover:text-white"
        :class="collapsed && 'md:justify-center md:px-0'"
        active-class="!bg-amber-500/10 !text-amber-300 ring-1 ring-inset ring-amber-500/30"
      >
        <span class="inline-flex h-6 w-6 shrink-0 items-center justify-center text-amber-300" v-html="iconSvg(item.icon)"></span>
        <span :class="collapsed && 'md:hidden'">{{ item.label }}</span>
      </RouterLink>
    </nav>

    <div class="space-y-2 border-t border-slate-800 p-3">
      <div v-if="!collapsed" class="rounded-lg bg-slate-900 p-3">
        <div class="text-[10px] uppercase tracking-widest text-slate-500">Signed in as</div>
        <div class="mt-0.5 truncate text-sm font-semibold text-slate-100">
          {{ owner.currentUser?.name }}
        </div>
        <div class="truncate text-xs text-amber-300">{{ owner.currentUser?.business_name || 'Owner' }}</div>
      </div>
      <button
        class="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
        @click="logout"
        :title="collapsed ? 'Sign out' : ''"
      >
        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        <span :class="collapsed && 'md:hidden'">Sign out</span>
      </button>
    </div>
  </aside>
</template>

<script>
function iconSvg (name) {
  const paths = {
    grid:    '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    store:   '<path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v10a1 1 0 001 1h14a1 1 0 001-1V9"/><path d="M9 22V12h6v10"/>',
    'folder-chart': '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><line x1="9" y1="17" x2="9" y2="13"/><line x1="13" y1="17" x2="13" y2="11"/><line x1="17" y1="17" x2="17" y2="14"/>',
    swap:    '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/>',
    list:    '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
    chart:   '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
    users:   '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>',
    cog:     '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h.01a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v.01a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/>'
  }
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5">${paths[name] || ''}</svg>`
}
export default { name: 'OwnerSidebar' }
</script>
