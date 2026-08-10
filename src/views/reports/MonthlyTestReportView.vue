<script setup>
import { ref, computed } from 'vue'
import { useTenantStore } from '../../stores/tenant'
import ReportHeader from '../../components/ReportHeader.vue'
import BarChart from '../../components/BarChart.vue'
import { getMonthlyTestsReport } from '../../api/reports'
import { exportCsv, printReport } from '../../utils/csvExport'

const tenant = useTenantStore()
const filters = ref({})
const data = ref(null)
const loading = ref(false)
const error = ref('')

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

async function reload(f) {
  filters.value = f; loading.value = true; error.value = ''
  try { data.value = await getMonthlyTestsReport(f) }
  catch (e) { error.value = e?.message || 'Failed to load' }
  finally { loading.value = false }
}

const chartLabels = computed(() => (data.value?.months || []).map(m => MONTHS[m.month - 1]))
const chartData   = computed(() => (data.value?.months || []).map(m => Number(m.created || 0)))

const yearTotals = computed(() => {
  const m = data.value?.months || []
  const created   = m.reduce((s, r) => s + Number(r.created   || 0), 0)
  const finalized = m.reduce((s, r) => s + Number(r.finalized || 0), 0)
  const voided    = m.reduce((s, r) => s + Number(r.voided    || 0), 0)
  const draft     = m.reduce((s, r) => s + Number(r.draft     || 0), 0)
  return {
    created, finalized, voided, draft,
    finalized_pct: created > 0 ? Math.round((finalized / created) * 1000) / 10 : 0,
    voided_pct:    created > 0 ? Math.round((voided    / created) * 1000) / 10 : 0,
  }
})

function pct(n) { return (Number(n) || 0).toFixed(1) + '%' }

function exportRows() {
  if (!data.value) return
  const rows = data.value.months.map(m => ({
    month: MONTHS[m.month - 1],
    created: m.created,
    finalized: m.finalized,
    finalized_pct: m.finalized_pct,
    voided: m.voided,
    voided_pct: m.voided_pct,
    draft: m.draft,
  }))
  exportCsv(`monthly-tests-${data.value.year}`, rows, [
    { key: 'month',         label: 'Month' },
    { key: 'created',       label: 'Created' },
    { key: 'finalized',     label: 'Finalized' },
    { key: 'finalized_pct', label: 'Finalized %' },
    { key: 'voided',        label: 'Voided' },
    { key: 'voided_pct',    label: 'Voided %' },
    { key: 'draft',         label: 'Draft' },
  ])
}
</script>

<template>
  <div class="flex h-full flex-col gap-4 overflow-auto pb-8">
    <ReportHeader title="Monthly Test Report"
                  description="Lab reports created per month, and how many of that cohort are finalized vs voided."
                  mode="year" :loading="loading"
                  @change="reload" @export-csv="exportRows" @print="printReport" />

    <div v-if="error" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{{ error }}</div>

    <div class="print-area space-y-4">
      <div class="hidden print:block text-center">
        <h1 class="text-lg font-bold">{{ tenant.current?.name || 'Laboratory' }} — Monthly Tests {{ data?.year }}</h1>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">{{ data?.year }} Lab Reports Created (per month)</div>
        </div>
        <div class="card-body">
          <div v-if="loading" class="h-56 animate-pulse rounded bg-slate-50 dark:bg-slate-800"></div>
          <div v-else class="h-56"><BarChart :labels="chartLabels" :data="chartData" label="Created" /></div>
        </div>
      </div>

      <div class="card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="table w-full text-xs">
            <thead class="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th>Month</th>
                <th class="text-right">Created</th>
                <th class="text-right">Finalized</th>
                <th class="text-right hidden sm:table-cell">Finalized %</th>
                <th class="text-right">Voided</th>
                <th class="text-right hidden sm:table-cell">Voided %</th>
                <th class="text-right hidden md:table-cell">Draft</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in data?.months || []" :key="m.month" class="border-b border-slate-100 dark:border-slate-800">
                <td class="font-semibold">{{ MONTHS[m.month - 1] }}</td>
                <td class="text-right">{{ m.created }}</td>
                <td class="text-right text-emerald-700 font-semibold">{{ m.finalized }}</td>
                <td class="text-right text-emerald-700 hidden sm:table-cell">{{ pct(m.finalized_pct) }}</td>
                <td class="text-right text-rose-700 font-semibold">{{ m.voided }}</td>
                <td class="text-right text-rose-700 hidden sm:table-cell">{{ pct(m.voided_pct) }}</td>
                <td class="text-right text-slate-500 dark:text-slate-400 dark:text-slate-500 hidden md:table-cell">{{ m.draft }}</td>
              </tr>
            </tbody>
            <tfoot class="bg-slate-100 dark:bg-slate-800">
              <tr class="font-bold">
                <td>Total</td>
                <td class="text-right">{{ yearTotals.created }}</td>
                <td class="text-right text-emerald-700">{{ yearTotals.finalized }}</td>
                <td class="text-right text-emerald-700 hidden sm:table-cell">{{ pct(yearTotals.finalized_pct) }}</td>
                <td class="text-right text-rose-700">{{ yearTotals.voided }}</td>
                <td class="text-right text-rose-700 hidden sm:table-cell">{{ pct(yearTotals.voided_pct) }}</td>
                <td class="text-right text-slate-500 dark:text-slate-400 dark:text-slate-500 hidden md:table-cell">{{ yearTotals.draft }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
