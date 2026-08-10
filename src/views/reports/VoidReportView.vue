<script setup>
import { ref } from 'vue'
import { useTenantStore } from '../../stores/tenant'
import ReportHeader from '../../components/ReportHeader.vue'
import { getVoidReport } from '../../api/reports'
import { exportCsv, printReport } from '../../utils/csvExport'
import { money, formatDate, formatDateTime } from '../../utils/format'
import { PAYMENT_METHOD_LABELS } from '../../api/payments'

const tenant = useTenantStore()
const filters = ref({})
const data = ref({ rows: [], total_voided: 0, count: 0 })
const loading = ref(false)
const error = ref('')

async function reload(f) {
  filters.value = f; loading.value = true; error.value = ''
  try { data.value = await getVoidReport(f) }
  catch (e) { error.value = e?.message || 'Failed to load' }
  finally { loading.value = false }
}

function patientName(r) {
  return [r.patient_first_name, r.patient_last_name].filter(Boolean).join(' ') || '—'
}

function exportRows() {
  exportCsv(`voids-${filters.value.date_from || 'all'}_${filters.value.date_to || 'now'}`,
    data.value.rows.map(r => ({
      payment_number: r.payment_number,
      payment_date: r.payment_date,
      method: PAYMENT_METHOD_LABELS[r.payment_method] || r.payment_method,
      case_number: r.patient_case_number || '',
      patient: patientName(r),
      total: r.total,
      created_by: r.created_by || '',
      voided_by: r.voided_by || '',
      voided_at: r.voided_at || '',
      notes: r.notes || '',
    })))
}
</script>

<template>
  <div class="flex h-full flex-col gap-4 overflow-auto pb-8">
    <ReportHeader title="Void Report"
                  description="Every voided payment in the range, with who created and who voided."
                  show-cashier :loading="loading"
                  @change="reload" @export-csv="exportRows" @print="printReport" />

    <div v-if="error" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{{ error }}</div>

    <div class="print-area space-y-3">
      <div class="hidden print:block text-center">
        <h1 class="text-lg font-bold">{{ tenant.current?.name || 'Laboratory' }} — Void Report</h1>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="card"><div class="card-body">
          <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500">Voided Count</div>
          <div class="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-100">{{ data.count }}</div>
        </div></div>
        <div class="card"><div class="card-body">
          <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500">Voided Amount</div>
          <div class="mt-1 text-2xl font-bold text-rose-600 tabular-nums">{{ money(data.total_voided) }}</div>
        </div></div>
      </div>

      <div class="card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="table w-full text-xs">
            <thead class="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th>PAY #</th>
                <th class="hidden md:table-cell">Case / Patient</th>
                <th>Method</th>
                <th class="text-right">Amount</th>
                <th class="hidden sm:table-cell">Created By</th>
                <th class="hidden sm:table-cell">Voided By</th>
                <th class="hidden lg:table-cell">Voided At</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!data.rows.length && !loading">
                <td colspan="7" class="py-4 text-center text-xs text-slate-400 dark:text-slate-500">No voided payments in this range.</td>
              </tr>
              <tr v-for="r in data.rows" :key="r.uuid" class="border-b border-slate-100 dark:border-slate-800">
                <td class="font-mono font-semibold">{{ r.payment_number }}</td>
                <td class="hidden md:table-cell">
                  <div class="font-medium">{{ patientName(r) }}</div>
                  <div class="text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-500 font-mono">{{ r.patient_case_number || '—' }}</div>
                </td>
                <td class="text-[10px] uppercase">{{ PAYMENT_METHOD_LABELS[r.payment_method] || r.payment_method }}</td>
                <td class="text-right font-semibold line-through text-slate-500 dark:text-slate-400 dark:text-slate-500">{{ money(r.total) }}</td>
                <td class="hidden sm:table-cell text-slate-600 dark:text-slate-300">{{ r.created_by || '—' }}</td>
                <td class="hidden sm:table-cell text-rose-600">{{ r.voided_by || '—' }}</td>
                <td class="hidden lg:table-cell text-slate-500 dark:text-slate-400 dark:text-slate-500">{{ formatDateTime(r.voided_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
