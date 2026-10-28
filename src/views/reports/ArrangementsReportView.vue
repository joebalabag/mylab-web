<script setup>
import { ref, computed, watch } from 'vue'
import { useTenantStore } from '../../stores/tenant'
import ReportHeader from '../../components/ReportHeader.vue'
import { getArrangementsReport } from '../../api/reports'
import { exportCsv, printReport } from '../../utils/csvExport'
import { money } from '../../utils/format'
import { PAYMENT_METHOD_LABELS, NON_CASH_ARRANGEMENT_METHODS } from '../../api/payments'

const tenant = useTenantStore()

// `baseFilters` holds whatever ReportHeader last emitted (date range + cashier).
// Method / settlement are controlled locally — changing them triggers a reload.
const baseFilters   = ref({})
const method        = ref('')   // '' = all arrangement methods
const settlement    = ref('')   // '' | 'settled' | 'outstanding'

const data   = ref({ rows: [], by_method: [], by_billed_to: [], aging: {}, totals: { billed: 0, settled: 0, outstanding: 0, count: 0 }, count: 0 })
const loading = ref(false)
const error   = ref('')

async function reload(f) {
  if (f) baseFilters.value = f
  loading.value = true; error.value = ''
  try {
    data.value = await getArrangementsReport({
      ...baseFilters.value,
      payment_method: method.value || undefined,
      settlement:     settlement.value || undefined,
    })
  } catch (e) { error.value = e?.message || 'Failed to load' }
  finally { loading.value = false }
}
watch([method, settlement], () => reload())

const METHOD_OPTIONS = [
  { value: '',                     label: 'All arrangements' },
  ...NON_CASH_ARRANGEMENT_METHODS.map(m => ({ value: m, label: PAYMENT_METHOD_LABELS[m] || m })),
]

const AGING_BUCKETS = ['0-30', '31-60', '61-90', '90+']
const agingTotal = computed(() =>
  AGING_BUCKETS.reduce((s, k) => s + Number(data.value.aging?.[k]?.total || 0), 0),
)

const patientName = (r) =>
  [r.patient_last_name, r.patient_first_name].filter(Boolean).join(', ') +
  (r.patient_middle_name ? ` ${r.patient_middle_name}` : '')

function exportRows() {
  const scope = method.value || 'all'
  exportCsv(`arrangements-${scope}-${baseFilters.value.date_from || 'all'}_${baseFilters.value.date_to || 'now'}`,
    data.value.rows.map(r => ({
      date:              r.payment_date,
      payment_number:    r.payment_number,
      patient:           patientName(r).trim() || '—',
      case_number:       r.patient_case_number || '',
      method:            PAYMENT_METHOD_LABELS[r.payment_method] || r.payment_method,
      billed_to:         r.billed_to || '',
      reference:         r.reference || '',
      total:             r.total,
      settled:           r.is_settled ? 'Yes' : 'No',
      settled_on:        r.arrangement_resolved_at || '',
      settled_method:    r.resolved_method || '',
      settled_reference: r.resolved_reference || '',
      days_outstanding:  r.days_outstanding ?? '',
    }))
  )
}
</script>

