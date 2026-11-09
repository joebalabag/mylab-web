<script setup>
import { ref, watch, computed, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import OwnerSidebar from '../components/OwnerSidebar.vue'
import ChangePasswordDialog from '../components/ChangePasswordDialog.vue'
import { useOwnerStore } from '../stores/owner'
import { assetUrl } from '../api/client'

const sidebarOpen = ref(false)
const collapsed   = ref(JSON.parse(localStorage.getItem('pos_owner_sidebar_collapsed') || 'false'))
const route = useRoute()
const router = useRouter()
const owner = useOwnerStore()

watch(collapsed, v => localStorage.setItem('pos_owner_sidebar_collapsed', JSON.stringify(v)))

function toggleCollapse() { collapsed.value = !collapsed.value }

const pageTitle = computed(() => ({
  'owner-dashboard':         'Dashboard',
  'owner-tenants':           'Tenants',
  'owner-tenant-reports':    'Tenant Reports',
  'owner-migrations':        'Migrations',
  'owner-catalog':           'Catalog',
  'owner-catalog-compare':   'Price Comparison',
  'owner-users':             'Users',
  'owner-settings':          'Settings'
}[route.name] || 'Owner Console'))

const menuOpen = ref(false)
const showChangePassword = ref(false)
const passwordToast = ref('')

async function submitPasswordChange(oldPw, newPw) {
  return await owner.changeMyPassword(oldPw, newPw)
}
function onPasswordSaved() {
  passwordToast.value = 'Password updated'
  setTimeout(() => passwordToast.value = '', 2500)
}

function goToSettings() {
  menuOpen.value = false
  router.push({ name: 'owner-settings' })
}

function logout() {
  owner.logout()
  router.push({ name: 'owner-login' })
}

function onDocClick(e) {
  if (!e.target.closest('#owner-user-menu')) menuOpen.value = false
}
document.addEventListener('click', onDocClick)
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div class="flex h-full bg-slate-100">
    <OwnerSidebar
      :open="sidebarOpen"
      :collapsed="collapsed"
      @close="sidebarOpen = false"
      @toggle-collapse="toggleCollapse"
    />

    <div
      class="flex min-h-full min-w-0 flex-1 flex-col transition-[padding] duration-200"
      :class="collapsed ? 'md:pl-20' : 'md:pl-64'"
    >
      <header class="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
        <button
          class="btn-icon md:hidden"
          @click="sidebarOpen = !sidebarOpen"
          aria-label="Open sidebar"
        >
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <button
          v-if="collapsed"
          class="btn-icon hidden md:inline-flex"
          @click="toggleCollapse"
          title="Expand sidebar"
        >
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>

        <div>
          <div class="text-[10px] font-bold uppercase tracking-widest text-amber-600">MyLab Owner</div>
          <div class="text-base font-semibold text-slate-800">{{ pageTitle }}</div>
        </div>

        <div class="ml-auto flex items-center gap-3">
          <div class="hidden text-right sm:block">
            <div class="text-xs text-slate-500">Signed in as</div>
            <div class="text-sm font-semibold text-slate-800">
              {{ owner.currentUser?.name }}
            </div>
          </div>

          <div id="owner-user-menu" class="relative">
            <button
              class="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-amber-500 to-orange-600 text-sm font-bold text-white"
              @click.stop="menuOpen = !menuOpen"
              aria-label="Account menu"
            >
              <img
                v-if="owner.currentUser?.logo_url"
                :src="assetUrl(owner.currentUser.logo_url)"
                :alt="owner.currentUser?.business_name || 'Owner'"
                class="h-full w-full object-cover"
              />
              <span v-else>{{ (owner.currentUser?.name || 'O').slice(0,1).toUpperCase() }}</span>
            </button>
            <transition name="fade">
              <div v-if="menuOpen"
                   class="absolute right-0 mt-2 w-56 max-w-[calc(100vw-1rem)] rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
                <div class="border-b border-slate-100 px-3 py-2">
                  <div class="text-sm font-semibold text-slate-800">
                    {{ owner.currentUser?.name }}
                  </div>
                  <div class="text-xs text-slate-500">{{ owner.currentUser?.email }}</div>
                </div>
                <button class="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                        @click="goToSettings">
                  <svg viewBox="0 0 24 24" class="h-4 w-4 text-slate-500" fill="none" stroke="currentColor" stroke-width="2"
                       stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h.01a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v.01a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/>
                  </svg>
                  Settings
                </button>
                <button class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                        @click="menuOpen = false; showChangePassword = true">
                  <svg viewBox="0 0 24 24" class="h-4 w-4 text-slate-500" fill="none" stroke="currentColor" stroke-width="2"
                       stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="11" width="18" height="10" rx="2"/>
                    <path d="M7 11V7a5 5 0 0110 0v4"/>
                  </svg>
                  Change password
                </button>
                <div class="my-1 h-px bg-slate-100"></div>
                <button class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
                        @click="logout">
                  <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                       stroke-linecap="round" stroke-linejoin="round">
                    <path d="M16 17l5-5-5-5"/>
                    <path d="M21 12H9"/>
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                  </svg>
                  Sign out
                </button>
              </div>
            </transition>
          </div>
        </div>
      </header>

      <main class="flex-1 overflow-y-auto p-4 sm:p-6">
        <RouterView v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </RouterView>
      </main>
    </div>
  </div>

  <Teleport to="body">
    <ChangePasswordDialog
      :show="showChangePassword"
      :subtitle="`Signed in as ${owner.currentUser?.email || ''}`"
      :submit="submitPasswordChange"
      :min-length="8"
      @close="showChangePassword = false"
      @saved="onPasswordSaved"
    />

    <transition name="fade">
      <div v-if="passwordToast"
           class="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg">
        {{ passwordToast }}
      </div>
    </transition>
  </Teleport>
</template>
