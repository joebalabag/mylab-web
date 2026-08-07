<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import * as paymentsApi from '../../api/tenantSubscriptionPayments'
import * as tenantsApi  from '../../api/tenants'
import * as plansApi    from '../../api/subscriptionPlans'
import StatCard from '../../components/StatCard.vue'
import LineChart from '../../components/LineChart.vue'
import DoughnutChart from '../../components/DoughnutChart.vue'
import EmptyState from '../../components/EmptyState.vue'
import SkeletonRows from '../../components/SkeletonRows.vue'
import { money, number, formatDate, formatDateTime } from '../../utils/format'

// Local calendar day — toISOString slices the UTC date, which shows
// yesterday's date after midnight in +08:00 timezones.
const _pad = (n) => String(n).padStart(2, '0')
const _localISO = (d) => `${d.getFullYear()}-${_pad(d.getMonth() + 1)}-${_pad(d.getDate())}`
const todayISO = () => _localISO(new Date())
const daysAgoISO = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return _localISO(d) }

/* ─── Filters ─── */
const from = ref(daysAgoISO(29))
const to   = ref(todayISO())

/* ─── Data ─── */
const payments        = ref([])
const paymentsLoading = ref(false)
const paymentsError   = ref('')

const tenants        = ref([])
const tenantsLoading = ref(false)
const tenantsError   = ref('')

const plans        = ref([])
const plansLoading = ref(false)
const plansError   = ref('')

async function loadPayments() {
  paymentsLoading.value = true
  paymentsError.value = ''
  try {
    const res = await paymentsApi.listPayments({
      date_from: from.value || undefined,
      date_to:   to.value || undefined,
      page_size: 500
    })
    payments.value = Array.isArray(res?.results) ? res.results : []
  } catch (e) {
    paymentsError.value = e?.message || 'Failed to load payments'
  } finally {
    paymentsLoading.value = false
  }
}
async function loadTenants() {
  tenantsLoading.value = true
  tenantsError.value = ''
  try {
    const res = await tenantsApi.listTenants({ page_size: 500 })
    tenants.value = Array.isArray(res?.results) ? res.results : []
  } catch (e) {
    tenantsError.value = e?.message || 'Failed to load tenants'
  } finally {
    tenantsLoading.value = false
  }
}
async function loadPlans() {
  plansLoading.value = true
  plansError.value = ''
  try {
    const res = await plansApi.listPlans({ page_size: 500 })
    plans.value = Array.isArray(res?.results) ? res.results : []
  } catch (e) {
    plansError.value = e?.message || 'Failed to load plans'
  } finally {
    plansLoading.value = false
  }
}
async function loadAll() {
  await Promise.all([loadPayments(), loadTenants(), loadPlans()])
}

onMounted(loadAll)
watch([from, to], loadPayments)

function setRange(days) {
  to.value = todayISO()
  from.value = daysAgoISO(days - 1)
}

const loading = computed(() =>
  paymentsLoading.value || tenantsLoading.value || plansLoading.value
)
const loadError = computed(() =>
  paymentsError.value || tenantsError.value || plansError.value || ''
)

/* ─── Tabs ─── */
const TABS = [
  { key: 'sales',     label: 'Subscription Sales' },
  { key: 'analytics', label: 'Tenant Analytics' },
  { key: 'activity',  label: 'Payment Activity' }
]
const activeTab = ref('sales')

/* ─── Tenant lookup ─── */
// Payment records may not carry tenant_display_name / tenant_store_code, so we
// resolve them against the tenants list by uuid.
const tenantsByUuid = computed(() => {
  const m = {}
  for (const t of tenants.value) m[t.uuid] = t
  return m
})
function tenantNameFor(p) {
  const embedded = p?.tenant_display_name || p?.tenant_name
  if (embedded) return embedded
  const t = tenantsByUuid.value[p?.tenant_uuid]
  if (t) return t.display_name || t.legal_name || t.store_code || t.uuid
  return p?.tenant_uuid ? `Tenant ${String(p.tenant_uuid).slice(0, 8)}…` : '—'
}
function tenantCodeFor(p) {
  if (p?.tenant_store_code) return p.tenant_store_code
  const t = tenantsByUuid.value[p?.tenant_uuid]
  return t?.store_code || ''
}

