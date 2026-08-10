<script setup>
import { ref, computed } from 'vue'
import { useTenantStore } from '../../stores/tenant'
import ReportHeader from '../../components/ReportHeader.vue'
import LineChart from '../../components/LineChart.vue'
import { getDailySalesReport } from '../../api/reports'
import { exportCsv, printReport } from '../../utils/csvExport'
import { money, formatDate } from '../../utils/format'

const tenant = useTenantStore()
const filters = ref({})
const rows = ref([])
const loading = ref(false)
const error = ref('')

async function reload(f) {
  filters.value = f; loading.value = true; error.value = ''
  try { rows.value = await getDailySalesReport(f) }
  catch (e) { error.value = e?.message || 'Failed to load' }
  finally { loading.value = false }
}

const chartLabels = computed(() => rows.value.map(r => formatDate(r.date)))
const chartData   = computed(() => rows.value.map(r => Number(r.revenue || 0)))
const totals = computed(() => ({
  revenue:   rows.value.reduce((s, r) => s + Number(r.revenue || 0), 0),
  cash:      rows.value.reduce((s, r) => s + Number(r.cash || 0), 0),
  discounts: rows.value.reduce((s, r) => s + Number(r.discounts || 0), 0),
  count:     rows.value.reduce((s, r) => s + Number(r.count || 0), 0),
}))

function exportRows() {
  exportCsv(`daily-sales-${filters.value.date_from || 'all'}_${filters.value.date_to || 'now'}`,
    rows.value, [
      { key: 'date', label: 'Date' }, { key: 'count', label: 'Payments' },
      { key: 'revenue', label: 'Revenue' }, { key: 'cash', label: 'Cash' },
      { key: 'discounts', label: 'Discounts' },
    ])
}
</script>

<template>
  <div class="flex h-full flex-col gap-4 overflow-auto pb-8">
    <ReportHeader title="Daily Sales Report"
                  description="Day-by-day sales tape. Cash column is your physical cashbox reconciliation."
                  :loading="loading"
                  @change="reload" @export-csv="exportRows" @print="printReport" />

    <div v-if="error" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{{ error }}</div>

    <div class="print-area space-y-4">
      <div class="hidden print:block text-center">
        <h1 class="text-lg font-bold">{{ tenant.current?.name || 'Laboratory' }} — Daily Sales</h1>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">Revenue Trend</div>
        </div>
        <div class="card-body">
          <div v-if="loading" class="h-56 animate-pulse rounded bg-slate-50 dark:bg-slate-800"></div>
          <div v-else-if="!rows.length" class="flex h-56 items-center justify-center text-xs text-slate-400 dark:text-slate-500">
            No sales in this range.
          </div>
          <div v-else class="h-56"><LineChart :labels="chartLabels" :data="chartData" label="Revenue" /></div>
        </div>
      </div>

      <div class="card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="table w-full text-xs">
            <thead class="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th>Date</th>
                <th class="text-right">Payments</th>
                <th class="text-right">Revenue</th>
                <th class="text-right hidden sm:table-cell">Cash</th>
                <th class="text-right hidden sm:table-cell">Discounts</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!rows.length && !loading">
                <td colspan="5" class="py-4 text-center text-xs text-slate-400 dark:text-slate-500">No sales in this range.</td>
              </tr>
              <tr v-for="r in rows" :key="r.date" class="border-b border-slate-100 dark:border-slate-800">
                <td>{{ formatDate(r.date) }}</td>
                <td class="text-right">{{ r.count }}</td>
                <td class="text-right font-semibold text-emerald-700">{{ money(r.revenue) }}</td>
                <td class="text-right hidden sm:table-cell">{{ money(r.cash) }}</td>
                <td class="text-right text-amber-700 hidden sm:table-cell">− {{ money(r.discounts) }}</td>
              </tr>
            </tbody>
            <tfoot v-if="rows.length" class="bg-slate-100 dark:bg-slate-800">
              <tr class="font-bold">
                <td>Total</td>
                <td class="text-right">{{ totals.count }}</td>
                <td class="text-right text-emerald-700">{{ money(totals.revenue) }}</td>
                <td class="text-right hidden sm:table-cell">{{ money(totals.cash) }}</td>
                <td class="text-right text-amber-700 hidden sm:table-cell">− {{ money(totals.discounts) }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
