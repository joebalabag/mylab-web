<script setup>
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useSuperAdminStore } from '../stores/superAdmin'
import ChangePasswordDialog from './ChangePasswordDialog.vue'
import MyLabLogo from '../assets/MyLab-icon.png'

defineProps({
  open: Boolean,
  collapsed: Boolean
})
defineEmits(['close', 'toggle-collapse'])

const superAdmin = useSuperAdminStore()
const router = useRouter()

const nav = [
  { to: '/super/dashboard', label: 'Dashboard',          icon: 'grid' },
  { to: '/super/tenants',   label: 'Tenants / Stores',   icon: 'store' },
  { to: '/super/plans',     label: 'Subscription Plans', icon: 'plan' },
  { to: '/super/subscription-payments', label: 'Subscription Payments', icon: 'receipt' },
  { to: '/super/tenant-users', label: 'Tenant Users',    icon: 'users' },
  { to: '/super/active-users', label: 'Active Users',    icon: 'pulse' },
  { to: '/super/reports',   label: 'Reports',            icon: 'chart' },
  { to: '/super/users',     label: 'MyLab Admin',       icon: 'shield' }
]

const showChangePassword = ref(false)
const passwordToast = ref('')

async function submitPasswordChange(oldPw, newPw) {
  return await superAdmin.changeMyPassword(oldPw, newPw)
}
function onPasswordSaved() {
  passwordToast.value = 'Password updated'
  setTimeout(() => passwordToast.value = '', 2500)
}

function logout() {
  superAdmin.logout()
  router.push({ name: 'super-login' })
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
        <div class="text-[10px] uppercase tracking-widest text-indigo-300">Platform Console</div>
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
        active-class="!bg-indigo-500/10 !text-indigo-300 ring-1 ring-inset ring-indigo-500/30"
      >
        <span class="inline-flex h-6 w-6 shrink-0 items-center justify-center text-indigo-300" v-html="iconSvg(item.icon)"></span>
        <span :class="collapsed && 'md:hidden'">{{ item.label }}</span>
      </RouterLink>
    </nav>

    <div class="space-y-2 border-t border-slate-800 p-3">
      <div v-if="!collapsed" class="rounded-lg bg-slate-900 p-3">
        <div class="text-[10px] uppercase tracking-widest text-slate-500">Signed in as</div>
        <div class="mt-0.5 truncate text-sm font-semibold text-slate-100">
          {{ superAdmin.currentUser?.name || superAdmin.currentUser?.username }}
        </div>
        <div class="truncate text-xs text-indigo-300">{{ superAdmin.currentUser?.role }}</div>
      </div>
      <button
        class="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
        @click="showChangePassword = true"
        :title="collapsed ? 'Change password' : ''"
      >
        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="10" rx="2"/>
          <path d="M7 11V7a5 5 0 0110 0v4"/>
        </svg>
        <span :class="collapsed && 'md:hidden'">Change password</span>
      </button>
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

  <ChangePasswordDialog
    :show="showChangePassword"
    :subtitle="`Signed in as @${superAdmin.currentUser?.username || ''}`"
    :submit="submitPasswordChange"
    @close="showChangePassword = false"
    @saved="onPasswordSaved"
  />

  <transition name="fade">
    <div v-if="passwordToast"
         class="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg">
      {{ passwordToast }}
    </div>
  </transition>
</template>

<script>
function iconSvg (name) {
  const paths = {
    grid:   '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    store:  '<path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v10a1 1 0 001 1h14a1 1 0 001-1V9"/><path d="M9 22V12h6v10"/>',
    plan:   '<rect x="3" y="6" width="18" height="12" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="7" y1="15" x2="11" y2="15"/>',
    receipt:'<path d="M4 3h16v18l-3-2-3 2-3-2-3 2-4-2z"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="13" y2="16"/>',
    users:  '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>',
    chart:  '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
    pulse:  '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
    shield: '<path d="M12 2l9 4v6c0 5-3.5 9-9 10-5.5-1-9-5-9-10V6l9-4z"/><polyline points="9 12 11 14 15 10"/>'
  }
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5">${paths[name] || ''}</svg>`
}
export default { name: 'SuperAdminSidebar' }
</script>
