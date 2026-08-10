<script setup>
import { ref, computed } from 'vue'
import { useTenantStore } from '../../stores/tenant'
import ReportHeader from '../../components/ReportHeader.vue'
import { getDailyDetailedSales } from '../../api/reports'
import { exportCsv, printReport } from '../../utils/csvExport'
import { money, formatDate, formatDateTime } from '../../utils/format'
import { PAYMENT_METHOD_LABELS } from '../../api/payments'

const tenant = useTenantStore()
const filters = ref({})
const rows = ref([])
const loading = ref(false)
const error = ref('')

async function reload(f) {
  filters.value = f; loading.value = true; error.value = ''
  try { rows.value = await getDailyDetailedSales(f) }
  catch (e) { error.value = e?.message || 'Failed to load' }
  finally { loading.value = false }
}

function patientName(r) {
  return [r.patient_first_name, r.patient_middle_name, r.patient_last_name].filter(Boolean).join(' ') || '—'
}

// Group by YYYY-MM-DD, most recent day first. Each group carries its own
// subtotal so the day-level header row can show the running total.
const groupedByDay = computed(() => {
  const map = new Map()
  for (const r of rows.value) {
    const day = String(r.payment_date).slice(0, 10)
    if (!map.has(day)) map.set(day, { date: day, payments: [], subtotal: 0, count: 0, items_count: 0 })
    const g = map.get(day)
    g.payments.push(r)
    g.subtotal += Number(r.total || 0)
    g.count += 1
    g.items_count += (r.items || []).length
  }
  return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date))
})

const grandTotal = computed(() => rows.value.reduce((s, r) => s + Number(r.total || 0), 0))
const grandCount = computed(() => rows.value.length)

// CSV: one row per line item so tests are itemized in the export too.
function exportRows() {
  const flat = []
  for (const p of rows.value) {
    if (!p.items?.length) {
      flat.push({
        date: p.payment_date, payment_number: p.payment_number, patient: patientName(p),
        case_number: p.patient_case_number || '', method: PAYMENT_METHOD_LABELS[p.payment_method] || p.payment_method,
        channel: p.channel || '', reference: p.reference || '',
        test_code: '', test_name: '(no items)', qty: '', unit_price: '', line_total: '',
        subtotal: p.subtotal, discount: p.discount_amount, total: p.total, cashier: p.created_by || '',
      })
    } else {
      for (const it of p.items) {
        flat.push({
          date: p.payment_date, payment_number: p.payment_number, patient: patientName(p),
          case_number: p.patient_case_number || '', method: PAYMENT_METHOD_LABELS[p.payment_method] || p.payment_method,
          channel: p.channel || '', reference: p.reference || '',
          test_code: it.code, test_name: it.name, qty: it.quantity,
          unit_price: it.unit_price, line_total: it.line_selling_price,
          subtotal: p.subtotal, discount: p.discount_amount, total: p.total, cashier: p.created_by || '',
        })
      }
    }
  }
  exportCsv(`daily-detailed-sales-${filters.value.date_from || 'all'}_${filters.value.date_to || 'now'}`,
    flat, [
      { key: 'date', label: 'Date' }, { key: 'payment_number', label: 'PAY #' },
      { key: 'patient', label: 'Patient' }, { key: 'case_number', label: 'Case #' },
      { key: 'test_code', label: 'Test Code' }, { key: 'test_name', label: 'Test Name' },
      { key: 'qty', label: 'Qty' }, { key: 'unit_price', label: 'Unit Price' },
      { key: 'line_total', label: 'Line Total' }, { key: 'subtotal', label: 'Payment Subtotal' },
      { key: 'discount', label: 'Discount' }, { key: 'total', label: 'Total' },
      { key: 'method', label: 'Method' }, { key: 'channel', label: 'Channel' },
      { key: 'reference', label: 'Reference' }, { key: 'cashier', label: 'Cashier' },
    ])
}
</script>

