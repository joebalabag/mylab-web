<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useTenantStore } from '../stores/tenant'
import * as analytics from '../api/analytics'
import { PAYMENT_METHOD_LABELS } from '../api/payments'
import LineChart from '../components/LineChart.vue'
import BarChart from '../components/BarChart.vue'
import DoughnutChart from '../components/DoughnutChart.vue'
import { money, formatDate } from '../utils/format'

const router = useRouter()
const auth   = useAuthStore()
const tenant = useTenantStore()

// ─── Date range with presets ───
// Backend treats date_to as inclusive end-of-day. YYYY-MM-DD in local time
// so a preset like "today" doesn't accidentally hop over the midnight roll.
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function shiftDay(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const dateFrom = ref(shiftDay(todayStr(), -29))  // Default: last 30 days incl. today
const dateTo   = ref(todayStr())
const activePreset = ref('30d')

function applyPreset(k) {
  activePreset.value = k
  const today = todayStr()
  dateTo.value = today
  if (k === 'today')    dateFrom.value = today
  else if (k === '7d')  dateFrom.value = shiftDay(today, -6)
  else if (k === '30d') dateFrom.value = shiftDay(today, -29)
  else if (k === 'mtd') dateFrom.value = today.slice(0, 8) + '01'
  else if (k === 'ytd') dateFrom.value = today.slice(0, 4) + '-01-01'
  // 'custom' — leave whatever the user picked
  loadAll()
}
function onCustomRange() {
  activePreset.value = 'custom'
  loadAll()
}

// ─── Data + loading state per widget ───
const state = ref({
  summary:  { loading: false, data: null,  error: '' },
  trend:    { loading: false, data: [],    error: '' },
  method:   { loading: false, data: [],    error: '' },
  receiv:   { loading: false, data: null,  error: '' },
  through:  { loading: false, data: [],    error: '' },
  topItems: { loading: false, data: [],    error: '' },
  profit:   { loading: false, data: null,  error: '' },
})

async function loadWidget(key, fn) {
  state.value[key].loading = true
  state.value[key].error = ''
  try {
    state.value[key].data = await fn({ date_from: dateFrom.value, date_to: dateTo.value })
  } catch (e) {
    state.value[key].error = e?.message || 'Failed to load'
  } finally {
    state.value[key].loading = false
  }
}

// Fire every widget in parallel — dashboard is read-only, no ordering needed.
async function loadAll() {
  await Promise.all([
    loadWidget('summary',  analytics.getRevenueSummary),
    loadWidget('trend',    analytics.getRevenueTrend),
    loadWidget('method',   analytics.getMethodBreakdown),
    loadWidget('receiv',   analytics.getReceivables),
    loadWidget('through',  analytics.getThroughput),
    loadWidget('topItems', analytics.getTopItems),
    loadWidget('profit',   analytics.getProfitability),
  ])
}

onMounted(async () => {
  // Make sure we have a fresh subscription snapshot for the subscription card.
  try { await tenant.loadCurrentFromApi() } catch (_) { /* non-fatal */ }
  await loadAll()
})

// ─── Subscription mirror (same shape the Topbar / SubscriptionView use) ───
const subscription = computed(() => tenant.current?.subscription || null)
const subscriptionDaysRemaining = computed(() => {
  const sub = subscription.value
  if (sub && typeof sub.days_remaining === 'number') return sub.days_remaining
  const exp = sub?.expiry || tenant.current?.current_subscription_expiry
  if (!exp) return null
  const ms = new Date(exp).getTime() - Date.now()
  return Math.ceil(ms / 86_400_000)
})
const subscriptionTone = computed(() => {
  const sub = subscription.value
  if (!sub) return 'neutral'
  if (!sub.is_active) return 'danger'
  if (sub.is_near_expiry) return 'warn'
  return 'ok'
})

// ─── Chart data shaping ───
const trendLabels = computed(() => (state.value.trend.data || []).map(r => formatDate(r.date)))
const trendData   = computed(() => (state.value.trend.data || []).map(r => Number(r.revenue || 0)))

const methodLabels = computed(() => (state.value.method.data || [])
  .map(r => PAYMENT_METHOD_LABELS[r.payment_method] || r.payment_method))
const methodData   = computed(() => (state.value.method.data || []).map(r => Number(r.total || 0)))

const throughLabels    = computed(() => (state.value.through.data || []).map(r => formatDate(r.date)))
const throughCases     = computed(() => (state.value.through.data || []).map(r => Number(r.cases || 0)))
const throughReqs      = computed(() => (state.value.through.data || []).map(r => Number(r.requisitions || 0)))

// Profitability — two line series (revenue vs expenses) built into a labels-only bar for now
const profitLabels   = computed(() => (state.value.profit.data?.by_day || []).map(r => formatDate(r.date)))
const profitRevenue  = computed(() => (state.value.profit.data?.by_day || []).map(r => Number(r.revenue || 0)))
const profitExpenses = computed(() => (state.value.profit.data?.by_day || []).map(r => Number(r.expenses || 0)))

function goResolve(row) {
  // Jump to the cashier list, filtered to arrangements. The user can hit the
  // Resolve action from there. (Deep-linking to the resolve modal would need
  // extra plumbing; this is the cheap path.)
  router.push({ name: 'cashier' })
}
</script>

<template>
  <div class="flex h-full flex-col gap-4 overflow-auto pb-8">
    <!-- ═══ Header: title + subscription card + date range ═══ -->
    <div class="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <!-- Title / breadcrumb -->
      <div class="card lg:col-span-2">
        <div class="card-body">
          <div class="text-sm font-semibold text-slate-800">Dashboard</div>
          <div class="text-xs text-slate-500">
            Analytics for {{ tenant.current?.name || 'this laboratory' }} · showing
            <b>{{ formatDate(dateFrom) }}</b> to <b>{{ formatDate(dateTo) }}</b>
          </div>
          <!-- Preset chips + custom range -->
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <div class="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-xs">
              <button v-for="p in [
                        { k: 'today', label: 'Today' },
                        { k: '7d',    label: '7d' },
                        { k: '30d',   label: '30d' },
                        { k: 'mtd',   label: 'MTD' },
                        { k: 'ytd',   label: 'YTD' }
                      ]" :key="p.k"
                      @click="applyPreset(p.k)"
                      class="rounded px-2.5 py-1 font-semibold transition-colors"
                      :class="activePreset === p.k
                              ? 'bg-white text-brand-700 shadow-sm'
                              : 'text-slate-500 hover:text-slate-800'">
                {{ p.label }}
              </button>
            </div>
            <input type="date" v-model="dateFrom" @change="onCustomRange"
                   :max="dateTo || undefined" class="input !py-1 !text-xs w-36" />
            <span class="text-xs text-slate-400">→</span>
            <input type="date" v-model="dateTo" @change="onCustomRange"
                   :min="dateFrom || undefined" class="input !py-1 !text-xs w-36" />
          </div>
        </div>
      </div>

      <!-- Subscription card — mirrors the Topbar's warning states -->
      <router-link to="/subscription" class="card block cursor-pointer transition hover:shadow-md">
        <div class="card-body">
          <div class="flex items-center justify-between">
            <div class="text-xs font-semibold uppercase tracking-widest text-slate-500">Subscription</div>
            <span v-if="subscriptionTone === 'ok'"
                  class="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-700">Active</span>
            <span v-else-if="subscriptionTone === 'warn'"
                  class="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-700">Near expiry</span>
            <span v-else-if="subscriptionTone === 'danger'"
                  class="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-rose-700">Expired</span>
            <span v-else class="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-500">None</span>
          </div>
          <div class="mt-1 text-lg font-bold text-slate-800">
            {{ subscription?.plan_name || 'No active plan' }}
          </div>
          <div class="mt-1 text-[11px] text-slate-500">
            <template v-if="subscription?.expiry">
              Expires {{ formatDate(subscription.expiry) }}
              <span v-if="subscriptionDaysRemaining != null">
                · <b :class="subscriptionTone === 'ok' ? 'text-emerald-600'
                             : subscriptionTone === 'warn' ? 'text-amber-600'
                             : 'text-rose-600'">
                    {{ subscriptionDaysRemaining >= 0 ? `${subscriptionDaysRemaining}d left` : `${-subscriptionDaysRemaining}d overdue` }}
                  </b>
              </span>
            </template>
            <template v-else>Click to manage subscription →</template>
          </div>
        </div>
      </router-link>
    </div>

    <!-- ═══ FINANCIAL — revenue KPIs ═══ -->
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div class="card"><div class="card-body">
        <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Revenue Collected</div>
        <div v-if="state.summary.loading" class="mt-2 h-8 w-32 animate-pulse rounded bg-slate-100"></div>
        <div v-else class="mt-1 text-2xl font-bold text-emerald-600 tabular-nums">
          {{ money(state.summary.data?.collected_total || 0) }}
        </div>
        <div class="text-[11px] text-slate-500">{{ state.summary.data?.collected_count || 0 }} payments</div>
      </div></div>

      <div class="card"><div class="card-body">
        <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Outstanding A/R</div>
        <div v-if="state.summary.loading" class="mt-2 h-8 w-32 animate-pulse rounded bg-slate-100"></div>
        <div v-else class="mt-1 text-2xl font-bold text-rose-600 tabular-nums">
          {{ money(state.summary.data?.outstanding_total || 0) }}
        </div>
        <div class="text-[11px] text-slate-500">{{ state.summary.data?.outstanding_count || 0 }} pending arrangements</div>
      </div></div>

      <div class="card"><div class="card-body">
        <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Today's Cash</div>
        <div v-if="state.summary.loading" class="mt-2 h-8 w-32 animate-pulse rounded bg-slate-100"></div>
        <div v-else class="mt-1 text-2xl font-bold text-brand-700 tabular-nums">
          {{ money(state.summary.data?.today_cash_total || 0) }}
        </div>
        <div class="text-[11px] text-slate-500">{{ state.summary.data?.today_cash_count || 0 }} cash payments today</div>
      </div></div>
    </div>

    <!-- Revenue trend + Method breakdown -->
    <div class="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <div class="card lg:col-span-2">
        <div class="card-header">
          <div class="text-sm font-semibold text-slate-800">Revenue Trend</div>
          <span class="text-xs text-slate-500">Daily collected revenue (arrangements excluded)</span>
        </div>
        <div class="card-body">
          <div v-if="state.trend.loading" class="h-56 animate-pulse rounded bg-slate-50"></div>
          <div v-else-if="!trendLabels.length" class="flex h-56 items-center justify-center text-xs text-slate-400">
            No revenue in this range.
          </div>
          <div v-else class="h-56"><LineChart :labels="trendLabels" :data="trendData" label="Revenue" /></div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="text-sm font-semibold text-slate-800">Payment Method</div>
          <span class="text-xs text-slate-500">Share of collected revenue</span>
        </div>
        <div class="card-body">
          <div v-if="state.method.loading" class="h-56 animate-pulse rounded bg-slate-50"></div>
          <div v-else-if="!methodLabels.length" class="flex h-56 items-center justify-center text-xs text-slate-400">
            No payments yet.
          </div>
          <div v-else class="h-56"><DoughnutChart :labels="methodLabels" :data="methodData" /></div>
        </div>
      </div>
    </div>

    <!-- ═══ RECEIVABLES ═══ -->
    <div class="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <!-- Aging buckets -->
      <div class="card">
        <div class="card-header">
          <div class="text-sm font-semibold text-slate-800">A/R Aging</div>
          <span class="text-xs text-slate-500">As of today</span>
        </div>
        <div class="card-body space-y-1.5 text-sm">
          <template v-if="state.receiv.data">
            <div v-for="b in [
                    { k: 'bucket_0_30',   label: '0 – 30 days',  color: 'text-emerald-700' },
                    { k: 'bucket_31_60',  label: '31 – 60 days', color: 'text-amber-700' },
                    { k: 'bucket_61_90',  label: '61 – 90 days', color: 'text-orange-700' },
                    { k: 'bucket_over_90',label: 'Over 90 days', color: 'text-rose-700' }
                  ]" :key="b.k" class="flex items-center justify-between">
              <span class="text-slate-600">{{ b.label }}</span>
              <span class="font-semibold tabular-nums" :class="b.color">
                {{ money(state.receiv.data.totals[b.k] || 0) }}
              </span>
            </div>
            <div class="mt-2 flex items-center justify-between border-t border-slate-200 pt-2">
              <span class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Total pending</span>
              <span class="text-base font-bold text-brand-700 tabular-nums">{{ money(state.receiv.data.totals.grand_total || 0) }}</span>
            </div>
          </template>
          <div v-else-if="state.receiv.loading" class="h-40 animate-pulse rounded bg-slate-50"></div>
        </div>
      </div>

      <!-- Top counter-parties -->
      <div class="card">
        <div class="card-header">
          <div class="text-sm font-semibold text-slate-800">Top Billed-To</div>
          <span class="text-xs text-slate-500">Company / guarantor outstanding</span>
        </div>
        <div class="card-body">
          <div v-if="state.receiv.loading" class="h-40 animate-pulse rounded bg-slate-50"></div>
          <div v-else-if="!state.receiv.data?.by_billed_to?.length"
               class="py-4 text-center text-xs text-slate-400">No outstanding arrangements.</div>
          <ul v-else class="space-y-1 text-sm">
            <li v-for="row in state.receiv.data.by_billed_to" :key="row.billed_to"
                class="flex items-center justify-between border-b border-slate-100 py-1 last:border-none">
              <span class="truncate text-slate-800">{{ row.billed_to }}</span>
              <span class="ml-2 whitespace-nowrap font-semibold text-rose-700 tabular-nums">{{ money(row.total) }}</span>
            </li>
          </ul>
        </div>
      </div>

      <!-- Oldest pending -->
      <div class="card">
        <div class="card-header flex items-center justify-between">
          <div>
            <div class="text-sm font-semibold text-slate-800">Oldest Pending</div>
            <span class="text-xs text-slate-500">Chase these first</span>
          </div>
          <router-link to="/cashier" class="btn-ghost !text-xs">Open Cashier →</router-link>
        </div>
        <div class="card-body">
          <div v-if="state.receiv.loading" class="h-40 animate-pulse rounded bg-slate-50"></div>
          <div v-else-if="!state.receiv.data?.oldest?.length"
               class="py-4 text-center text-xs text-slate-400">Nothing overdue.</div>
          <table v-else class="w-full text-xs">
            <tbody>
              <tr v-for="row in state.receiv.data.oldest" :key="row.uuid" class="border-b border-slate-100 last:border-none">
                <td class="py-1.5">
                  <div class="font-mono font-semibold text-slate-800">{{ row.payment_number }}</div>
                  <div class="text-slate-500 truncate max-w-[10rem]">{{ row.billed_to || row.patient_last_name || '—' }}</div>
                </td>
                <td class="py-1.5 text-right">
                  <div class="font-semibold text-rose-700 tabular-nums">{{ money(row.total) }}</div>
                  <div class="text-slate-400 text-[10px]">{{ row.age_days }}d old</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ═══ OPERATIONS ═══ -->
    <div class="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <div class="card lg:col-span-2">
        <div class="card-header">
          <div class="text-sm font-semibold text-slate-800">Cases &amp; Requisitions</div>
          <span class="text-xs text-slate-500">Daily throughput</span>
        </div>
        <div class="card-body">
          <div v-if="state.through.loading" class="h-56 animate-pulse rounded bg-slate-50"></div>
          <div v-else-if="!throughLabels.length" class="flex h-56 items-center justify-center text-xs text-slate-400">
            No case activity.
          </div>
          <!-- Two bars per day: cases + requisitions. Simple approach — render
               requisitions overlaid; a full stacked bar would need a custom
               Chart config. -->
          <div v-else class="h-56"><BarChart :labels="throughLabels" :data="throughReqs" label="Requisitions" /></div>
          <div v-if="throughLabels.length" class="mt-2 text-[11px] text-slate-500">
            {{ throughCases.reduce((a, b) => a + b, 0) }} cases ·
            {{ throughReqs.reduce((a, b) => a + b, 0) }} requisitions this range
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="text-sm font-semibold text-slate-800">Top Tests</div>
          <span class="text-xs text-slate-500">By revenue</span>
        </div>
        <div class="card-body">
          <div v-if="state.topItems.loading" class="h-56 animate-pulse rounded bg-slate-50"></div>
          <div v-else-if="!state.topItems.data?.length"
               class="py-4 text-center text-xs text-slate-400">No items billed.</div>
          <ol v-else class="space-y-1 text-sm">
            <li v-for="(row, i) in state.topItems.data" :key="row.code + i"
                class="flex items-baseline justify-between border-b border-slate-100 py-1 last:border-none">
              <span class="truncate">
                <span class="mr-1 text-[10px] font-bold text-slate-400">#{{ i + 1 }}</span>
                <span class="font-mono text-[11px] text-slate-500">{{ row.code }}</span>
                <span class="ml-1 text-slate-800">{{ row.name }}</span>
              </span>
              <span class="ml-2 whitespace-nowrap text-right">
                <span class="block font-semibold text-brand-700 tabular-nums">{{ money(row.revenue) }}</span>
                <span class="block text-[10px] text-slate-400">{{ row.qty }} unit(s)</span>
              </span>
            </li>
          </ol>
        </div>
      </div>
    </div>

    <!-- ═══ PROFITABILITY ═══ -->
    <div class="card">
      <div class="card-header">
        <div class="text-sm font-semibold text-slate-800">Revenue vs Expenses</div>
        <span class="text-xs text-slate-500">Net income for the range</span>
      </div>
      <div class="card-body">
        <div v-if="state.profit.loading" class="h-40 animate-pulse rounded bg-slate-50"></div>
        <div v-else class="grid grid-cols-1 gap-4 lg:grid-cols-4">
          <!-- Totals -->
          <div class="space-y-2 text-sm lg:col-span-1">
            <div class="flex items-center justify-between">
              <span class="text-slate-600">Revenue</span>
              <span class="font-semibold text-emerald-600 tabular-nums">{{ money(state.profit.data?.revenue || 0) }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-slate-600">Expenses</span>
              <span class="font-semibold text-rose-600 tabular-nums">− {{ money(state.profit.data?.expenses || 0) }}</span>
            </div>
            <div class="flex items-center justify-between border-t border-slate-200 pt-2">
              <span class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Net</span>
              <span class="text-lg font-bold tabular-nums"
                    :class="(state.profit.data?.net || 0) >= 0 ? 'text-brand-700' : 'text-rose-700'">
                {{ money(state.profit.data?.net || 0) }}
              </span>
            </div>
          </div>

          <!-- Daily bars: revenue only. Expenses on hover via tooltip could
               use a proper multi-dataset chart later; for now revenue bar with
               expenses summarized on the left. -->
          <div class="lg:col-span-3">
            <div v-if="!profitLabels.length" class="flex h-40 items-center justify-center text-xs text-slate-400">
              No data in this range.
            </div>
            <div v-else class="h-40"><BarChart :labels="profitLabels" :data="profitRevenue" label="Revenue" /></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
