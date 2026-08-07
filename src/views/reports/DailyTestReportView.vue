<script setup>
import { ref, computed } from 'vue'
import { useTenantStore } from '../../stores/tenant'
import ReportHeader from '../../components/ReportHeader.vue'
import BarChart from '../../components/BarChart.vue'
import { getDailyTestsReport } from '../../api/reports'
import { exportCsv, printReport } from '../../utils/csvExport'
import { formatDate } from '../../utils/format'

const tenant = useTenantStore()
const filters = ref({})
const rows = ref([])
const loading = ref(false)
const error = ref('')

async function reload(f) {
  filters.value = f; loading.value = true; error.value = ''
  try { rows.value = await getDailyTestsReport(f) }
  catch (e) { error.value = e?.message || 'Failed to load' }
  finally { loading.value = false }
}

const chartLabels = computed(() => rows.value.map(r => formatDate(r.date)))
const chartData   = computed(() => rows.value.map(r => Number(r.created || 0)))

const totals = computed(() => {
  const created   = rows.value.reduce((s, r) => s + Number(r.created   || 0), 0)
  const finalized = rows.value.reduce((s, r) => s + Number(r.finalized || 0), 0)
  const voided    = rows.value.reduce((s, r) => s + Number(r.voided    || 0), 0)
  const draft     = rows.value.reduce((s, r) => s + Number(r.draft     || 0), 0)
  return {
    created, finalized, voided, draft,
    finalized_pct: created > 0 ? Math.round((finalized / created) * 1000) / 10 : 0,
    voided_pct:    created > 0 ? Math.round((voided    / created) * 1000) / 10 : 0,
  }
})

function pct(n) { return (Number(n) || 0).toFixed(1) + '%' }

function exportRows() {
  exportCsv(`daily-tests-${filters.value.date_from || 'all'}_${filters.value.date_to || 'now'}`,
    rows.value, [
      { key: 'date',         label: 'Date' },
      { key: 'created',      label: 'Created' },
      { key: 'finalized',    label: 'Finalized' },
      { key: 'finalized_pct',label: 'Finalized %' },
      { key: 'voided',       label: 'Voided' },
      { key: 'voided_pct',   label: 'Voided %' },
      { key: 'draft',        label: 'Draft' },
    ])
}
</script>

<template>
  <div class="flex h-full flex-col gap-4 overflow-auto pb-8">
    <ReportHeader title="Daily Test Report"
                  description="Lab reports created per day, and how many of that same-day cohort are finalized vs voided."
                  :loading="loading"
                  @change="reload" @export-csv="exportRows" @print="printReport" />

    <div v-if="error" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{{ error }}</div>

    <div class="print-area space-y-4">
      <div class="hidden print:block text-center">
        <h1 class="text-lg font-bold">{{ tenant.current?.name || 'Laboratory' }} — Daily Tests</h1>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="text-sm font-semibold text-slate-800">Lab Reports Created (per day)</div>
        </div>
        <div class="card-body">
          <div v-if="loading" class="h-56 animate-pulse rounded bg-slate-50"></div>
          <div v-else-if="!rows.length" class="flex h-56 items-center justify-center text-xs text-slate-400">
            No lab reports in this range.
          </div>
          <div v-else class="h-56"><BarChart :labels="chartLabels" :data="chartData" label="Created" /></div>
        </div>
      </div>

      <div class="card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="table w-full text-xs">
            <thead class="bg-slate-50">
              <tr>
                <th>Date</th>
                <th class="text-right">Created</th>
                <th class="text-right">Finalized</th>
                <th class="text-right hidden sm:table-cell">Finalized %</th>
                <th class="text-right">Voided</th>
                <th class="text-right hidden sm:table-cell">Voided %</th>
                <th class="text-right hidden md:table-cell">Draft</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!rows.length && !loading">
                <td colspan="7" class="py-4 text-center text-xs text-slate-400">No lab reports in this range.</td>
              </tr>
              <tr v-for="r in rows" :key="r.date" class="border-b border-slate-100">
                <td>{{ formatDate(r.date) }}</td>
                <td class="text-right font-semibold">{{ r.created }}</td>
                <td class="text-right text-emerald-700 font-semibold">{{ r.finalized }}</td>
                <td class="text-right text-emerald-700 hidden sm:table-cell">{{ pct(r.finalized_pct) }}</td>
                <td class="text-right text-rose-700 font-semibold">{{ r.voided }}</td>
                <td class="text-right text-rose-700 hidden sm:table-cell">{{ pct(r.voided_pct) }}</td>
                <td class="text-right text-slate-500 hidden md:table-cell">{{ r.draft }}</td>
              </tr>
            </tbody>
            <tfoot v-if="rows.length" class="bg-slate-100">
              <tr class="font-bold">
                <td>Total</td>
                <td class="text-right">{{ totals.created }}</td>
                <td class="text-right text-emerald-700">{{ totals.finalized }}</td>
                <td class="text-right text-emerald-700 hidden sm:table-cell">{{ pct(totals.finalized_pct) }}</td>
                <td class="text-right text-rose-700">{{ totals.voided }}</td>
                <td class="text-right text-rose-700 hidden sm:table-cell">{{ pct(totals.voided_pct) }}</td>
                <td class="text-right text-slate-500 hidden md:table-cell">{{ totals.draft }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