<template>
  <div class="flex h-full flex-col gap-4 overflow-auto pb-8">
    <ReportHeader title="Daily Detailed Sales"
                  description="Every payment for the range, itemized by test — grouped by day."
                  :loading="loading"
                  @change="reload" @export-csv="exportRows" @print="printReport" />

    <div v-if="error" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{{ error }}</div>

    <div class="print-area space-y-3">
      <div class="hidden print:block text-center">
        <h1 class="text-lg font-bold">{{ tenant.current?.name || 'Laboratory' }} — Daily Detailed Sales</h1>
        <p class="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
          {{ filters.date_from ? formatDate(filters.date_from) : 'earliest' }} to
          {{ filters.date_to ? formatDate(filters.date_to) : 'latest' }}
        </p>
      </div>

      <!-- Grand totals card. Sits at the top so it prints on page 1. -->
      <div v-if="!loading" class="grid grid-cols-2 gap-3">
        <div class="card"><div class="card-body">
          <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500">Payments</div>
          <div class="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-100">{{ grandCount }}</div>
        </div></div>
        <div class="card"><div class="card-body">
          <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500">Total Sales</div>
          <div class="mt-1 text-2xl font-bold text-emerald-600 tabular-nums">{{ money(grandTotal) }}</div>
        </div></div>
      </div>

      <div v-if="loading" class="card"><div class="card-body h-40 animate-pulse rounded bg-slate-50 dark:bg-slate-800"></div></div>

      <div v-else-if="!rows.length" class="card"><div class="card-body py-8 text-center text-xs text-slate-400 dark:text-slate-500">
        No sales in this range.
      </div></div>

      <!-- One card per day. Each payment row is followed by its item lines. -->
      <div v-for="day in groupedByDay" :key="day.date" class="card overflow-hidden">
        <div class="card-header flex items-center justify-between bg-slate-50 dark:bg-slate-800">
          <div>
            <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">{{ formatDate(day.date) }}</div>
            <div class="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
              {{ day.count }} payment(s) · {{ day.items_count }} test line(s)
            </div>
          </div>
          <div class="text-right">
            <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500">Day Total</div>
            <div class="text-base font-bold text-emerald-700 tabular-nums">{{ money(day.subtotal) }}</div>
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead class="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 dark:text-slate-500">
              <tr>
                <th class="px-2 py-1.5 text-left">Time / PAY#</th>
                <th class="px-2 py-1.5 text-left hidden sm:table-cell">Patient</th>
                <th class="px-2 py-1.5 text-left">Test</th>
                <th class="px-2 py-1.5 text-right">Qty</th>
                <th class="px-2 py-1.5 text-right">Amount</th>
                <th class="px-2 py-1.5 text-left hidden lg:table-cell">Method</th>
                <th class="px-2 py-1.5 text-left hidden lg:table-cell">Cashier</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="p in day.payments" :key="p.uuid">
                <!-- Payment header row (spans the item lines below) -->
                <tr class="border-t border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 font-semibold">
                  <td class="px-2 py-1.5 align-top">
                    <div class="font-mono text-[11px] text-brand-700">{{ p.payment_number }}</div>
                    <div class="text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-500">{{ formatDateTime(p.payment_date) }}</div>
                  </td>
                  <td class="px-2 py-1.5 align-top hidden sm:table-cell">
                    <div>{{ patientName(p) }}</div>
                    <div class="text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-500 font-mono">{{ p.patient_case_number || '—' }}</div>
                  </td>
                  <td colspan="2" class="px-2 py-1.5 text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase">
                    {{ p.items?.length || 0 }} test(s)
                    <span v-if="p.discount_code" class="ml-1 text-amber-700">· discount {{ p.discount_code }}</span>
                  </td>
                  <td class="px-2 py-1.5 text-right align-top">
                    <div class="text-emerald-700 tabular-nums">{{ money(p.total) }}</div>
                    <div v-if="p.discount_amount > 0" class="text-[10px] text-amber-700">− {{ money(p.discount_amount) }}</div>
                  </td>
                  <td class="px-2 py-1.5 align-top hidden lg:table-cell">
                    <div class="text-[10px] uppercase">{{ PAYMENT_METHOD_LABELS[p.payment_method] || p.payment_method }}</div>
                    <div v-if="p.channel" class="text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-500">{{ p.channel }}</div>
                    <div v-if="p.reference" class="text-[10px] font-mono text-slate-400 dark:text-slate-500">{{ p.reference }}</div>
                  </td>
                  <td class="px-2 py-1.5 align-top hidden lg:table-cell text-slate-700 dark:text-slate-200">{{ p.created_by || '—' }}</td>
                </tr>
                <!-- Itemized test rows -->
                <tr v-for="(it, i) in p.items" :key="p.uuid + '-' + i"
                    class="border-t border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-200">
                  <td class="px-2 py-1"></td>
                  <td class="px-2 py-1 hidden sm:table-cell"></td>
                  <td class="px-2 py-1">
                    <span class="font-mono text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-500">{{ it.code }}</span>
                    <span class="ml-1">{{ it.name }}</span>
                    <span v-if="it.package_code" class="ml-1 text-[10px] italic text-slate-400 dark:text-slate-500">(via {{ it.package_code }})</span>
                  </td>
                  <td class="px-2 py-1 text-right tabular-nums">{{ it.quantity }}</td>
                  <td class="px-2 py-1 text-right tabular-nums">{{ money(it.line_selling_price) }}</td>
                  <td class="px-2 py-1 hidden lg:table-cell"></td>
                  <td class="px-2 py-1 hidden lg:table-cell"></td>
                </tr>
                <tr v-if="!p.items?.length"
                    class="border-t border-slate-100 dark:border-slate-800 italic text-slate-400 dark:text-slate-500 text-[10px]">
                  <td colspan="7" class="px-4 py-1">No line items on this payment.</td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
