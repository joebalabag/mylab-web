<script setup>
import { ref, watch, computed, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SuperAdminSidebar from '../components/SuperAdminSidebar.vue'
import ChangePasswordDialog from '../components/ChangePasswordDialog.vue'
import { useSuperAdminStore } from '../stores/superAdmin'

const sidebarOpen = ref(false)
const collapsed   = ref(JSON.parse(localStorage.getItem('pos_super_sidebar_collapsed') || 'false'))
const route = useRoute()
const router = useRouter()
const superAdmin = useSuperAdminStore()

watch(collapsed, v => localStorage.setItem('pos_super_sidebar_collapsed', JSON.stringify(v)))

function toggleCollapse() { collapsed.value = !collapsed.value }

const pageTitle = computed(() => ({
  'super-dashboard':             'Dashboard',
  'super-tenants':               'Tenants / Stores',
  'super-plans':                 'Subscription Plans',
  'super-subscription-payments': 'Subscription Payments',
  'super-tenant-users':          'Tenant Users',
  'super-active-users':          'Active Users',
  'super-reports':               'Reports',
  'super-users':                 'MyLab Admin'
}[route.name] || 'Platform'))

const menuOpen = ref(false)
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

function onDocClick(e) {
  if (!e.target.closest('#super-user-menu')) menuOpen.value = false
}
document.addEventListener('click', onDocClick)
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div class="flex h-full bg-slate-100">
    <SuperAdminSidebar
      :open="sidebarOpen"
      :collapsed="collapsed"
      @close="sidebarOpen = false"
      @toggle-collapse="toggleCollapse"
    />

    <div
      class="flex min-h-full min-w-0 flex-1 flex-col transition-[padding] duration-200"
      :class="collapsed ? 'md:pl-20' : 'md:pl-64'"
    >
      <!-- Super-admin topbar -->
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
          <div class="text-[10px] font-bold uppercase tracking-widest text-indigo-600">MyLab</div>
          <div class="text-base font-semibold text-slate-800">{{ pageTitle }}</div>
        </div>

        <div class="ml-auto flex items-center gap-3">
          <div class="hidden text-right sm:block">
            <div class="text-xs text-slate-500">Signed in as</div>
            <div class="text-sm font-semibold text-slate-800">
              {{ superAdmin.currentUser?.name || superAdmin.currentUser?.username }}
            </div>
          </div>

          <div id="super-user-menu" class="relative">
            <button
              class="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-600 text-sm font-bold text-white"
              @click.stop="menuOpen = !menuOpen"
              aria-label="Account menu"
            >
              {{ (superAdmin.currentUser?.name || 'S').slice(0,1).toUpperCase() }}
            </button>
            <transition name="fade">
              <div v-if="menuOpen"
                   class="absolute right-0 mt-2 w-56 max-w-[calc(100vw-1rem)] rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
                <div class="border-b border-slate-100 px-3 py-2">
                  <div class="text-sm font-semibold text-slate-800">
                    {{ superAdmin.currentUser?.name || superAdmin.currentUser?.username }}
                  </div>
                  <div class="text-xs text-slate-500 font-mono">@{{ superAdmin.currentUser?.username }}</div>
                </div>
                <button class="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
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
  </Teleport>
</template>
