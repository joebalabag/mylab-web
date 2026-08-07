<script setup>
import { ref, computed } from 'vue'
import { useTenantStore } from '../../stores/tenant'
import ReportHeader from '../../components/ReportHeader.vue'
import DoughnutChart from '../../components/DoughnutChart.vue'
import { getPaymentSummaryReport } from '../../api/reports'
import { exportCsv, printReport } from '../../utils/csvExport'
import { money } from '../../utils/format'
import { PAYMENT_METHOD_LABELS } from '../../api/payments'

const tenant = useTenantStore()
const filters = ref({})
const rows = ref([])
const loading = ref(false)
const error = ref('')

async function reload(f) {
  filters.value = f; loading.value = true; error.value = ''
  try { rows.value = await getPaymentSummaryReport(f) }
  catch (e) { error.value = e?.message || 'Failed to load' }
  finally { loading.value = false }
}

// Completed-only slice for the doughnut (voided rows would skew the pie).
const completedRows = computed(() => rows.value.filter(r => r.status === 'completed'))
const chartLabels = computed(() => completedRows.value.map(r => PAYMENT_METHOD_LABELS[r.payment_method] || r.payment_method))
const chartData   = computed(() => completedRows.value.map(r => Number(r.total || 0)))

const totals = computed(() => ({
  completed:      completedRows.value.reduce((s, r) => s + Number(r.total || 0), 0),
  completed_count:completedRows.value.reduce((s, r) => s + Number(r.count || 0), 0),
  voided:         rows.value.filter(r => r.status === 'voided').reduce((s, r) => s + Number(r.total || 0), 0),
}))

function exportRows() {
  exportCsv(`payment-summary-${filters.value.date_from || 'all'}_${filters.value.date_to || 'now'}`,
    rows.value.map(r => ({
      method: PAYMENT_METHOD_LABELS[r.payment_method] || r.payment_method,
      status: r.status, count: r.count, total: r.total,
    })))
}
</script>

<template>
  <div class="flex h-full flex-col gap-4 overflow-auto pb-8">
    <ReportHeader title="Payment Summary"
                  description="Payment method × status breakdown."
                  :loading="loading"
                  @change="reload" @export-csv="exportRows" @print="printReport" />

    <div v-if="error" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{{ error }}</div>

    <div class="print-area space-y-4">
      <div class="hidden print:block text-center">
        <h1 class="text-lg font-bold">{{ tenant.current?.name || 'Laboratory' }} — Payment Summary</h1>
      </div>

      <div class="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div class="card lg:col-span-1">
          <div class="card-header">
            <div class="text-sm font-semibold text-slate-800">Method Share</div>
          </div>
          <div class="card-body">
            <div v-if="loading" class="h-56 animate-pulse rounded bg-slate-50"></div>
            <div v-else-if="!completedRows.length" class="flex h-56 items-center justify-center text-xs text-slate-400">
              No completed payments.
            </div>
            <div v-else class="h-56"><DoughnutChart :labels="chartLabels" :data="chartData" /></div>
          </div>
        </div>

        <div class="card lg:col-span-2 overflow-hidden">
          <div class="overflow-x-auto">
            <table class="table w-full text-sm">
              <thead class="bg-slate-50">
                <tr>
                  <th>Method</th>
                  <th>Status</th>
                  <th class="text-right">Count</th>
                  <th class="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!rows.length && !loading">
                  <td colspan="4" class="py-4 text-center text-xs text-slate-400">No payments in this range.</td>
                </tr>
                <tr v-for="r in rows" :key="r.payment_method + r.status" class="border-b border-slate-100">
                  <td class="font-semibold">{{ PAYMENT_METHOD_LABELS[r.payment_method] || r.payment_method }}</td>
                  <td>
                    <span class="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
                          :class="r.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'">
                      {{ r.status }}
                    </span>
                  </td>
                  <td class="text-right">{{ r.count }}</td>
                  <td class="text-right font-semibold tabular-nums"
                      :class="r.status === 'voided' ? 'text-slate-400 line-through' : 'text-emerald-700'">
                    {{ money(r.total) }}
                  </td>
                </tr>
              </tbody>
              <tfoot v-if="rows.length" class="bg-slate-100">
                <tr class="font-bold">
                  <td colspan="2">Completed</td>
                  <td class="text-right">{{ totals.completed_count }}</td>
                  <td class="text-right text-emerald-700">{{ money(totals.completed) }}</td>
                </tr>
                <tr v-if="totals.voided > 0" class="text-slate-500">
                  <td colspan="3">Voided (excluded from revenue)</td>
                  <td class="text-right line-through">{{ money(totals.voided) }}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
