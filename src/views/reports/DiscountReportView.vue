<script setup>
import { ref, computed } from 'vue'
import { useTenantStore } from '../../stores/tenant'
import ReportHeader from '../../components/ReportHeader.vue'
import { getDiscountReport } from '../../api/reports'
import { exportCsv, printReport } from '../../utils/csvExport'
import { money } from '../../utils/format'

const tenant = useTenantStore()
const filters = ref({})
const data = ref({ rows: [], total_discount: 0 })
const loading = ref(false)
const error = ref('')

async function reload(f) {
  filters.value = f; loading.value = true; error.value = ''
  try { data.value = await getDiscountReport(f) }
  catch (e) { error.value = e?.message || 'Failed to load' }
  finally { loading.value = false }
}

const totals = computed(() => ({
  discount: data.value.rows.reduce((s, r) => s + Number(r.discount_amount || 0), 0),
  subtotal: data.value.rows.reduce((s, r) => s + Number(r.subtotal || 0), 0),
  count:    data.value.rows.reduce((s, r) => s + Number(r.count || 0), 0),
}))

function exportRows() {
  exportCsv(`discounts-${filters.value.date_from || 'all'}_${filters.value.date_to || 'now'}`,
    data.value.rows, [
      { key: 'code', label: 'Code' }, { key: 'name', label: 'Name' },
      { key: 'type', label: 'Type' }, { key: 'count', label: 'Times used' },
      { key: 'subtotal', label: 'Gross subtotal' }, { key: 'discount_amount', label: 'Discount given' },
    ])
}
</script>

<template>
  <div class="flex h-full flex-col gap-4 overflow-auto pb-8">
    <ReportHeader title="Discount Report"
                  description="Which discount codes were applied, how many times, and how much was given away."
                  :loading="loading"
                  @change="reload" @export-csv="exportRows" @print="printReport" />

    <div v-if="error" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{{ error }}</div>

    <div class="print-area space-y-3">
      <div class="hidden print:block text-center">
        <h1 class="text-lg font-bold">{{ tenant.current?.name || 'Laboratory' }} — Discount Report</h1>
      </div>

      <div class="card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="table w-full text-xs">
            <thead class="bg-slate-50">
              <tr>
                <th>Code</th>
                <th class="hidden sm:table-cell">Name</th>
                <th>Type</th>
                <th class="text-right">Uses</th>
                <th class="text-right hidden md:table-cell">Gross</th>
                <th class="text-right">Given Away</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!data.rows.length && !loading">
                <td colspan="6" class="py-4 text-center text-xs text-slate-400">No discounts applied in this range.</td>
              </tr>
              <tr v-for="r in data.rows" :key="r.code + r.name" class="border-b border-slate-100">
                <td class="font-mono font-semibold">{{ r.code }}</td>
                <td class="hidden sm:table-cell">{{ r.name }}</td>
                <td class="text-[10px] uppercase text-slate-500">{{ r.type }}</td>
                <td class="text-right">{{ r.count }}</td>
                <td class="text-right hidden md:table-cell">{{ money(r.subtotal) }}</td>
                <td class="text-right font-semibold text-amber-700">− {{ money(r.discount_amount) }}</td>
              </tr>
            </tbody>
            <tfoot v-if="data.rows.length" class="bg-slate-100">
              <tr class="font-bold">
                <td colspan="3">Total</td>
                <td class="text-right">{{ totals.count }}</td>
                <td class="text-right hidden md:table-cell">{{ money(totals.subtotal) }}</td>
                <td class="text-right text-amber-700">− {{ money(totals.discount) }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
