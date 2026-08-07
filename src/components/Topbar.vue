<script setup>
import { computed, ref, onBeforeUnmount } from 'vue'
import { useRouter, useRoute, RouterLink } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useTenantStore } from '../stores/tenant'
import ChangePasswordDialog from './ChangePasswordDialog.vue'
import { usePwaInstall } from '../composables/usePwaInstall'

// PWA install — appears in the account dropdown as "Install app". Chrome +
// Edge + Samsung fire beforeinstallprompt; Safari users see the hint on
// login. Hides itself once the app is already running standalone.
const { canInstall, installing, promptInstall } = usePwaInstall()

defineProps({ collapsed: Boolean })
defineEmits(['toggle-sidebar', 'toggle-collapse'])

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const tenant = useTenantStore()
const open = ref(false)

const showChangePassword = ref(false)
const passwordToast = ref('')
const passwordToastTone = ref('emerald')

// Single-shot API submit: /user/profile/change-password verifies old + sets new atomically.
async function submitPasswordChange(oldPw, newPw) {
  const res = await auth.changeMyPassword(oldPw, newPw)
  return res
}
function onPasswordSaved() {
  passwordToast.value = 'Password updated'
  passwordToastTone.value = 'emerald'
  setTimeout(() => passwordToast.value = '', 2500)
}

function logout() {
  auth.logout()
  router.push({ name: 'login' })
}

function onDocClick(e) {
  if (!e.target.closest('#user-menu')) open.value = false
}
document.addEventListener('click', onDocClick)
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))

/* ─── Subscription state (for the top-bar warning chip) ─── */
// Prefer the server-computed flags from the login response
// (tenant.current.subscription). Fall back to computing from the expiry date
// if only the legacy mirrored fields are present.
const subscriptionDaysRemaining = computed(() => {
  const sub = tenant.current?.subscription
  if (sub && typeof sub.days_remaining === 'number') return sub.days_remaining
  const exp = sub?.expiry || tenant.current?.current_subscription_expiry
  if (!exp) return null
  const t = new Date(String(exp).replace(' ', 'T')).getTime()
  if (isNaN(t)) return null
  return Math.ceil((t - Date.now()) / (1000 * 60 * 60 * 24))
})
const subscriptionState = computed(() => {
  const sub = tenant.current?.subscription
  const planUuid = sub?.plan_uuid || tenant.current?.current_subscription_plan_uuid
  if (!planUuid) return 'none'
  const remain = subscriptionDaysRemaining.value
  if (remain != null && remain < 0) return 'expired'
  if (sub?.is_active === false) return 'expired'
  if (sub?.is_near_expiry) return 'expiring-soon'
  const warn = Number(sub?.warning_days ?? tenant.current?.current_subscription_expiry_warning_days) || 0
  if (warn && remain != null && remain <= warn) return 'expiring-soon'
  return 'active'
})

const titles = {
  dashboard: 'Dashboard',
  'order-pos': 'Order POS',
  'terminal-pos': 'Terminal POS',
  'kds-pos': 'KDS POS',
  products: 'Products',
  categories: 'Categories',
  generics: 'Generics',
  stock: 'Stock Management',
  discounts: 'Discounts',
  reports: 'Reports',
  'my-reports': 'MyReports',
  users: 'User Management',
  subscription: 'Subscription',
  'tenant-settings': 'Company Settings'
}
</script>

