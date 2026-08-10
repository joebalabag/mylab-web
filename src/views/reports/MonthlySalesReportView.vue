<script setup>
import { ref, computed } from 'vue'
import { useTenantStore } from '../../stores/tenant'
import ReportHeader from '../../components/ReportHeader.vue'
import BarChart from '../../components/BarChart.vue'
import { getMonthlySalesReport } from '../../api/reports'
import { exportCsv, printReport } from '../../utils/csvExport'
import { money } from '../../utils/format'

const tenant = useTenantStore()
const filters = ref({})
const data = ref(null)
const loading = ref(false)
const error = ref('')

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

async function reload(f) {
  filters.value = f
  loading.value = true
  error.value = ''
  try { data.value = await getMonthlySalesReport(f) }
  catch (e) { error.value = e?.message || 'Failed to load' }
  finally { loading.value = false }
}

const chartLabels  = computed(() => (data.value?.months || []).map(m => MONTHS[m.month - 1]))
const chartRevenue = computed(() => (data.value?.months || []).map(m => Number(m.revenue || 0)))
const yearTotals = computed(() => {
  const m = data.value?.months || []
  return {
    revenue:   m.reduce((s, r) => s + Number(r.revenue || 0), 0),
    discounts: m.reduce((s, r) => s + Number(r.discounts || 0), 0),
    expenses:  m.reduce((s, r) => s + Number(r.expenses || 0), 0),
    count:     m.reduce((s, r) => s + Number(r.count || 0), 0),
    net:       m.reduce((s, r) => s + Number(r.net || 0), 0),
  }
})

function exportRows() {
  if (!data.value) return
  const rows = data.value.months.map(m => ({
    month: MONTHS[m.month - 1], payments: m.count,
    revenue: m.revenue, discounts: m.discounts, expenses: m.expenses, net: m.net,
  }))
  exportCsv(`monthly-sales-${data.value.year}`, rows, [
    { key: 'month', label: 'Month' }, { key: 'payments', label: 'Payments' },
    { key: 'revenue', label: 'Revenue' }, { key: 'discounts', label: 'Discounts' },
    { key: 'expenses', label: 'Expenses' }, { key: 'net', label: 'Net' },
  ])
}
</script>

<template>
  <div class="flex h-full flex-col gap-4 overflow-auto pb-8">
    <ReportHeader title="Monthly Sales Report"
                  description="12-month breakdown for the selected year."
                  mode="year" :loading="loading"
                  @change="reload" @export-csv="exportRows" @print="printReport" />

    <div v-if="error" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{{ error }}</div>

    <div class="print-area space-y-4">
      <div class="hidden print:block text-center">
        <h1 class="text-lg font-bold">{{ tenant.current?.name || 'Laboratory' }} — Monthly Sales {{ data?.year }}</h1>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">{{ data?.year }} Revenue by Month</div>
        </div>
        <div class="card-body">
          <div v-if="loading" class="h-56 animate-pulse rounded bg-slate-50 dark:bg-slate-800"></div>
          <div v-else class="h-56"><BarChart :labels="chartLabels" :data="chartRevenue" label="Revenue" /></div>
        </div>
      </div>

      <div class="card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="table w-full text-xs">
            <thead class="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th>Month</th>
                <th class="text-right">Payments</th>
                <th class="text-right">Revenue</th>
                <th class="text-right">Discounts</th>
                <th class="text-right">Expenses</th>
                <th class="text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in data?.months || []" :key="m.month" class="border-b border-slate-100 dark:border-slate-800">
                <td class="font-semibold">{{ MONTHS[m.month - 1] }}</td>
                <td class="text-right">{{ m.count }}</td>
                <td class="text-right font-semibold text-emerald-700">{{ money(m.revenue) }}</td>
                <td class="text-right text-amber-700">− {{ money(m.discounts) }}</td>
                <td class="text-right text-rose-700">− {{ money(m.expenses) }}</td>
                <td class="text-right font-bold" :class="m.net >= 0 ? 'text-brand-700' : 'text-rose-700'">
                  {{ money(m.net) }}
                </td>
              </tr>
            </tbody>
            <tfoot class="bg-slate-100 dark:bg-slate-800">
              <tr class="font-bold">
                <td>Total</td>
                <td class="text-right">{{ yearTotals.count }}</td>
                <td class="text-right text-emerald-700">{{ money(yearTotals.revenue) }}</td>
                <td class="text-right text-amber-700">− {{ money(yearTotals.discounts) }}</td>
                <td class="text-right text-rose-700">− {{ money(yearTotals.expenses) }}</td>
                <td class="text-right" :class="yearTotals.net >= 0 ? 'text-brand-700' : 'text-rose-700'">
                  {{ money(yearTotals.net) }}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
