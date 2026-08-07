<script setup>
import { ref, computed } from 'vue'
import { useTenantStore } from '../../stores/tenant'
import ReportHeader from '../../components/ReportHeader.vue'
import LineChart from '../../components/LineChart.vue'
import DoughnutChart from '../../components/DoughnutChart.vue'
import { getSummaryReport } from '../../api/reports'
import { PAYMENT_METHOD_LABELS } from '../../api/payments'
import { exportCsv, printReport } from '../../utils/csvExport'
import { money, formatDate } from '../../utils/format'

const tenant = useTenantStore()
const filters = ref({})
const data = ref(null)
const loading = ref(false)
const error = ref('')

async function reload(f) {
  filters.value = f; loading.value = true; error.value = ''
  try { data.value = await getSummaryReport(f) }
  catch (e) { error.value = e?.message || 'Failed to load' }
  finally { loading.value = false }
}

const trendLabels  = computed(() => (data.value?.daily_trend || []).map(r => formatDate(r.date)))
const trendData    = computed(() => (data.value?.daily_trend || []).map(r => Number(r.revenue || 0)))
const methodLabels = computed(() => (data.value?.by_method   || []).map(r => PAYMENT_METHOD_LABELS[r.payment_method] || r.payment_method))
const methodData   = computed(() => (data.value?.by_method   || []).map(r => Number(r.total || 0)))

function pct(n) { return (Number(n) || 0).toFixed(1) + '%' }

function exportRows() {
  if (!data.value) return
  // KPI block first, then per-method, then per-cashier — one CSV with three
  // section headers. Excel opens it clean and preserves the structure.
  const rows = []
  rows.push({ section: 'KPI', metric: 'Revenue', value: data.value.revenue })
  rows.push({ section: 'KPI', metric: 'Discounts', value: data.value.discounts_given })
  rows.push({ section: 'KPI', metric: 'Payments count', value: data.value.payments_count })
  rows.push({ section: 'KPI', metric: 'Voided amount', value: data.value.voided_amount })
  rows.push({ section: 'KPI', metric: 'Voided count', value: data.value.voided_count })
  rows.push({ section: 'KPI', metric: 'Void rate %', value: data.value.void_rate_pct })
  rows.push({ section: 'KPI', metric: 'Outstanding A/R', value: data.value.outstanding_ar })
  rows.push({ section: 'KPI', metric: 'Expenses', value: data.value.expenses })
  rows.push({ section: 'KPI', metric: 'Net income', value: data.value.net_income })
  rows.push({ section: 'Ticket', metric: 'Average', value: data.value.avg_ticket })
  rows.push({ section: 'Ticket', metric: 'Highest', value: data.value.max_ticket })
  rows.push({ section: 'Ticket', metric: 'Lowest',  value: data.value.min_ticket })
  for (const m of data.value.by_method || []) {
    rows.push({ section: 'Method', metric: PAYMENT_METHOD_LABELS[m.payment_method] || m.payment_method,
                value: m.total, extra: `${m.count} txns` })
  }
  for (const c of data.value.top_cashiers || []) {
    rows.push({ section: 'Cashier', metric: c.cashier, value: c.revenue, extra: `${c.count} txns` })
  }
  exportCsv(`summary-${filters.value.date_from || 'all'}_${filters.value.date_to || 'now'}`,
    rows, [
      { key: 'section', label: 'Section' },
      { key: 'metric', label: 'Item' },
      { key: 'value', label: 'Value' },
      { key: 'extra', label: 'Notes' },
    ])
}
</script>

