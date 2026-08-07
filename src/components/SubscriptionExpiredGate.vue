<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTenantStore } from '../stores/tenant'
import { useAuthStore } from '../stores/auth'
import { useSubscriptionGuardStore } from '../stores/subscriptionGuard'
import Modal from './Modal.vue'
import { formatDate } from '../utils/format'

const tenant = useTenantStore()
const auth = useAuthStore()
const guard = useSubscriptionGuardStore()
const router = useRouter()
const route = useRoute()

// Routes where the expired-subscription block is enforced. Dashboard and
// Subscription stay reachable so a manager can review and submit a renewal.
const BLOCKED_ROUTES = new Set([
  'users',
  'tenant-settings',
  'discounts',
  'expenses'
])
const isBlockedRoute = computed(() => BLOCKED_ROUTES.has(route.name))

const isCashier = computed(() => auth.user?.role === 'cashier')

function logout() {
  auth.logout()
  router.push({ name: 'login' })
}
function goDashboard() {
  // Temporary bypass — hard navigation sidesteps the fade `mode="out-in"`
  // transition in MainLayout, which was leaving a blank frame when the
  // expired-modal was open at the moment of route change.
  window.location.href = '/dashboard'
}

const subscriptionDaysRemaining = computed(() => {
  const sub = tenant.current?.subscription
  if (sub && typeof sub.days_remaining === 'number') return sub.days_remaining
  const exp = sub?.expiry || tenant.current?.current_subscription_expiry
  if (!exp) return null
  const t = new Date(String(exp).replace(' ', 'T')).getTime()
  if (isNaN(t)) return null
  return Math.ceil((t - Date.now()) / (1000 * 60 * 60 * 24))
})

const subscriptionExpiryDate = computed(() =>
  tenant.current?.subscription?.expiry
    || tenant.current?.current_subscription_expiry
    || null
)

const isExpired = computed(() => {
  const sub = tenant.current?.subscription
  const planUuid = sub?.plan_uuid || tenant.current?.current_subscription_plan_uuid
  if (!planUuid) return false
  if (sub?.is_active === false) return true
  const remain = subscriptionDaysRemaining.value
  return remain != null && remain < 0
})

// The modal shows when:
//   (a) the client-side snapshot says the subscription is expired AND the
//       user landed on a restricted route (POS / stock / reports / etc.), or
//   (b) any recent API call came back with 403 subscription.expired — the
//       backend has explicitly said "no more" so we honor it on every route.
// Case (b) covers scenarios where the cached snapshot is stale (renewal
// window boundary, another tab renewed, etc.) — the backend is always right.
const shouldBlock = computed(() =>
  guard.forcedExpired || (isExpired.value && isBlockedRoute.value)
)
</script>

<template>
  <Modal :show="shouldBlock" title="Subscription expired" size="md" @close="() => {}">
    <div class="space-y-4">
      <div class="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
        <svg viewBox="0 0 24 24" class="mt-0.5 h-5 w-5 shrink-0" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <div>
          <div class="font-semibold">Your subscription has expired.</div>
          <div class="mt-0.5">
            Transactions are paused until the subscription is renewed. Submit a payment and wait for platform approval to resume selling.
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3 text-xs">
        <div class="rounded-lg border border-slate-100 bg-slate-50 p-3">
          <div class="text-[10px] uppercase tracking-widest text-slate-500">Expired on</div>
          <div class="mt-0.5 text-sm font-semibold text-slate-800">
            {{ formatDate(subscriptionExpiryDate) }}
          </div>
        </div>
        <div class="rounded-lg border border-slate-100 bg-slate-50 p-3">
          <div class="text-[10px] uppercase tracking-widest text-slate-500">Overdue by</div>
          <div class="mt-0.5 text-sm font-semibold text-rose-700">
            <template v-if="subscriptionDaysRemaining != null">
              {{ -subscriptionDaysRemaining }} day{{ subscriptionDaysRemaining === -1 ? '' : 's' }}
            </template>
            <template v-else>—</template>
          </div>
        </div>
      </div>

      <div class="text-[11px] text-slate-500">
        Need to check what happened? Ask your platform administrator, or go to the Subscription page to review payment history.
      </div>
    </div>
    <template #footer>
      <button v-if="!isCashier"
              class="btn-secondary"
              title="Temporary — bypass the block and open the Dashboard"
              @click="goDashboard">
        Go to Dashboard
      </button>
      <button class="btn-primary" @click="logout">
        Log out
      </button>
    </template>
  </Modal>
</template>
