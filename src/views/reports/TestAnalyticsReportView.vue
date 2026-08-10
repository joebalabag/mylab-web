<script setup>
import { ref, computed } from 'vue'
import { useTenantStore } from '../../stores/tenant'
import ReportHeader from '../../components/ReportHeader.vue'
import LineChart from '../../components/LineChart.vue'
import DoughnutChart from '../../components/DoughnutChart.vue'
import { getTestVolumeReport, getTestCategoriesReport, getTestTATReport } from '../../api/reports'
import { exportCsv, printReport } from '../../utils/csvExport'
import { money, formatDate } from '../../utils/format'

const tenant = useTenantStore()
const filters = ref({})
const volume     = ref({ daily: [], top: [] })
const categories = ref([])
const tat        = ref([])
const loading = ref(false)
const error = ref('')

async function reload(f) {
  filters.value = f; loading.value = true; error.value = ''
  try {
    const [v, c, t] = await Promise.all([
      getTestVolumeReport(f), getTestCategoriesReport(f), getTestTATReport(f),
    ])
    volume.value = v || { daily: [], top: [] }
    categories.value = c || []
    tat.value = t || []
  } catch (e) { error.value = e?.message || 'Failed to load' }
  finally { loading.value = false }
}

const trendLabels = computed(() => volume.value.daily.map(r => formatDate(r.date)))
const trendData   = computed(() => volume.value.daily.map(r => Number(r.qty || 0)))
const catLabels   = computed(() => categories.value.map(r => `${r.group_name} · ${r.category_name}`))
const catData     = computed(() => categories.value.map(r => Number(r.revenue || 0)))

function fmtHours(h) {
  if (h == null) return '—'
  if (h < 1) return `${Math.round(h * 60)} min`
  if (h < 48) return `${h.toFixed(1)} h`
  return `${(h / 24).toFixed(1)} d`
}

function exportRows() {
  // Export the "top tests" table since it's the most useful CSV.
  exportCsv(`test-analytics-top-${filters.value.date_from || 'all'}_${filters.value.date_to || 'now'}`,
    volume.value.top, [
      { key: 'code', label: 'Code' }, { key: 'name', label: 'Name' },
      { key: 'qty', label: 'Quantity' }, { key: 'orders', label: 'Orders' },
      { key: 'revenue', label: 'Revenue' },
    ])
}
</script>

<template>
  <div class="flex h-full flex-col gap-4 overflow-auto pb-8">
    <ReportHeader title="Test Analytics"
                  description="Volume trend, top tests, category / department mix, and turnaround time."
                  :loading="loading"
                  @change="reload" @export-csv="exportRows" @print="printReport" />

    <div v-if="error" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{{ error }}</div>

    <div class="print-area space-y-4">
      <div class="hidden print:block text-center">
        <h1 class="text-lg font-bold">{{ tenant.current?.name || 'Laboratory' }} — Test Analytics</h1>
      </div>

      <!-- Volume trend + Category mix.
           `print:grid-cols-3` / `print:col-span-2` keep the two charts
           side-by-side when printing. A4 portrait resolves below the lg
           breakpoint, so without the print variant the charts would
           stack and eat an extra ~230px of vertical space. -->
      <div class="grid grid-cols-1 gap-3 lg:grid-cols-3 print:grid-cols-3">
        <div class="card lg:col-span-2 print:col-span-2">
          <div class="card-header">
            <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">Test Volume Trend</div>
            <span class="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">Daily test quantity billed</span>
          </div>
          <div class="card-body">
            <div v-if="loading" class="h-56 animate-pulse rounded bg-slate-50 dark:bg-slate-800"></div>
            <div v-else-if="!volume.daily.length" class="flex h-56 items-center justify-center text-xs text-slate-400 dark:text-slate-500">
              No tests billed in this range.
            </div>
            <div v-else class="h-56"><LineChart :labels="trendLabels" :data="trendData" label="Tests" /></div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">Category Mix</div>
            <span class="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">By revenue</span>
          </div>
          <div class="card-body">
            <div v-if="loading" class="h-56 animate-pulse rounded bg-slate-50 dark:bg-slate-800"></div>
            <div v-else-if="!categories.length" class="flex h-56 items-center justify-center text-xs text-slate-400 dark:text-slate-500">
              No data.
            </div>
            <div v-else class="h-56"><DoughnutChart :labels="catLabels" :data="catData" /></div>
          </div>
        </div>
      </div>

      <!-- Top tests -->
      <div class="card overflow-hidden">
        <div class="card-header">
          <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">Top 20 Tests</div>
        </div>
        <div class="overflow-x-auto">
          <table class="table w-full text-xs">
            <thead class="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th class="w-10">#</th>
                <th>Code</th>
                <th>Name</th>
                <th class="text-right">Qty</th>
                <th class="text-right hidden sm:table-cell">Orders</th>
                <th class="text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!volume.top.length && !loading">
                <td colspan="6" class="py-4 text-center text-xs text-slate-400 dark:text-slate-500">No tests in this range.</td>
              </tr>
              <tr v-for="(r, i) in volume.top" :key="r.code" class="border-b border-slate-100 dark:border-slate-800">
                <td class="text-slate-400 dark:text-slate-500 font-bold">{{ i + 1 }}</td>
                <td class="font-mono">{{ r.code }}</td>
                <td>{{ r.name }}</td>
                <td class="text-right font-semibold">{{ r.qty }}</td>
                <td class="text-right hidden sm:table-cell">{{ r.orders }}</td>
                <td class="text-right text-emerald-700">{{ money(r.revenue) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- TAT -->
      <div class="card overflow-hidden">
        <div class="card-header">
          <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">Turnaround Time by Category</div>
          <span class="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">Requisition finalized → lab report released</span>
        </div>
        <div class="overflow-x-auto">
          <table class="table w-full text-xs">
            <thead class="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th>Category</th>
                <th class="text-right">Reports</th>
                <th class="text-right">Median</th>
                <th class="text-right hidden sm:table-cell">Avg</th>
                <th class="text-right hidden sm:table-cell">p95</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!tat.length && !loading">
                <td colspan="5" class="py-4 text-center text-xs text-slate-400 dark:text-slate-500">No finalized reports in this range.</td>
              </tr>
              <tr v-for="r in tat" :key="r.category_name" class="border-b border-slate-100 dark:border-slate-800">
                <td class="font-semibold">{{ r.category_name }}</td>
                <td class="text-right">{{ r.count }}</td>
                <td class="text-right font-semibold text-brand-700">{{ fmtHours(r.median_hours) }}</td>
                <td class="text-right hidden sm:table-cell">{{ fmtHours(r.avg_hours) }}</td>
                <td class="text-right hidden sm:table-cell text-rose-700">{{ fmtHours(r.p95_hours) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