<template>
  <div class="flex h-full flex-col gap-4 overflow-auto pb-8">
    <ReportHeader title="Summary Report"
                  description="Snapshot of revenue, transactions, methods, and net income for the range."
                  :loading="loading"
                  @change="reload" @export-csv="exportRows" @print="printReport" />

    <div v-if="error" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{{ error }}</div>

    <div class="print-area space-y-4">
      <div class="hidden print:block text-center">
        <h1 class="text-lg font-bold">{{ tenant.current?.name || 'Laboratory' }} — Summary Report</h1>
        <p class="text-xs text-slate-500">
          {{ filters.date_from ? formatDate(filters.date_from) : 'earliest' }} to
          {{ filters.date_to ? formatDate(filters.date_to) : 'latest' }}
        </p>
      </div>

      <!-- ─── Core KPIs ─── -->
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <div class="card"><div class="card-body">
          <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Revenue</div>
          <div class="mt-1 text-2xl font-bold text-emerald-600 tabular-nums">{{ money(data?.revenue || 0) }}</div>
          <div class="text-[11px] text-slate-500">{{ data?.payments_count || 0 }} payments</div>
        </div></div>
        <div class="card"><div class="card-body">
          <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Discounts Given</div>
          <div class="mt-1 text-2xl font-bold text-amber-600 tabular-nums">− {{ money(data?.discounts_given || 0) }}</div>
        </div></div>
        <div class="card"><div class="card-body">
          <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Voided</div>
          <div class="mt-1 text-2xl font-bold text-slate-700 tabular-nums">{{ money(data?.voided_amount || 0) }}</div>
          <div class="text-[11px] text-slate-500">
            {{ data?.voided_count || 0 }} voided
            <span v-if="data?.void_rate_pct != null" class="ml-1">· {{ pct(data.void_rate_pct) }}</span>
          </div>
        </div></div>
        <div class="card"><div class="card-body">
          <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Outstanding A/R</div>
          <div class="mt-1 text-2xl font-bold text-rose-600 tabular-nums">{{ money(data?.outstanding_ar || 0) }}</div>
          <div class="text-[11px] text-slate-500">{{ data?.outstanding_count || 0 }} pending</div>
        </div></div>
        <div class="card"><div class="card-body">
          <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Expenses</div>
          <div class="mt-1 text-2xl font-bold text-rose-600 tabular-nums">{{ money(data?.expenses || 0) }}</div>
          <div class="text-[11px] text-slate-500">{{ data?.expenses_count || 0 }} recorded</div>
        </div></div>
        <div class="card sm:col-span-2 lg:col-span-3"><div class="card-body">
          <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Net Income</div>
          <div class="mt-1 text-3xl font-bold tabular-nums"
               :class="(data?.net_income || 0) >= 0 ? 'text-brand-700' : 'text-rose-700'">
            {{ money(data?.net_income || 0) }}
          </div>
          <div class="text-[11px] text-slate-500">Revenue − Expenses (excludes outstanding A/R)</div>
        </div></div>
      </div>

      <!-- ─── Transaction analytics ─── -->
      <div class="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <!-- Ticket size KPIs -->
        <div class="card">
          <div class="card-header">
            <div class="text-sm font-semibold text-slate-800">Ticket Size</div>
            <span class="text-xs text-slate-500">Per-transaction spread</span>
          </div>
          <div class="card-body space-y-2 text-sm">
            <div class="flex items-center justify-between">
              <span class="text-slate-600">Average</span>
              <span class="font-bold text-brand-700 tabular-nums">{{ money(data?.avg_ticket || 0) }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-slate-600">Highest</span>
              <span class="font-semibold text-emerald-700 tabular-nums">{{ money(data?.max_ticket || 0) }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-slate-600">Lowest</span>
              <span class="text-slate-700 tabular-nums">{{ money(data?.min_ticket || 0) }}</span>
            </div>
            <div class="flex items-center justify-between border-t border-slate-100 pt-2">
              <span class="text-slate-600">Void rate</span>
              <span class="font-semibold tabular-nums"
                    :class="(data?.void_rate_pct || 0) > 5 ? 'text-rose-700' : 'text-slate-700'">
                {{ pct(data?.void_rate_pct || 0) }}
              </span>
            </div>
          </div>
        </div>

        <!-- Payment method mix (doughnut) -->
        <div class="card">
          <div class="card-header">
            <div class="text-sm font-semibold text-slate-800">Payment Method Mix</div>
            <span class="text-xs text-slate-500">Share of completed revenue</span>
          </div>
          <div class="card-body">
            <div v-if="loading" class="h-56 animate-pulse rounded bg-slate-50"></div>
            <div v-else-if="!methodLabels.length" class="flex h-56 items-center justify-center text-xs text-slate-400">
              No payments yet.
            </div>
            <div v-else class="h-56"><DoughnutChart :labels="methodLabels" :data="methodData" /></div>
          </div>
        </div>

        <!-- Top cashiers -->
        <div class="card">
          <div class="card-header">
            <div class="text-sm font-semibold text-slate-800">Top Cashiers</div>
            <span class="text-xs text-slate-500">By revenue collected</span>
          </div>
          <div class="card-body">
            <div v-if="loading" class="h-40 animate-pulse rounded bg-slate-50"></div>
            <div v-else-if="!data?.top_cashiers?.length" class="py-4 text-center text-xs text-slate-400">
              No cashier activity.
            </div>
            <ul v-else class="space-y-1 text-sm">
              <li v-for="(c, i) in data.top_cashiers" :key="c.cashier"
                  class="flex items-baseline justify-between border-b border-slate-100 py-1 last:border-none">
                <span class="truncate">
                  <span class="mr-1 text-[10px] font-bold text-slate-400">#{{ i + 1 }}</span>
                  {{ c.cashier }}
                </span>
                <span class="text-right">
                  <span class="block font-semibold text-brand-700 tabular-nums">{{ money(c.revenue) }}</span>
                  <span class="block text-[10px] text-slate-400">{{ c.count }} txns</span>
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Daily revenue trend + Method breakdown table -->
      <div class="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div class="card lg:col-span-2">
          <div class="card-header">
            <div class="text-sm font-semibold text-slate-800">Daily Revenue Trend</div>
            <span class="text-xs text-slate-500">Non-arrangement completed payments</span>
          </div>
          <div class="card-body">
            <div v-if="loading" class="h-56 animate-pulse rounded bg-slate-50"></div>
            <div v-else-if="!trendLabels.length" class="flex h-56 items-center justify-center text-xs text-slate-400">
              No revenue in this range.
            </div>
            <div v-else class="h-56"><LineChart :labels="trendLabels" :data="trendData" label="Revenue" /></div>
          </div>
        </div>

        <div class="card overflow-hidden">
          <div class="card-header">
            <div class="text-sm font-semibold text-slate-800">Method Breakdown</div>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead class="bg-slate-50">
                <tr>
                  <th class="px-2 py-1.5 text-left">Method</th>
                  <th class="px-2 py-1.5 text-right">Txns</th>
                  <th class="px-2 py-1.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!data?.by_method?.length && !loading">
                  <td colspan="3" class="py-3 text-center text-xs text-slate-400">No data.</td>
                </tr>
                <tr v-for="m in data?.by_method || []" :key="m.payment_method"
                    class="border-b border-slate-100">
                  <td class="px-2 py-1.5">{{ PAYMENT_METHOD_LABELS[m.payment_method] || m.payment_method }}</td>
                  <td class="px-2 py-1.5 text-right">{{ m.count }}</td>
                  <td class="px-2 py-1.5 text-right font-semibold text-emerald-700 tabular-nums">{{ money(m.total) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
