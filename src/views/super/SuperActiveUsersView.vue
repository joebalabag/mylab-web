<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as presenceApi from '../../api/presence'
import EmptyState from '../../components/EmptyState.vue'
import SkeletonRows from '../../components/SkeletonRows.vue'
import { formatDateTime } from '../../utils/format'

// Poll cadence for the panel. Keep it slower than the FE heartbeat (30s)
// so we never render an empty state just because a tab is one tick late.
const REFRESH_MS = 15_000

const windowMinutes = ref(2)
const items = ref([])
const asOf = ref(null)
const userCount = ref(0)
const tenantCount = ref(0)

const loading = ref(false)
const error = ref('')
const autoRefresh = ref(true)
let refreshTimer = null

async function loadOnce() {
  loading.value = true
  error.value = ''
  try {
    const res = await presenceApi.listActiveUsers({ minutes: windowMinutes.value })
    items.value = Array.isArray(res?.results) ? res.results : []
    userCount.value = Number(res?.user_count) || items.value.length
    tenantCount.value = Number(res?.tenant_count) || 0
    asOf.value = res?.as_of || new Date().toISOString()
  } catch (e) {
    error.value = e?.message || 'Failed to load active users'
  } finally {
    loading.value = false
  }
}

function startTimer() {
  stopTimer()
  if (!autoRefresh.value) return
  refreshTimer = setInterval(loadOnce, REFRESH_MS)
}
function stopTimer() {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}
watch(autoRefresh, (on) => { on ? startTimer() : stopTimer() })
watch(windowMinutes, () => loadOnce())

onMounted(() => {
  loadOnce()
  startTimer()
})
onBeforeUnmount(stopTimer)

// Group by tenant for the panel — one card per tenant, users nested inside.
// Users without a tenant_uuid (shouldn't happen for staff tokens but guard
// anyway) bucket under an "Unassigned" pseudo-tenant so nothing is dropped.
const grouped = computed(() => {
  const byTenant = new Map()
  for (const u of items.value) {
    const key = u.tenant_uuid || '__unassigned__'
    if (!byTenant.has(key)) {
      byTenant.set(key, {
        tenant_uuid: u.tenant_uuid || null,
        tenant_display_name: u.tenant_display_name || (u.tenant_uuid ? null : 'Unassigned'),
        tenant_store_code: u.tenant_store_code || null,
        users: []
      })
    }
    byTenant.get(key).users.push(u)
  }
  return Array.from(byTenant.values()).sort((a, b) => {
    // Most active first — tenants with more concurrent users at the top.
    if (b.users.length !== a.users.length) return b.users.length - a.users.length
    const an = (a.tenant_display_name || '').toLowerCase()
    const bn = (b.tenant_display_name || '').toLowerCase()
    return an.localeCompare(bn)
  })
})

function relative(secondsAgo) {
  const s = Math.max(0, Math.round(secondsAgo || 0))
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s ago`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m ago`
}

function freshnessClass(secondsAgo) {
  const s = Number(secondsAgo) || 0
  if (s <= 45)  return 'bg-emerald-500'
  if (s <= 90)  return 'bg-amber-500'
  return 'bg-slate-400'
}

const ROLE_LABEL = {
  manager:     'Manager',
  cashier:     'Cashier',
  stock_clerk: 'Stock Clerk',
  staff:       'Staff'
}
const roleLabel = (r) => ROLE_LABEL[r] || r || '—'