<template>
  <div class="flex h-full flex-col gap-4 overflow-auto pb-8">
    <ReportHeader title="Arrangements Report"
                  description="A/R, Insurance, Paid Outside and Charity payments — with settlement status and aging."
                  :loading="loading"
                  @change="reload" @export-csv="exportRows" @print="printReport" />

    <!-- Local filters: method + settlement. Live outside ReportHeader
         because they're specific to this report. -->
    <div class="card no-print-hide">
      <div class="card-body flex flex-wrap items-center gap-3 text-xs">
        <label class="font-bold uppercase tracking-widest text-[10px] text-slate-500 dark:text-slate-400">Method</label>
        <select v-model="method" class="input !py-1 !text-xs w-48">
          <option v-for="o in METHOD_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>

        <label class="ml-2 font-bold uppercase tracking-widest text-[10px] text-slate-500 dark:text-slate-400">Status</label>
        <div class="inline-flex rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-0.5">
          <button v-for="opt in [{v:'',l:'All'},{v:'settled',l:'Settled'},{v:'outstanding',l:'Outstanding'}]"
                  :key="opt.v" @click="settlement = opt.v"
                  class="rounded px-2.5 py-1 font-semibold transition-colors"
                  :class="settlement === opt.v
                          ? 'bg-white dark:bg-slate-900 text-brand-700 shadow-sm'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100'">
            {{ opt.l }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="error" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{{ error }}</div>

    <div class="print-area space-y-3">
      <div class="hidden print:block text-center">
        <h1 class="text-lg font-bold">{{ tenant.current?.name || 'Laboratory' }} — Arrangements Report</h1>
      </div>

      <!-- Totals strip -->
      <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div class="card"><div class="card-body">
          <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Billed</div>
          <div class="mt-1 text-lg font-bold">{{ money(data.totals.billed) }}</div>
          <div class="text-[11px] text-slate-500 dark:text-slate-400">{{ data.totals.count }} payments</div>
        </div></div>
        <div class="card"><div class="card-body">
          <div class="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Settled</div>
          <div class="mt-1 text-lg font-bold text-emerald-700">{{ money(data.totals.settled) }}</div>
        </div></div>
        <div class="card"><div class="card-body">
          <div class="text-[10px] font-bold uppercase tracking-widest text-amber-700">Outstanding</div>
          <div class="mt-1 text-lg font-bold text-amber-700">{{ money(data.totals.outstanding) }}</div>
        </div></div>
        <div class="card"><div class="card-body">
          <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Aging total</div>
          <div class="mt-1 text-lg font-bold">{{ money(agingTotal) }}</div>
          <div class="text-[11px] text-slate-500 dark:text-slate-400">unresolved only</div>
        </div></div>
      </div>

      <!-- Aging buckets (outstanding only) -->
      <div class="card overflow-hidden">
        <div class="card-header">
          <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">Aging (outstanding only)</div>
        </div>
        <div class="overflow-x-auto">
          <table class="table w-full text-xs">
            <thead class="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th>Bucket</th>
                <th class="text-right">Count</th>
                <th class="text-right">Amount</th>
                <th class="text-right">% of outstanding</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="b in AGING_BUCKETS" :key="b" class="border-b border-slate-100 dark:border-slate-800">
                <td class="font-semibold">{{ b }} days</td>
                <td class="text-right">{{ data.aging?.[b]?.count ?? 0 }}</td>
                <td class="text-right tabular-nums">{{ money(data.aging?.[b]?.total || 0) }}</td>
                <td class="text-right">
                  {{ agingTotal > 0 ? ((Number(data.aging?.[b]?.total || 0) / agingTotal) * 100).toFixed(1) : '0.0' }}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Per-method breakdown -->
      <div class="card overflow-hidden">
        <div class="card-header">
          <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">Breakdown by Method</div>
        </div>
        <div class="overflow-x-auto">
          <table class="table w-full text-xs">
            <thead class="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th>Method</th>
                <th class="text-right">Billed</th>
                <th class="text-right">Settled</th>
                <th class="text-right">Outstanding</th>
                <th class="text-right">Count</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!data.by_method.length && !loading">
                <td colspan="5" class="py-4 text-center text-xs text-slate-400 dark:text-slate-500">No arrangements in this range.</td>
              </tr>
              <tr v-for="r in data.by_method" :key="r.payment_method" class="border-b border-slate-100 dark:border-slate-800">
                <td class="font-semibold">{{ PAYMENT_METHOD_LABELS[r.payment_method] || r.payment_method }}</td>
                <td class="text-right tabular-nums">{{ money(r.billed) }}</td>
                <td class="text-right tabular-nums text-emerald-700">
                  {{ money(r.settled) }} <span class="text-[10px] text-slate-400">({{ r.count_settled }})</span>
                </td>
                <td class="text-right tabular-nums text-amber-700">
                  {{ money(r.outstanding) }} <span class="text-[10px] text-slate-400">({{ r.count_outstanding }})</span>
                </td>
                <td class="text-right">{{ r.count_total }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Per-payer (billed_to) breakdown -->
      <div class="card overflow-hidden">
        <div class="card-header">
          <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">Breakdown by Billed To</div>
          <div class="text-[11px] text-slate-500 dark:text-slate-400">Who the arrangement is addressed to — insurance provider, employer, patient contact, etc.</div>
        </div>
        <div class="overflow-x-auto">
          <table class="table w-full text-xs">
            <thead class="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th>Billed To</th>
                <th class="text-right">Billed</th>
                <th class="text-right">Settled</th>
                <th class="text-right">Outstanding</th>
                <th class="text-right">Count</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!data.by_billed_to.length && !loading">
                <td colspan="5" class="py-4 text-center text-xs text-slate-400 dark:text-slate-500">No arrangements in this range.</td>
              </tr>
              <tr v-for="r in data.by_billed_to" :key="r.billed_to" class="border-b border-slate-100 dark:border-slate-800">
                <td class="font-semibold">{{ r.billed_to }}</td>
                <td class="text-right tabular-nums">{{ money(r.billed) }}</td>
                <td class="text-right tabular-nums text-emerald-700">
                  {{ money(r.settled) }} <span class="text-[10px] text-slate-400">({{ r.count_settled }})</span>
                </td>
                <td class="text-right tabular-nums text-amber-700">
                  {{ money(r.outstanding) }} <span class="text-[10px] text-slate-400">({{ r.count_outstanding }})</span>
                </td>
                <td class="text-right">{{ r.count_total }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Detail rows -->
      <div class="card overflow-hidden">
        <div class="card-header">
          <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">Detail</div>
        </div>
        <div class="overflow-x-auto">
          <table class="table w-full text-xs">
            <thead class="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th>Date</th>
                <th>Payment #</th>
                <th>Patient / Case</th>
                <th>Method</th>
                <th>Billed to</th>
                <th>Reference</th>
                <th class="text-right">Total</th>
                <th>Status</th>
                <th>Settled on</th>
                <th class="text-right">Days out</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!data.rows.length && !loading">
                <td colspan="10" class="py-4 text-center text-xs text-slate-400 dark:text-slate-500">No matching arrangements.</td>
              </tr>
              <tr v-for="r in data.rows" :key="r.uuid" class="border-b border-slate-100 dark:border-slate-800">
                <td class="whitespace-nowrap">{{ new Date(r.payment_date).toLocaleDateString() }}</td>
                <td class="font-mono">{{ r.payment_number }}</td>
                <td>
                  <div class="font-semibold">{{ patientName(r).trim() || '—' }}</div>
                  <div class="text-[10px] text-slate-500 dark:text-slate-400">{{ r.patient_case_number || '—' }}</div>
                </td>
                <td class="text-[10px] uppercase font-semibold text-slate-600 dark:text-slate-300">
                  {{ PAYMENT_METHOD_LABELS[r.payment_method] || r.payment_method }}
                </td>
                <td>{{ r.billed_to || '—' }}</td>
                <td class="font-mono text-[11px]">{{ r.reference || '—' }}</td>
                <td class="text-right tabular-nums font-semibold">{{ money(r.total) }}</td>
                <td>
                  <span class="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
                        :class="r.is_settled
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-amber-100 text-amber-700'">
                    {{ r.is_settled ? 'Settled' : 'Outstanding' }}
                  </span>
                </td>
                <td class="whitespace-nowrap text-[11px] text-slate-500 dark:text-slate-400">
                  <template v-if="r.arrangement_resolved_at">
                    {{ new Date(r.arrangement_resolved_at).toLocaleDateString() }}
                    <div v-if="r.resolved_method" class="text-[10px] uppercase">via {{ r.resolved_method }}</div>
                  </template>
                  <template v-else-if="r.is_settled">—</template>
                  <template v-else>—</template>
                </td>
                <td class="text-right tabular-nums"
                    :class="(r.days_outstanding ?? 0) > 60 ? 'text-rose-700 font-bold' : ''">
                  {{ r.days_outstanding ?? '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="data.count >= 1000" class="border-t border-slate-100 dark:border-slate-800 px-3 py-2 text-[11px] text-amber-700">
          Showing the most recent 1,000 rows. Narrow the date range or method to see more.
        </div>
      </div>
    </div>
  </div>
</template>