/* ─── Derived — subscription sales ─── */
const approved = computed(() => payments.value.filter(p => p.payment_status === 'approved'))
const rejected = computed(() => payments.value.filter(p => p.payment_status === 'rejected'))
const pending  = computed(() => payments.value.filter(p => p.payment_status === 'pending'))

const totalRevenue = computed(() =>
  approved.value.reduce((s, p) => s + Number(p.amount_paid || 0), 0))
const approvedCount = computed(() => approved.value.length)
const rejectedCount = computed(() => rejected.value.length)
const pendingCount  = computed(() => pending.value.length)
const avgTicket = computed(() =>
  approvedCount.value ? totalRevenue.value / approvedCount.value : 0)

function pymtDate(p) {
  const raw = p.reviewed_at || p.updated_at || p.created_at
  return raw ? String(raw).slice(0, 10) : ''
}

const daysInRange = computed(() => {
  const s = new Date(from.value)
  const e = new Date(to.value)
  if (isNaN(s) || isNaN(e) || s > e) return []
  const arr = []
  for (const d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    arr.push(_localISO(d))
  }
  return arr
})

const salesLineLabels = computed(() =>
  daysInRange.value.map(d => new Date(d).toLocaleDateString('en', { month: 'short', day: 'numeric' })))

const salesLineData = computed(() =>
  daysInRange.value.map(d =>
    approved.value.filter(p => pymtDate(p) === d).reduce((s, p) => s + Number(p.amount_paid || 0), 0)
  ))

// Revenue by plan (approved payments only).
const revenueByPlan = computed(() => {
  const m = new Map()
  for (const p of approved.value) {
    const key   = p.subscription_plan_code || p.subscription_plan_uuid || 'unknown'
    const label = p.subscription_plan_name || p.subscription_plan_code || 'Unknown'
    const cur = m.get(key) || { key, label, count: 0, revenue: 0 }
    cur.count += 1
    cur.revenue += Number(p.amount_paid || 0)
    m.set(key, cur)
  }
  return [...m.values()].sort((a, b) => b.revenue - a.revenue)
})
const revenuePlanLabels = computed(() => revenueByPlan.value.map(r => r.label))
const revenuePlanData   = computed(() => revenueByPlan.value.map(r => Math.round(r.revenue * 100) / 100))

// Top-paying tenants.
const revenueByTenant = computed(() => {
  const m = new Map()
  for (const p of approved.value) {
    const key = p.tenant_uuid || 'unknown'
    const cur = m.get(key) || {
      key,
      name: tenantNameFor(p),
      code: tenantCodeFor(p),
      count: 0, revenue: 0
    }
    // Refresh the label if a later fetch of tenants filled in the lookup.
    if (!cur.name || cur.name.startsWith('Tenant ')) cur.name = tenantNameFor(p)
    if (!cur.code) cur.code = tenantCodeFor(p)
    cur.count += 1
    cur.revenue += Number(p.amount_paid || 0)
    m.set(key, cur)
  }
  return [...m.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10)
})

/* ─── Derived — tenant analytics ─── */
const activeTenantsCount = computed(() =>
  tenants.value.filter(t => (t.status || '').toLowerCase() === 'active').length)
const inactiveTenantsCount = computed(() =>
  tenants.value.length - activeTenantsCount.value)

function tenantSubState(t) {
  const exp = t.current_subscription_expiry
  if (!exp || !t.current_subscription_plan_uuid) return 'no-plan'
  const ts = new Date(String(exp).replace(' ', 'T')).getTime()
  if (isNaN(ts)) return 'no-plan'
  const remain = Math.ceil((ts - Date.now()) / (1000 * 60 * 60 * 24))
  if (remain < 0) return 'expired'
  const warn = Number(t.current_subscription_expiry_warning_days) || 0
  if (warn && remain <= warn) return 'expiring-soon'
  return 'active'
}
const subscriptionStateDistribution = computed(() => {
  const buckets = { active: 0, 'expiring-soon': 0, expired: 0, 'no-plan': 0 }
  for (const t of tenants.value) buckets[tenantSubState(t)]++
  return buckets
})
const stateLabels = ['Active', 'Expiring soon', 'Expired', 'No plan']
const stateData = computed(() => [
  subscriptionStateDistribution.value.active,
  subscriptionStateDistribution.value['expiring-soon'],
  subscriptionStateDistribution.value.expired,
  subscriptionStateDistribution.value['no-plan']
])