// Compact browser + OS label from a raw User-Agent string. Deliberately
// tiny — the full UA sits in a title tooltip for the rare case an admin
// needs the exact spec (offline PWA, embedded WebView, etc.).
function browserLabel(ua) {
  if (!ua) return ''
  let browser = ''
  let m
  if ((m = ua.match(/Edg\/(\d+)/)))                     browser = `Edge ${m[1]}`
  else if ((m = ua.match(/OPR\/(\d+)/)))                browser = `Opera ${m[1]}`
  else if ((m = ua.match(/Firefox\/(\d+)/)))            browser = `Firefox ${m[1]}`
  else if ((m = ua.match(/Chrome\/(\d+)/)))             browser = `Chrome ${m[1]}`
  else if ((m = ua.match(/Version\/(\d+).*Safari\//)))  browser = `Safari ${m[1]}`
  else if (/Safari/.test(ua))                            browser = 'Safari'
  else                                                   browser = 'Browser'

  let os = ''
  if (/Windows NT 10/.test(ua))            os = 'Windows'
  else if (/Windows NT/.test(ua))          os = 'Windows'
  else if (/Mac OS X/.test(ua))            os = 'macOS'
  else if (/Android/.test(ua))             os = 'Android'
  else if (/(iPhone|iPad|iPod)/.test(ua))  os = 'iOS'
  else if (/Linux/.test(ua))               os = 'Linux'

  return os ? `${browser} · ${os}` : browser
}
</script>

<template>
  <div class="flex h-full flex-col gap-4">
    <div class="card flex flex-1 min-h-0 flex-col overflow-hidden">
      <div class="card-header">
        <div>
          <div class="text-sm font-semibold text-slate-800">Currently Active Users</div>
          <div class="text-xs text-slate-500">
            Live presence from the API's in-memory tracker.
            <span v-if="asOf" class="ml-1">Updated {{ formatDateTime(asOf) }}</span>
            <span v-if="loading" class="ml-1 text-brand-600">· refreshing…</span>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <label class="inline-flex items-center gap-2 text-xs text-slate-600">
            <span class="hidden sm:inline">Window</span>
            <select v-model.number="windowMinutes" class="input !py-1 !text-xs">
              <option :value="1">1 min</option>
              <option :value="2">2 min</option>
              <option :value="5">5 min</option>
              <option :value="10">10 min</option>
              <option :value="30">30 min</option>
            </select>
          </label>
          <label class="inline-flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" v-model="autoRefresh" class="h-4 w-4 rounded border-slate-300" />
            Auto-refresh
          </label>
          <button class="btn-secondary !px-3" @click="loadOnce" :disabled="loading" title="Refresh">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-600">
        <span class="inline-flex items-center gap-1.5">
          <span class="h-2 w-2 rounded-full bg-emerald-500"></span>
          <b class="text-slate-800">{{ userCount }}</b> user{{ userCount === 1 ? '' : 's' }} online
        </span>
        <span class="text-slate-300">·</span>
        <span>
          across <b class="text-slate-800">{{ tenantCount }}</b> tenant{{ tenantCount === 1 ? '' : 's' }}
        </span>
        <span class="text-slate-300">·</span>
        <span>seen within the last {{ windowMinutes }} min</span>
      </div>

      <div v-if="error" class="border-b border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        {{ error }}
      </div>

      <div class="min-h-0 flex-1 overflow-auto p-4">
        <SkeletonRows
          v-if="loading && !items.length"
          :rows="6"
          label="Loading presence…"
          :columns="['avatar','lines','wide','bar','pill','dot']"
        />
        <EmptyState v-else-if="!items.length && !loading"
                    title="No one is online right now"
                    :message="`No user activity in the last ${windowMinutes} minute${windowMinutes === 1 ? '' : 's'}.`" />

        <div v-else class="space-y-4">
          <div v-for="group in grouped" :key="group.tenant_uuid || 'unassigned'"
               class="rounded-lg border border-slate-200 bg-white">
            <div class="flex items-center justify-between border-b border-slate-100 px-4 py-2">
              <div class="min-w-0">
                <div class="truncate text-sm font-semibold text-slate-800">
                  {{ group.tenant_display_name || (group.tenant_uuid ? `Tenant ${String(group.tenant_uuid).slice(0, 8)}…` : 'Unassigned') }}
                </div>
                <div v-if="group.tenant_store_code" class="font-mono text-[10px] text-slate-500">
                  {{ group.tenant_store_code }}
                </div>
              </div>
              <span class="badge-info">
                {{ group.users.length }} online
              </span>
            </div>
            <ul class="divide-y divide-slate-100">
              <li v-for="u in group.users" :key="u.uuid"
                  class="flex items-center gap-3 px-4 py-2.5">
                <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                  {{ (u.name || u.username || '?').charAt(0).toUpperCase() }}
                </div>
                <div class="min-w-0 flex-1">
                  <div class="truncate text-sm font-medium text-slate-800">
                    {{ u.name || u.username }}
                  </div>
                  <div class="truncate font-mono text-[11px] text-slate-500">
                    @{{ u.username }}
                    <span v-if="u.role" class="ml-1 text-slate-400">· {{ roleLabel(u.role) }}</span>
                  </div>
                  <div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                    <span v-if="u.ip" class="inline-flex items-center gap-1" :title="`IP address: ${u.ip}`">
                      <svg viewBox="0 0 24 24" class="h-3 w-3 text-slate-400" fill="none" stroke="currentColor" stroke-width="2"
                           stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="2" y1="12" x2="22" y2="12"/>
                        <path d="M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/>
                      </svg>
                      <span class="font-mono">{{ u.ip }}</span>
                    </span>
                    <span v-if="u.user_agent" class="inline-flex items-center gap-1"
                          :title="u.user_agent">
                      <svg viewBox="0 0 24 24" class="h-3 w-3 text-slate-400" fill="none" stroke="currentColor" stroke-width="2"
                           stroke-linecap="round" stroke-linejoin="round">
                        <rect x="2" y="3" width="20" height="14" rx="2"/>
                        <line x1="8" y1="21" x2="16" y2="21"/>
                        <line x1="12" y1="17" x2="12" y2="21"/>
                      </svg>
                      {{ browserLabel(u.user_agent) }}
                    </span>
                  </div>
                </div>
                <div class="hidden text-right sm:block">
                  <div class="inline-flex items-center gap-1.5 text-xs text-slate-600">
                    <span class="h-2 w-2 rounded-full" :class="freshnessClass(u.seconds_ago)"></span>
                    {{ relative(u.seconds_ago) }}
                  </div>
                  <div class="text-[10px] text-slate-400">
                    {{ formatDateTime(u.last_seen_at) }}
                  </div>
                </div>
                <div class="sm:hidden">
                  <span class="h-2 w-2 rounded-full" :class="freshnessClass(u.seconds_ago)"></span>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
