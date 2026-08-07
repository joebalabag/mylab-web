<script setup>
import { ref, computed } from 'vue'
import { useTenantStore } from '../../stores/tenant'
import ReportHeader from '../../components/ReportHeader.vue'
import { getCashierSalesReport } from '../../api/reports'
import { exportCsv, printReport } from '../../utils/csvExport'
import { money, formatDate } from '../../utils/format'

const tenant = useTenantStore()
const filters = ref({})
const rows = ref([])
const loading = ref(false)
const error = ref('')

async function reload(f) {
  filters.value = f; loading.value = true; error.value = ''
  try { rows.value = await getCashierSalesReport(f) }
  catch (e) { error.value = e?.message || 'Failed to load' }
  finally { loading.value = false }
}

const totals = computed(() => ({
  revenue:   rows.value.reduce((s, r) => s + Number(r.revenue || 0), 0),
  discounts: rows.value.reduce((s, r) => s + Number(r.discounts_given || 0), 0),
  count:     rows.value.reduce((s, r) => s + Number(r.count || 0), 0),
}))

function exportRows() {
  exportCsv(`cashier-sales-${filters.value.date_from || 'all'}_${filters.value.date_to || 'now'}`,
    rows.value, [
      { key: 'cashier', label: 'Cashier' },
      { key: 'count', label: 'Payments' },
      { key: 'revenue', label: 'Revenue' },
      { key: 'discounts_given', label: 'Discounts' },
    ])
}
</script>

<template>
  <div class="flex h-full flex-col gap-4 overflow-auto pb-8">
    <ReportHeader title="Cashier Sales Report"
                  description="Revenue collected per cashier / recorder."
                  show-cashier :loading="loading"
                  @change="reload" @export-csv="exportRows" @print="printReport" />

    <div v-if="error" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{{ error }}</div>

    <div class="print-area">
      <div class="hidden print:block text-center mb-3">
        <h1 class="text-lg font-bold">{{ tenant.current?.name || 'Laboratory' }} — Cashier Sales</h1>
        <p class="text-xs text-slate-500">
          {{ filters.date_from ? formatDate(filters.date_from) : 'earliest' }} to
          {{ filters.date_to ? formatDate(filters.date_to) : 'latest' }}
        </p>
      </div>

      <div class="card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="table w-full text-sm">
            <thead class="bg-slate-50">
              <tr>
                <th>Cashier</th>
                <th class="text-right">Payments</th>
                <th class="text-right">Revenue</th>
                <th class="text-right hidden sm:table-cell">Discounts</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!rows.length && !loading">
                <td colspan="4" class="py-4 text-center text-xs text-slate-400">No cashier sales in this range.</td>
              </tr>
              <tr v-for="r in rows" :key="r.cashier" class="border-b border-slate-100">
                <td class="font-semibold">{{ r.cashier }}</td>
                <td class="text-right">{{ r.count }}</td>
                <td class="text-right font-semibold text-emerald-700">{{ money(r.revenue) }}</td>
                <td class="text-right text-amber-700 hidden sm:table-cell">− {{ money(r.discounts_given) }}</td>
              </tr>
            </tbody>
            <tfoot v-if="rows.length" class="bg-slate-100">
              <tr class="font-bold">
                <td>Total</td>
                <td class="text-right">{{ totals.count }}</td>
                <td class="text-right text-emerald-700">{{ money(totals.revenue) }}</td>
                <td class="text-right text-amber-700 hidden sm:table-cell">− {{ money(totals.discounts) }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