const planUsageLabels = computed(() =>
  plans.value.map(p => p.name || p.code))
const planUsageData = computed(() =>
  plans.value.map(p =>
    tenants.value.filter(t => t.current_subscription_plan_uuid === p.uuid).length
  ))

const tenantsExpiringSoon = computed(() =>
  tenants.value
    .filter(t => tenantSubState(t) === 'expiring-soon' || tenantSubState(t) === 'expired')
    .map(t => {
      const ts = new Date(String(t.current_subscription_expiry).replace(' ', 'T')).getTime()
      const remain = Math.ceil((ts - Date.now()) / (1000 * 60 * 60 * 24))
      return { ...t, _state: tenantSubState(t), _remain: remain }
    })
    .sort((a, b) => a._remain - b._remain)
    .slice(0, 12))

/* ─── Derived — payment activity ─── */
const recentPayments = computed(() =>
  payments.value.slice().sort((a, b) => {
    const at = new Date(a.created_at || 0).getTime()
    const bt = new Date(b.created_at || 0).getTime()
    return bt - at
  }).slice(0, 15))

/* ─── CSV export ─── */
function exportTopPayingTenants() {
  const header = ['Rank', 'Tenant', 'Store Code', 'Payments', 'Revenue']
  const out = [header]
  revenueByTenant.value.forEach((r, i) => {
    out.push([
      i + 1,
      r.name,
      r.code || '',
      Number(r.count) || 0,
      Number(r.revenue) || 0
    ])
  })
  const csv = out.map(row =>
    row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
  ).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `top-paying-tenants_${from.value}_to_${to.value}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

function statusBadgeClass(s) {
  if (s === 'approved') return 'badge-success'
  if (s === 'rejected') return 'badge-danger'
  return 'badge-warn'
}
function statusLabel(s) {
  if (s === 'approved') return 'Approved'
  if (s === 'rejected') return 'Rejected'
  return 'Pending'
}
</script>

<template>
  <div class="flex min-w-0 flex-col gap-4 sm:h-full">
    <!-- Filters -->
    <div class="card shrink-0">
      <div class="card-body flex flex-wrap items-end gap-3">
        <div>
          <label class="label">From</label>
          <input v-model="from" type="date" class="input" />
        </div>
        <div>
          <label class="label">To</label>
          <input v-model="to" type="date" class="input" />
        </div>
        <div class="flex flex-wrap gap-1.5">
          <button class="btn-secondary !text-xs" @click="setRange(7)">7d</button>
          <button class="btn-secondary !text-xs" @click="setRange(30)">30d</button>
          <button class="btn-secondary !text-xs" @click="setRange(90)">90d</button>
          <button class="btn-secondary !text-xs" @click="setRange(365)">1y</button>
        </div>
        <div class="ml-auto flex items-center gap-2">
          <button class="btn-secondary" :disabled="loading" @click="loadAll" title="Refresh">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
          </button>
        </div>
      </div>
      <div v-if="loading" class="border-t border-slate-100 bg-slate-50 px-4 py-1.5 text-xs text-brand-700">Loading…</div>
      <div v-if="loadError" class="border-t border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-700">
        {{ loadError }}
      </div>
    </div>

    <!-- KPIs -->
    <div class="grid shrink-0 grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
      <StatCard label="Revenue"    :value="money(totalRevenue)" hint="Approved payments"  tone="brand" />
      <StatCard label="Approved"   :value="number(approvedCount)" tone="emerald" />
      <StatCard label="Pending"    :value="number(pendingCount)"  tone="amber" />
      <StatCard label="Rejected"   :value="number(rejectedCount)" tone="rose" />
      <StatCard label="Avg Ticket" :value="money(avgTicket)" tone="brand" />
      <StatCard label="Tenants"    :value="number(tenants.length)" :hint="`${activeTenantsCount} active`" tone="emerald" />
    </div>

    <!-- Tabs -->
    <div class="card flex min-w-0 flex-col sm:flex-1 sm:min-h-0 sm:overflow-hidden">
      <div class="shrink-0 border-b border-slate-100 px-4">
        <nav class="-mb-px flex flex-wrap gap-4">
          <button v-for="t in TABS" :key="t.key"
                  class="border-b-2 py-3 text-sm font-medium"
                  :class="activeTab === t.key ? 'border-indigo-500 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'"
                  @click="activeTab = t.key">
            {{ t.label }}
          </button>
        </nav>
      </div>

      <!-- ─── Subscription Sales ─── -->
      <div v-if="activeTab === 'sales'" class="p-4 space-y-4 sm:min-h-0 sm:flex-1 sm:overflow-auto">
        <div class="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div class="card xl:col-span-2">
            <div class="card-header">
              <div>
                <div class="text-sm font-semibold text-slate-800">Daily revenue</div>
                <div class="text-xs text-slate-500">Approved payments totalled per day</div>
              </div>
            </div>
            <div class="card-body">
              <div v-if="paymentsLoading && !payments.length" class="flex h-64 items-center justify-center text-xs text-slate-400">
                Loading trend…
              </div>
              <div v-else class="h-64">
                <LineChart :labels="salesLineLabels" :data="salesLineData" label="Revenue" />
              </div>
            </div>
          </div>
          <div class="card">
            <div class="card-header">
              <div class="text-sm font-semibold text-slate-800">Revenue by plan</div>
            </div>
            <div class="card-body">
              <div v-if="paymentsLoading && !payments.length" class="flex h-64 items-center justify-center text-xs text-slate-400">
                Loading share…
              </div>
              <div v-else-if="!revenuePlanData.length" class="flex h-64 items-center justify-center text-xs text-slate-400">
                No approved payments in range.
              </div>
              <div v-else class="h-64">
                <DoughnutChart :labels="revenuePlanLabels" :data="revenuePlanData" />
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div>
              <div class="text-sm font-semibold text-slate-800">Top-paying tenants</div>
              <div class="text-xs text-slate-500">Ranked by total approved payment amount in range</div>
            </div>
            <button class="btn-secondary !text-xs"
                    :disabled="!revenueByTenant.length"
                    @click="exportTopPayingTenants">
              <svg viewBox="0 0 24 24" class="mr-1 inline-block h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Export CSV
            </button>
          </div>
          <div class="overflow-x-auto">
            <table v-if="revenueByTenant.length" class="table">
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th class="text-right">Payments</th>
                  <th class="text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in revenueByTenant" :key="r.key">
                  <td>
                    <div class="font-semibold text-slate-800">{{ r.name }}</div>
                    <div v-if="r.code" class="font-mono text-[10px] text-slate-500">{{ r.code }}</div>
                  </td>
                  <td class="text-right">{{ number(r.count) }}</td>
                  <td class="text-right font-semibold">{{ money(r.revenue) }}</td>
                </tr>
              </tbody>
            </table>
            <EmptyState v-else title="No revenue in range" message="Widen the date filter or wait for approvals." />
          </div>
        </div>
      </div>

      <!-- ─── Tenant Analytics ─── -->
      <div v-else-if="activeTab === 'analytics'" class="p-4 space-y-4 sm:min-h-0 sm:flex-1 sm:overflow-auto">
        <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div class="card">
            <div class="card-header">
              <div>
                <div class="text-sm font-semibold text-slate-800">Subscription state</div>
                <div class="text-xs text-slate-500">Current status of every tenant</div>
              </div>
            </div>
            <div class="card-body">
              <div class="h-64">
                <DoughnutChart :labels="stateLabels" :data="stateData" />
              </div>
            </div>
          </div>
          <div class="card">
            <div class="card-header">
              <div>
                <div class="text-sm font-semibold text-slate-800">Plan usage</div>
                <div class="text-xs text-slate-500">Tenants currently on each plan</div>
              </div>
            </div>
            <div class="card-body">
              <div v-if="!planUsageData.length" class="flex h-64 items-center justify-center text-xs text-slate-400">
                No plans configured.
              </div>
              <div v-else class="h-64">
                <DoughnutChart :labels="planUsageLabels" :data="planUsageData" />
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div>
              <div class="text-sm font-semibold text-slate-800">Expiring / expired tenants</div>
              <div class="text-xs text-slate-500">Sorted by soonest expiry — reach out to renew</div>
            </div>
          </div>
          <div class="overflow-x-auto">
            <table v-if="tenantsExpiringSoon.length" class="table">
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Expiry</th>
                  <th class="text-right">Days</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="t in tenantsExpiringSoon" :key="t.uuid">
                  <td>
                    <div class="font-semibold text-slate-800">{{ t.display_name }}</div>
                    <div class="font-mono text-[10px] text-slate-500">{{ t.store_code }}</div>
                  </td>
                  <td class="text-xs text-slate-700">{{ formatDate(t.current_subscription_expiry) }}</td>
                  <td class="text-right font-mono text-xs"
                      :class="t._state === 'expired' ? 'text-rose-700' : 'text-amber-700'">
                    <template v-if="t._remain < 0">{{ -t._remain }}d overdue</template>
                    <template v-else>{{ t._remain }}d left</template>
                  </td>
                  <td>
                    <span v-if="t._state === 'expired'" class="badge-danger">Expired</span>
                    <span v-else class="badge-warn">Expiring soon</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <EmptyState v-else title="All caught up"
                        message="No tenants are near expiry — good news." />
          </div>
        </div>
      </div>

      <!-- ─── Payment Activity ─── -->
      <div v-else class="p-4 space-y-4 sm:min-h-0 sm:flex-1 sm:overflow-auto">
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div class="card"><div class="card-body">
            <div class="text-xs uppercase tracking-widest text-slate-500">Pending</div>
            <div class="mt-1 text-2xl font-bold text-amber-600">{{ number(pendingCount) }}</div>
            <div class="text-[11px] text-slate-500">Awaiting review</div>
          </div></div>
          <div class="card"><div class="card-body">
            <div class="text-xs uppercase tracking-widest text-slate-500">Approved</div>
            <div class="mt-1 text-2xl font-bold text-emerald-600">{{ number(approvedCount) }}</div>
            <div class="text-[11px] text-slate-500">In selected range</div>
          </div></div>
          <div class="card"><div class="card-body">
            <div class="text-xs uppercase tracking-widest text-slate-500">Rejected</div>
            <div class="mt-1 text-2xl font-bold text-rose-600">{{ number(rejectedCount) }}</div>
            <div class="text-[11px] text-slate-500">In selected range</div>
          </div></div>
        </div>

        <div class="card">
          <div class="card-header">
            <div>
              <div class="text-sm font-semibold text-slate-800">Recent activity</div>
              <div class="text-xs text-slate-500">Most recent 15 payment submissions in range</div>
            </div>
          </div>
          <div class="overflow-x-auto">
            <SkeletonRows v-if="paymentsLoading && !payments.length" :rows="5"
                          :columns="['lines','wide','bar','bar','pill']" />
            <table v-else-if="recentPayments.length" class="table">
              <thead>
                <tr>
                  <th>Submitted</th>
                  <th>Tenant</th>
                  <th>Plan</th>
                  <th class="text-right">Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in recentPayments" :key="p.uuid">
                  <td class="whitespace-nowrap text-xs text-slate-600">{{ formatDateTime(p.created_at) }}</td>
                  <td>
                    <div class="font-semibold text-slate-800">{{ tenantNameFor(p) }}</div>
                    <div v-if="tenantCodeFor(p)" class="font-mono text-[10px] text-slate-500">
                      {{ tenantCodeFor(p) }}
                    </div>
                  </td>
                  <td>
                    <div class="text-sm text-slate-800">{{ p.subscription_plan_name || p.subscription_plan_code || '—' }}</div>
                  </td>
                  <td class="text-right font-semibold text-slate-800">
                    {{ p.amount_paid != null ? money(p.amount_paid) : '—' }}
                  </td>
                  <td>
                    <span :class="statusBadgeClass(p.payment_status)">{{ statusLabel(p.payment_status) }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <EmptyState v-else title="No payment activity" message="No payments were submitted in this range." />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
