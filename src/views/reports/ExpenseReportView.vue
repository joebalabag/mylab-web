<script setup>
import { ref, computed } from 'vue'
import { useTenantStore } from '../../stores/tenant'
import ReportHeader from '../../components/ReportHeader.vue'
import DoughnutChart from '../../components/DoughnutChart.vue'
import { getExpenseReport } from '../../api/reports'
import { exportCsv, printReport } from '../../utils/csvExport'
import { EXPENSE_CATEGORIES } from '../../utils/constants'
import { money, formatDate } from '../../utils/format'

const tenant = useTenantStore()
const filters = ref({})
const data = ref({ rows: [], by_category: [], grand_total: 0, voided_total: 0, count: 0 })
const loading = ref(false)
const error = ref('')

async function reload(f) {
  filters.value = f; loading.value = true; error.value = ''
  try { data.value = await getExpenseReport(f) }
  catch (e) { error.value = e?.message || 'Failed to load' }
  finally { loading.value = false }
}

const catLabels = computed(() => data.value.by_category.map(r => r.category))
const catData   = computed(() => data.value.by_category.map(r => Number(r.total || 0)))

function isVoid(r) { return (r.status || '').toLowerCase() === 'void' }

function exportRows() {
  exportCsv(`expenses-${filters.value.date_from || 'all'}_${filters.value.date_to || 'now'}`,
    data.value.rows.map(r => ({
      date: r.date_transact,
      category: r.category,
      description: r.description,
      amount: r.amount,
      status: r.status,
      recorded_by: r.cashier_name || r.created_by || '',
      notes: r.notes || '',
    })), [
      { key: 'date', label: 'Date' },
      { key: 'category', label: 'Category' },
      { key: 'description', label: 'Description' },
      { key: 'amount', label: 'Amount' },
      { key: 'status', label: 'Status' },
      { key: 'recorded_by', label: 'Recorded By' },
      { key: 'notes', label: 'Notes' },
    ])
}
</script>

<template>
  <div class="flex h-full flex-col gap-4 overflow-auto pb-8">
    <ReportHeader title="Expense Report"
                  description="All expenses in the range, or filter to a single category."
                  :categories="EXPENSE_CATEGORIES" category-label="Category"
                  :loading="loading"
                  @change="reload" @export-csv="exportRows" @print="printReport" />

    <div v-if="error" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{{ error }}</div>

    <div class="print-area space-y-4">
      <div class="hidden print:block text-center">
        <h1 class="text-lg font-bold">{{ tenant.current?.name || 'Laboratory' }} — Expense Report</h1>
        <p class="text-xs text-slate-500">
          {{ filters.date_from ? formatDate(filters.date_from) : 'earliest' }} to
          {{ filters.date_to ? formatDate(filters.date_to) : 'latest' }}
          <span v-if="filters.category"> · {{ filters.category }}</span>
        </p>
      </div>

      <!-- KPIs -->
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div class="card"><div class="card-body">
          <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Total Spent</div>
          <div class="mt-1 text-2xl font-bold text-rose-600 tabular-nums">{{ money(data.grand_total || 0) }}</div>
          <div class="text-[11px] text-slate-500">{{ data.count || 0 }} entries · active only</div>
        </div></div>
        <div class="card"><div class="card-body">
          <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Voided</div>
          <div class="mt-1 text-2xl font-bold text-slate-500 tabular-nums line-through">{{ money(data.voided_total || 0) }}</div>
        </div></div>
        <div class="card"><div class="card-body">
          <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Categories</div>
          <div class="mt-1 text-2xl font-bold text-slate-800">{{ data.by_category?.length || 0 }}</div>
        </div></div>
      </div>

      <!-- Category breakdown + doughnut -->
      <div class="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div class="card">
          <div class="card-header">
            <div class="text-sm font-semibold text-slate-800">Category Share</div>
          </div>
          <div class="card-body">
            <div v-if="loading" class="h-56 animate-pulse rounded bg-slate-50"></div>
            <div v-else-if="!catLabels.length" class="flex h-56 items-center justify-center text-xs text-slate-400">
              No expenses in this range.
            </div>
            <div v-else class="h-56"><DoughnutChart :labels="catLabels" :data="catData" /></div>
          </div>
        </div>

        <div class="card lg:col-span-2 overflow-hidden">
          <div class="card-header">
            <div class="text-sm font-semibold text-slate-800">Totals by Category</div>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead class="bg-slate-50">
                <tr>
                  <th class="px-2 py-1.5 text-left">Category</th>
                  <th class="px-2 py-1.5 text-right">Entries</th>
                  <th class="px-2 py-1.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!data.by_category?.length && !loading">
                  <td colspan="3" class="py-4 text-center text-xs text-slate-400">No expenses.</td>
                </tr>
                <tr v-for="c in data.by_category" :key="c.category" class="border-b border-slate-100">
                  <td class="px-2 py-1.5 font-semibold">{{ c.category }}</td>
                  <td class="px-2 py-1.5 text-right">{{ c.count }}</td>
                  <td class="px-2 py-1.5 text-right font-semibold text-rose-700 tabular-nums">{{ money(c.total) }}</td>
                </tr>
              </tbody>
              <tfoot v-if="data.by_category?.length" class="bg-slate-100">
                <tr class="font-bold">
                  <td class="px-2 py-1.5">Total</td>
                  <td class="px-2 py-1.5 text-right">{{ data.count }}</td>
                  <td class="px-2 py-1.5 text-right text-rose-700 tabular-nums">{{ money(data.grand_total) }}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      <!-- Row list -->
      <div class="card overflow-hidden">
        <div class="card-header">
          <div class="text-sm font-semibold text-slate-800">Expense Entries</div>
          <span class="text-xs text-slate-500">Sorted by date, newest first</span>
        </div>
        <div class="overflow-x-auto">
          <table class="table w-full text-xs">
            <thead class="bg-slate-50">
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Description</th>
                <th class="text-right">Amount</th>
                <th class="hidden sm:table-cell">Recorded By</th>
                <th class="hidden md:table-cell">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!data.rows?.length && !loading">
                <td colspan="6" class="py-4 text-center text-xs text-slate-400">No expenses in this range.</td>
              </tr>
              <tr v-for="r in data.rows" :key="r.uuid"
                  class="border-b border-slate-100"
                  :class="isVoid(r) && 'bg-slate-50/50'">
                <td>{{ formatDate(r.date_transact) }}</td>
                <td>{{ r.category }}</td>
                <td class="max-w-md truncate">
                  {{ r.description }}
                  <div v-if="r.notes" class="text-[10px] text-slate-500 italic truncate">{{ r.notes }}</div>
                </td>
                <td class="text-right font-semibold tabular-nums"
                    :class="isVoid(r) ? 'text-slate-400 line-through' : 'text-rose-700'">
                  {{ money(r.amount) }}
                </td>
                <td class="hidden sm:table-cell text-slate-600">{{ r.cashier_name || r.created_by || '—' }}</td>
                <td class="hidden md:table-cell">
                  <span class="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
                        :class="isVoid(r) ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'">
                    {{ r.status }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
