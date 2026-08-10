<script setup>
import { ref, watch } from 'vue'

/**
 * Shared header for every /reports/* view: title, description, date range
 * with presets (incl. "All time"), optional cashier filter, and export /
 * print buttons. Emits 'change' whenever the filters change so the parent
 * can re-fetch.
 *
 * Props:
 *   title        — report title
 *   description  — subtitle
 *   mode         — 'range' (default), 'year', or 'none'. 'year' shows a year
 *                  selector instead of a date range.
 *   showCashier  — show the created_by text filter
 *   showExport   — show CSV export + print buttons
 *   loading      — disables the export buttons while loading
 *
 * v-model:filters — { date_from, date_to, year, created_by }
 */
const props = defineProps({
  title: String,
  description: String,
  mode: { type: String, default: 'range' },      // 'range' | 'year' | 'none'
  showCashier: Boolean,
  showExport: { type: Boolean, default: true },
  loading: Boolean,
  // Optional category dropdown — pass an array of strings to render it. First
  // option "All" sends undefined. Used by the Expense Report.
  categories: { type: Array, default: () => [] },
  categoryLabel: { type: String, default: 'Category' },
})
const emit = defineEmits(['change', 'export-csv', 'print'])

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function shiftDay(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Default: last 30 days incl. today.
const dateFrom = ref(shiftDay(todayStr(), -29))
const dateTo   = ref(todayStr())
const year     = ref(new Date().getFullYear())
const createdBy = ref('')
const category = ref('')
const activePreset = ref('30d')

const PRESETS = [
  { k: 'today', label: 'Today' },
  { k: '7d',    label: '7d' },
  { k: '30d',   label: '30d' },
  { k: 'mtd',   label: 'MTD' },
  { k: 'ytd',   label: 'YTD' },
  { k: 'all',   label: 'All' },
]

function applyPreset(k) {
  activePreset.value = k
  const today = todayStr()
  dateTo.value = today
  if      (k === 'today') dateFrom.value = today
  else if (k === '7d')    dateFrom.value = shiftDay(today, -6)
  else if (k === '30d')   dateFrom.value = shiftDay(today, -29)
  else if (k === 'mtd')   dateFrom.value = today.slice(0, 8) + '01'
  else if (k === 'ytd')   dateFrom.value = today.slice(0, 4) + '-01-01'
  else if (k === 'all')   { dateFrom.value = ''; dateTo.value = '' }
  emitChange()
}
function onCustomRange() { activePreset.value = 'custom'; emitChange() }
function emitChange() {
  emit('change', {
    date_from: dateFrom.value || undefined,
    date_to:   dateTo.value   || undefined,
    year:      year.value,
    created_by: createdBy.value.trim() || undefined,
    category:  category.value || undefined,
  })
}

// Emit initial filters on mount so parents can trigger the first fetch.
emitChange()

const availableYears = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i)
</script>

<template>
  <div class="card no-print-hide">
    <div class="card-body flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div class="min-w-0">
        <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">{{ title }}</div>
        <div v-if="description" class="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{{ description }}</div>

        <!-- Filter row: presets + range OR year, plus cashier filter -->
        <div class="mt-3 flex flex-wrap items-center gap-2">
          <template v-if="mode === 'range'">
            <div class="inline-flex rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-0.5 text-xs">
              <button v-for="p in PRESETS" :key="p.k" @click="applyPreset(p.k)"
                      class="rounded px-2.5 py-1 font-semibold transition-colors"
                      :class="activePreset === p.k
                              ? 'bg-white dark:bg-slate-900 text-brand-700 shadow-sm'
                              : 'text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-100'">
                {{ p.label }}
              </button>
            </div>
            <input type="date" v-model="dateFrom" @change="onCustomRange"
                   :max="dateTo || undefined" class="input !py-1 !text-xs w-36" />
            <span class="text-xs text-slate-400 dark:text-slate-500">→</span>
            <input type="date" v-model="dateTo" @change="onCustomRange"
                   :min="dateFrom || undefined" class="input !py-1 !text-xs w-36" />
          </template>

          <template v-else-if="mode === 'year'">
            <label class="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500">Year</label>
            <select v-model.number="year" @change="emitChange" class="input !py-1 !text-xs w-28">
              <option v-for="y in availableYears" :key="y" :value="y">{{ y }}</option>
            </select>
          </template>

          <template v-if="showCashier">
            <input v-model="createdBy" @change="emitChange"
                   placeholder="Cashier name (all)" class="input !py-1 !text-xs w-40" />
          </template>

          <template v-if="categories && categories.length">
            <label class="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500">{{ categoryLabel }}</label>
            <select v-model="category" @change="emitChange" class="input !py-1 !text-xs w-40">
              <option value="">All</option>
              <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
            </select>
          </template>
        </div>
      </div>

      <div v-if="showExport" class="flex shrink-0 flex-wrap gap-2">
        <button class="btn-secondary !text-xs" :disabled="loading" @click="emit('export-csv')" title="Download CSV">
          ⬇ CSV
        </button>
        <button class="btn-secondary !text-xs" :disabled="loading" @click="emit('print')" title="Print report">
          ⎙ Print
        </button>
      </div>
    </div>
  </div>
</template>