<template>
  <header class="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur sm:px-6">
    <!-- Mobile drawer toggle -->
    <button class="btn-icon md:hidden" @click="$emit('toggle-sidebar')" aria-label="Menu">
      <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <line x1="4" y1="6"  x2="20" y2="6"/>
        <line x1="4" y1="12" x2="20" y2="12"/>
        <line x1="4" y1="18" x2="20" y2="18"/>
      </svg>
    </button>

    <!-- Desktop collapse toggle -->
    <button
      class="btn-icon hidden md:inline-flex"
      :title="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
      @click="$emit('toggle-collapse')"
    >
      <svg v-if="!collapsed" viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="4" width="18" height="16" rx="2"/>
        <line x1="9" y1="4" x2="9" y2="20"/>
      </svg>
      <svg v-else viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="4" width="18" height="16" rx="2"/>
        <line x1="9" y1="4" x2="9" y2="20"/>
        <polyline points="13 9 16 12 13 15"/>
      </svg>
    </button>

    <div class="min-w-0 flex-1 sm:flex-none">
      <h1 class="truncate text-base font-semibold leading-tight text-slate-800 sm:text-lg">
        {{ titles[route.name] || 'MyLab' }}
      </h1>
      <!-- Mobile-only tenant subline. Desktop shows the tenant badge to the
           right of the title (see below) so this stays hidden there. -->
      <div v-if="tenant.name" class="truncate text-[11px] font-semibold leading-tight text-brand-700 sm:hidden">
        {{ tenant.name }}<span v-if="tenant.code" class="ml-1 font-mono font-normal text-brand-500">· {{ tenant.code }}</span>
      </div>
    </div>

    <!-- Tenant badge -->
    <div
      class="hidden items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs text-brand-700 sm:inline-flex"
      :title="`Tenant UUID: ${tenant.uuid}`"
    >
      <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2h-4a2 2 0 01-2-2v-6H12v6a2 2 0 01-2 2H6a2 2 0 01-2-2V9z"/>
      </svg>
      <span class="font-semibold">{{ tenant.code }}</span>
      <span class="hidden text-brand-600/70 md:inline">· {{ tenant.name }}</span>
    </div>

    <!-- Subscription warning chip -->
    <RouterLink
      v-if="subscriptionState === 'expiring-soon' || subscriptionState === 'expired'"
      to="/subscription"
      class="ml-auto inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition hover:brightness-95"
      :class="subscriptionState === 'expired'
              ? 'border-rose-200 bg-rose-50 text-rose-700'
              : 'border-amber-200 bg-amber-50 text-amber-700'"
      :title="subscriptionState === 'expired'
              ? 'Subscription has expired — click to renew'
              : 'Subscription is near expiry — click to renew'"
    >
      <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <template v-if="subscriptionState === 'expired'">
        <span class="hidden sm:inline">Subscription expired</span>
        <span class="sm:hidden">Expired</span>
        <span v-if="subscriptionDaysRemaining != null && subscriptionDaysRemaining < 0"
              class="hidden font-normal text-rose-600 md:inline">
          · {{ -subscriptionDaysRemaining }}d overdue
        </span>
      </template>
      <template v-else>
        <span class="hidden sm:inline">Subscription near expiry</span>
        <span class="sm:hidden">Near expiry</span>
        <span v-if="subscriptionDaysRemaining != null"
              class="hidden font-normal text-amber-600 md:inline">
          · {{ subscriptionDaysRemaining }}d left
        </span>
      </template>
    </RouterLink>

    <div class="flex items-center gap-2"
         :class="(subscriptionState === 'expiring-soon' || subscriptionState === 'expired') ? '' : 'ml-auto'">
      <div class="hidden text-right sm:block">
        <div class="text-sm font-semibold text-slate-800">{{ auth.user?.name }}</div>
        <div class="text-xs text-slate-500">{{ auth.user?.role }}</div>
      </div>

      <div id="user-menu" class="relative">
        <button class="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-brand-700 font-bold"
                @click.stop="open = !open">
          {{ (auth.user?.name || 'U').charAt(0) }}
        </button>
        <transition name="fade">
          <div v-if="open"
               class="absolute right-0 mt-2 w-56 max-w-[calc(100vw-1rem)] rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
            <div class="border-b border-slate-100 px-3 py-2 sm:hidden">
              <div class="text-sm font-semibold">{{ auth.user?.name }}</div>
              <div class="text-xs text-slate-500">{{ auth.user?.role }}</div>
            </div>
            <button class="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                    @click="open = false; showChangePassword = true">
              <svg viewBox="0 0 24 24" class="h-4 w-4 text-slate-500" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="10" rx="2"/>
                <path d="M7 11V7a5 5 0 0110 0v4"/>
              </svg>
              Change password
            </button>
            <!-- Install as PWA — only visible when the browser hasn't already
                 installed the app AND it fired beforeinstallprompt. -->
            <button v-if="canInstall"
                    class="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-brand-700 hover:bg-brand-50"
                    :disabled="installing"
                    @click="open = false; promptInstall()">
              <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/>
              </svg>
              {{ installing ? 'Installing…' : 'Install as app' }}
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
              Logout
            </button>
          </div>
        </transition>
      </div>
    </div>
  </header>

  <Teleport to="body">
    <ChangePasswordDialog
      :show="showChangePassword"
      :subtitle="`Signed in as @${auth.user?.username || ''}`"
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
