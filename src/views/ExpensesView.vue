<script setup>
// Expenses — dashboard + full CRUD (create, edit, view, void).
//
// Server drives the row set via useExpensesStore; getters compute the summary
// strip and category breakdown from whatever's on screen so the numbers stay
// honest with the active filter set.
import { computed, onMounted, ref } from 'vue'
import { useExpensesStore } from '../stores/expenses'
import { useAuthStore } from '../stores/auth'
import Modal from '../components/Modal.vue'
import EmptyState from '../components/EmptyState.vue'
import SkeletonRows from '../components/SkeletonRows.vue'
import RowActionMenu from '../components/RowActionMenu.vue'
import { money, formatDate, formatDateTime, todayISO } from '../utils/format'
import { EXPENSE_CATEGORIES } from '../utils/constants'

const expenses = useExpensesStore()
const auth     = useAuthStore()

/* ─── Filters ─── */
const search       = ref('')
const categoryFilt = ref('')       // '' | one of EXPENSE_CATEGORIES
// Default the range to today so the dashboard shows today's expenses on
// first paint. Reset clears the range so the operator can widen it.
const dateFrom     = ref(todayISO())
const dateTo       = ref(todayISO())
// '' = All, 'active' = only active, 'voided' = only voided. Defaults to
// active so a busy dashboard doesn't lead with a wall of voided rows.
const statusFilt   = ref('active')  // '' | 'active' | 'void'
const listError    = ref('')

// Mobile-only collapse toggle for the filter card. Defaults collapsed so
// the KPIs and the list land above the fold on narrow screens; the sm+
// breakpoint always expands via the `sm:flex` override.
const filtersOpen = ref(false)
const filtersSummary = computed(() => {
  const range = dateFrom.value === dateTo.value
    ? dateFrom.value
    : `${dateFrom.value || '…'} → ${dateTo.value || '…'}`
  const parts = [range]
  if (categoryFilt.value) parts.push(categoryFilt.value)
  if (statusFilt.value)   parts.push(statusFilt.value === 'active' ? 'Active' : 'Void')
  if (search.value.trim()) parts.push(`"${search.value.trim()}"`)
  return parts.join(' · ')
})

async function loadExpenses() {
  listError.value = ''
  // Pull the full status set from the server so the summary tiles (total,
  // void count, category totals) reflect the actual dataset for this date
  // range. The Status dropdown then narrows the visible rows client-side —
  // otherwise picking "Active" would collapse the void count to 0 even when
  // voided rows exist.
  expenses.setFilters({
    keywords:  search.value.trim(),
    category:  categoryFilt.value,
    date_from: dateFrom.value,
    date_to:   dateTo.value,
    status:    []
  })
  try {
    await expenses.fetch()
  } catch (e) {
    listError.value = e?.message || 'Failed to load expenses'
  }
}

// Client-side view over the fetched rows. Table iterates `visibleRows`
// instead of `expenses.items` so the Status dropdown is a pure display filter.
const visibleRows = computed(() => {
  const s = statusFilt.value
  if (!s) return expenses.items
  if (s === 'void') return expenses.voidedItems
  return expenses.validItems
})
onMounted(loadExpenses)

function onSearchEnter()  { loadExpenses() }
function onFilterChange() { loadExpenses() }
function clearFilters() {
  search.value = ''
  categoryFilt.value = ''
  // Reset snaps the range back to today (the dashboard default), not to an
  // open-ended empty range — matches the initial-load behaviour.
  dateFrom.value = todayISO()
  dateTo.value = todayISO()
  statusFilt.value = 'active'
  loadExpenses()
}

/* ─── Summary ─── */
const totalCount    = computed(() => expenses.validItems.length)
const totalAmount   = computed(() => expenses.totalAmount)
const voidedCount   = computed(() => expenses.voidedItems.length)
const categoryTotals = computed(() => {
  const entries = Object.entries(expenses.totalsByCategory || {})
  entries.sort((a, b) => b[1] - a[1])
  return entries
})
const topCategory = computed(() => categoryTotals.value[0] || null)

function isVoided(row) {
  const s = String(row?.status || '').toLowerCase()
  // Backend emits `status = 'void'`; accept the legacy `'voided'` too.
  return s === 'void' || s === 'voided'
}

/* ─── Toast ─── */
const toast = ref('')
const toastTone = ref('emerald')
let toastTimer = null
function flash(m, tone = 'emerald') {
  toast.value = m
  toastTone.value = tone
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.value = '', 2500)
}
function flashError(e, fallback) {
  flash(e?.message || fallback || 'Something went wrong', 'rose')
}

/* ─── Add / Edit ─── */
const showForm = ref(false)
const editing  = ref(null)
const emptyForm = () => ({
  expense_date: todayISO(),
  category:     EXPENSE_CATEGORIES[0],
  description:  '',
  amount:       0,
  notes:        ''
})
const form = ref(emptyForm())
const formError = ref('')
const submitting = ref(false)

function openAdd() {
  editing.value = null
  form.value = emptyForm()
  formError.value = ''
  showForm.value = true
}
function openEdit(row) {
  editing.value = row
  const rawDate = row.date_transact || row.expense_date || ''
  form.value = {
    expense_date: rawDate.slice(0, 10) || todayISO(),
    category:     row.category || EXPENSE_CATEGORIES[0],
    description:  row.description || '',
    amount:       Number(row.amount) || 0,
    notes:        row.notes || ''
  }
  formError.value = ''
  showForm.value = true
}
function closeForm() {
  if (submitting.value) return
  showForm.value = false
  editing.value = null
  formError.value = ''
}

async function saveExpense() {
  formError.value = ''
  const f = form.value
  // Defensive access check — the modal-open triggers are already gated in
  // the UI, but a stale editing ref or a programmatic call shouldn't
  // silently bypass the access template.
  const needed = editing.value ? canEditExpense.value : canAddExpense.value
  if (!needed) {
    formError.value = "You don't have permission to " + (editing.value ? 'edit' : 'record') + ' expenses.'
    return
  }
  if (!f.expense_date) { formError.value = 'Pick an expense date.'; return }
  if (!f.category)     { formError.value = 'Select a category.'; return }
  if (!f.description?.trim()) { formError.value = 'Description is required.'; return }
  const amt = Number(f.amount)
  if (!Number.isFinite(amt) || amt <= 0) {
    formError.value = 'Amount must be greater than zero.'
    return
  }
  submitting.value = true
  try {
    const payload = {
      expense_date: f.expense_date,
      category:     f.category,
      description:  f.description.trim(),
      amount:       amt,
      notes:        (f.notes || '').trim() || undefined
    }
    if (editing.value?.uuid) {
      await expenses.update(editing.value.uuid, payload)
      flash('Expense updated')
    } else {
      await expenses.create(payload)
      flash('Expense recorded')
    }
    showForm.value = false
    editing.value = null
  } catch (e) {
    formError.value = e?.message || 'Failed to save expense.'
  } finally {
    submitting.value = false
  }
}

/* ─── View ─── */
const showDetails = ref(false)
const detailRow = ref(null)

async function openView(row) {
  detailRow.value = row
  showDetails.value = true
  // Refetch the full record so audit-only fields (voided_reason, voided_by_name)
  // land even if the list endpoint slimmed them out.
  try {
    const fresh = await expenses.view(row.uuid)
    if (fresh?.uuid) detailRow.value = fresh
  } catch (_) { /* fall back to the list row */ }
}
function closeDetails() {
  showDetails.value = false
  detailRow.value = null
}

/* ─── Void ─── */
const showVoid = ref(false)
const voidTarget = ref(null)
const voidReason = ref('')
const voidError  = ref('')
const voidSubmitting = ref(false)

function askVoid(row) {
  voidTarget.value = row
  voidReason.value = ''
  voidError.value = ''
  showVoid.value = true
}
function cancelVoid() {
  if (voidSubmitting.value) return
  showVoid.value = false
  voidTarget.value = null
  voidReason.value = ''
  voidError.value = ''
}
async function confirmVoid() {
  if (!voidTarget.value?.uuid) return
  if (!canVoidExpense.value) {
    voidError.value = "You don't have permission to void expenses."
    return
  }
  if (!voidReason.value.trim()) {
    voidError.value = 'Reason is required to void an expense.'
    return
  }
  voidSubmitting.value = true
  voidError.value = ''
  try {
    await expenses.voidExpense(voidTarget.value.uuid, voidReason.value.trim())
    flash(`Voided expense · ${voidTarget.value.description || voidTarget.value.uuid.slice(0, 8)}`)
    showVoid.value = false
    voidTarget.value = null
    voidReason.value = ''
  } catch (e) {
    voidError.value = e?.message || 'Failed to void expense.'
  } finally {
    voidSubmitting.value = false
  }
}

// Sub-navigation keys mirror the access-template rows for the Expenses
// module ('expenses' main_navigation). Centralized so a rename on the
// backend touches one place.
const EXPENSE_ACCESS = {
  main:  'expenses',
  add:   'add expense',
  edit:  'edit expense',
  view:  'view expense',
  void:  'void expense'
}
// Admin/manager escape hatch — if the tenant's access templates don't have
// the fine-grained "add/edit/view/void expense" sub_navigation seeded yet,
// the CRUD buttons would silently hide. Store admins & managers (and the
// platform super-admin token) bypass the check so they can always operate.
// Mirrors the pattern used in TenantSettingsView.
const isPrivileged = computed(() => {
  if (auth.user?.type === 'admin') return true
  const r = (auth.role || '').toLowerCase()
  return r === 'admin' || r === 'manager'
})
const canAddExpense  = computed(() => isPrivileged.value || auth.canDo(EXPENSE_ACCESS.main, EXPENSE_ACCESS.add))
const canEditExpense = computed(() => isPrivileged.value || auth.canDo(EXPENSE_ACCESS.main, EXPENSE_ACCESS.edit))
const canViewExpense = computed(() => isPrivileged.value || auth.canDo(EXPENSE_ACCESS.main, EXPENSE_ACCESS.view))
const canVoidExpense = computed(() => isPrivileged.value || auth.canDo(EXPENSE_ACCESS.main, EXPENSE_ACCESS.void))

function rowActions(row) {
  const voided = isVoided(row)
  const items = []
  if (canViewExpense.value) {
    items.push({ label: 'View', icon: 'eye', onClick: () => openView(row) })
  }
  if (!voided && canEditExpense.value) {
    items.push({ label: 'Edit', icon: 'edit', onClick: () => openEdit(row) })
  }
  if (!voided && canVoidExpense.value) {
    if (items.length) items.push({ divider: true })
    items.push({ label: 'Void', icon: 'trash', variant: 'danger', onClick: () => askVoid(row) })
  }
  return items
}

// Small colour map so scanning the category chip is a signal, not a wall
// of grey. Tailwind classes are enumerated (not concatenated) so the JIT
// compiler actually emits them.
const categoryChip = {
  Delivery:       'bg-blue-50 text-blue-700 ring-blue-200',
  Utilities:      'bg-amber-50 text-amber-800 ring-amber-200',
  Salary:         'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Supplies:       'bg-purple-50 text-purple-700 ring-purple-200',
  Rent:           'bg-rose-50 text-rose-700 ring-rose-200',
  Transportation: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
  Others:         'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 ring-slate-200 dark:ring-slate-700'
}
function chipClass(cat) {
  return categoryChip[cat] || categoryChip.Others
}
</script>

<template>
  <div class="flex min-w-0 flex-col gap-4 sm:h-full">
    <!-- Header -->
    <div class="flex shrink-0 flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-lg font-bold text-slate-800 dark:text-slate-100 sm:text-xl">Expenses</h1>
        <p class="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
          Track operational costs by category. Records can be edited or voided; voided rows remain visible for audit.
        </p>
      </div>
      <button v-if="canAddExpense" type="button" class="btn-primary" @click="openAdd">
        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        New Expense
      </button>
    </div>

    <!-- Summary strip -->
    <div class="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
        <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500">Total</div>
        <div class="mt-1 font-mono text-lg font-black text-slate-900 dark:text-slate-100">{{ money(totalAmount) }}</div>
        <div class="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500">{{ totalCount }} record{{ totalCount === 1 ? '' : 's' }}</div>
      </div>
      <div class="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
        <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500">Top category</div>
        <template v-if="topCategory">
          <div class="mt-1 flex items-center gap-1.5">
            <span class="inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold ring-1"
                  :class="chipClass(topCategory[0])">
              {{ topCategory[0] }}
            </span>
          </div>
          <div class="mt-0.5 font-mono text-sm font-semibold text-slate-800 dark:text-slate-100">{{ money(topCategory[1]) }}</div>
        </template>
        <template v-else>
          <div class="mt-1 text-sm text-slate-400 dark:text-slate-500">—</div>
        </template>
      </div>
      <div class="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
        <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500">Void</div>
        <div class="mt-1 font-mono text-lg font-black text-rose-600">{{ voidedCount }}</div>
        <div class="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500">excluded from totals</div>
      </div>
      <div class="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
        <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500">Categories</div>
        <div class="mt-1 space-y-0.5">
          <div v-for="([cat, amt]) in categoryTotals.slice(0, 3)" :key="cat"
               class="flex items-center justify-between gap-2 text-[11px]">
            <span class="truncate text-slate-600 dark:text-slate-300">{{ cat }}</span>
            <span class="font-mono font-semibold text-slate-800 dark:text-slate-100">{{ money(amt) }}</span>
          </div>
          <div v-if="!categoryTotals.length" class="text-xs text-slate-400 dark:text-slate-500">—</div>
        </div>
      </div>
    </div>

    <!-- Filters (collapsible on mobile) -->
    <div class="card shrink-0 min-w-0 overflow-hidden">
      <!-- Mobile-only collapse toggle. sm:hidden so tablet/desktop always
           shows the filter body inline. Mirrors the pattern used by
           ReportsView. -->
      <button
        type="button"
        class="flex w-full items-center justify-between border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 sm:hidden"
        :aria-expanded="filtersOpen"
        aria-controls="expenses-filters-body"
        @click="filtersOpen = !filtersOpen"
      >
        <span class="flex items-center gap-2">
          <svg viewBox="0 0 24 24" class="h-4 w-4 text-slate-500 dark:text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
          <b>Filters</b>
          <span class="truncate text-xs font-normal text-slate-500 dark:text-slate-400 dark:text-slate-500">· {{ filtersSummary }}</span>
        </span>
        <svg viewBox="0 0 24 24"
             class="h-4 w-4 text-slate-500 dark:text-slate-400 dark:text-slate-500 transition-transform"
             :class="filtersOpen && 'rotate-180'"
             fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      <div
        id="expenses-filters-body"
        class="card-body flex-wrap items-end gap-2"
        :class="filtersOpen ? 'flex' : 'hidden sm:flex'"
      >
        <div class="min-w-0 flex-1">
          <label class="label">Search</label>
          <input v-model="search"
                 class="input"
                 placeholder="Description or notes…"
                 @keydown.enter="onSearchEnter" />
        </div>
        <div>
          <label class="label">Category</label>
          <select v-model="categoryFilt" class="input !w-40" @change="onFilterChange">
            <option value="">All</option>
            <option v-for="c in EXPENSE_CATEGORIES" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>
        <div>
          <label class="label">From</label>
          <input type="date" v-model="dateFrom" class="input !w-40" @change="onFilterChange" />
        </div>
        <div>
          <label class="label">To</label>
          <input type="date" v-model="dateTo" class="input !w-40" @change="onFilterChange" />
        </div>
        <div>
          <label class="label">Status</label>
          <select v-model="statusFilt" class="input !w-32" @change="onFilterChange">
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="void">Void</option>
          </select>
        </div>
        <button type="button" class="btn-secondary" @click="clearFilters">Reset</button>
      </div>
    </div>

    <!-- List — grows to fill remaining vertical space on sm+; scrolls
         internally so the sticky table header stays put while the body
         scrolls. On mobile the card grows naturally with the page. -->
    <div class="card flex min-w-0 flex-col sm:flex-1 sm:min-h-0 sm:overflow-hidden">
      <div class="sm:min-h-0 sm:flex-1 sm:overflow-auto">
        <SkeletonRows v-if="expenses.loading && !expenses.items.length"
                      :rows="5"
                      label="Loading expenses…"
                      :columns="['bar','pill','lines','bar','pill','bar','bar']" />
        <table v-else-if="visibleRows.length" class="table">
          <thead class="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800 shadow-[inset_0_-1px_0_theme(colors.slate.100)]">
            <tr>
              <th>Date</th>
              <th>Category</th>
              <th>Description</th>
              <th class="text-right">Amount</th>
              <th>Status</th>
              <th>Recorded</th>
              <th class="w-12 text-right"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in visibleRows" :key="row.uuid"
                :class="isVoided(row) && 'bg-rose-50/40'">
              <td class="whitespace-nowrap text-sm"
                  :class="isVoided(row) && 'text-slate-400 dark:text-slate-500 line-through'">
                {{ formatDate(row.date_transact || row.expense_date) }}
              </td>
              <td>
                <span class="inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold ring-1"
                      :class="chipClass(row.category)">
                  {{ row.category || '—' }}
                </span>
              </td>
              <td>
                <div class="min-w-0">
                  <div class="truncate text-sm font-medium"
                       :class="isVoided(row) ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-slate-800 dark:text-slate-100'">
                    {{ row.description || '—' }}
                  </div>
                  <div v-if="row.notes"
                       class="truncate text-[11px] italic"
                       :class="isVoided(row) ? 'text-slate-400 dark:text-slate-500' : 'text-slate-500 dark:text-slate-400 dark:text-slate-500'">
                    {{ row.notes }}
                  </div>
                </div>
              </td>
              <td class="text-right font-mono text-sm font-semibold"
                  :class="isVoided(row) ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-slate-800 dark:text-slate-100'">
                {{ money(row.amount) }}
              </td>
              <td>
                <span class="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ring-1"
                      :class="isVoided(row)
                        ? 'bg-rose-50 text-rose-700 ring-rose-200'
                        : 'bg-emerald-50 text-emerald-700 ring-emerald-200'">
                  <span class="inline-block h-1.5 w-1.5 rounded-full"
                        :class="isVoided(row) ? 'bg-rose-500' : 'bg-emerald-500'"></span>
                  {{ isVoided(row) ? 'Void' : (row.status || 'Active') }}
                </span>
              </td>
              <td class="whitespace-nowrap text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500">
                <div v-if="isVoided(row)" class="flex flex-col">
                  <span v-if="row.voided_at">{{ formatDateTime(row.voided_at) }}</span>
                  <span v-if="row.voided_by_name" class="text-slate-400 dark:text-slate-500">
                    by {{ row.voided_by_name }}
                  </span>
                </div>
                <div v-else class="flex flex-col">
                  <span v-if="row.created_at">{{ formatDateTime(row.created_at) }}</span>
                  <span v-if="row.recorded_by_name || row.created_by_name"
                        class="text-slate-400 dark:text-slate-500">
                    by {{ row.recorded_by_name || row.created_by_name }}
                  </span>
                </div>
              </td>
              <td class="text-right">
                <RowActionMenu :actions="rowActions(row)" />
              </td>
            </tr>
          </tbody>
        </table>
        <EmptyState v-else
                    title="No expenses yet"
                    message="Record your first expense to start tracking operational costs." />
      </div>
    </div>

    <div v-if="listError"
         class="shrink-0 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
      {{ listError }}
    </div>

    <!-- Add / Edit modal -->
    <Modal :show="showForm"
           :title="editing ? 'Edit expense' : 'New expense'"
           size="md"
           @close="closeForm">
      <form id="expenseForm" @submit.prevent="saveExpense" class="space-y-3">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label class="label">Date</label>
            <input type="date" v-model="form.expense_date" class="input" required :disabled="submitting" />
          </div>
          <div>
            <label class="label">Category</label>
            <select v-model="form.category" class="input" required :disabled="submitting">
              <option v-for="c in EXPENSE_CATEGORIES" :key="c" :value="c">{{ c }}</option>
            </select>
          </div>
        </div>
        <div>
          <label class="label">Description</label>
          <input v-model="form.description"
                 class="input"
                 required
                 :disabled="submitting"
                 placeholder="e.g. Meralco July bill" />
        </div>
        <div>
          <label class="label">Amount</label>
          <input v-model="form.amount"
                 type="number"
                 inputmode="decimal"
                 min="0"
                 step="0.01"
                 required
                 :disabled="submitting"
                 class="input"
                 placeholder="0.00" />
        </div>
        <div>
          <label class="label">Notes <span class="text-slate-400 dark:text-slate-500">(optional)</span></label>
          <textarea v-model="form.notes"
                    rows="2"
                    class="input"
                    :disabled="submitting"
                    placeholder="e.g. paid via GCash, ref# 1234"></textarea>
        </div>
        <div v-if="formError"
             class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ formError }}
        </div>
      </form>
      <template #footer>
        <button class="btn-secondary" :disabled="submitting" @click="closeForm">Cancel</button>
        <button class="btn-primary" :disabled="submitting" form="expenseForm" type="submit">
          {{ submitting ? 'Saving…' : (editing ? 'Save changes' : 'Record expense') }}
        </button>
      </template>
    </Modal>

    <!-- View modal -->
    <Modal :show="showDetails"
           :title="detailRow ? `Expense · ${detailRow.description || '—'}` : 'Expense'"
           size="md"
           @close="closeDetails">
      <div v-if="detailRow" class="space-y-3 text-sm">
        <div class="flex flex-wrap items-center gap-2">
          <span class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1"
                :class="chipClass(detailRow.category)">
            {{ detailRow.category || '—' }}
          </span>
          <span v-if="isVoided(detailRow)"
                class="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-rose-700">
            Void
          </span>
        </div>
        <dl class="grid grid-cols-3 gap-x-3 gap-y-1 text-[13px]">
          <dt class="text-slate-500 dark:text-slate-400 dark:text-slate-500">Date</dt>
          <dd class="col-span-2 font-medium text-slate-800 dark:text-slate-100">{{ formatDate(detailRow.date_transact || detailRow.expense_date) }}</dd>

          <dt class="text-slate-500 dark:text-slate-400 dark:text-slate-500">Amount</dt>
          <dd class="col-span-2 font-mono text-lg font-black"
              :class="isVoided(detailRow) ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-slate-900 dark:text-slate-100'">
            {{ money(detailRow.amount) }}
          </dd>

          <dt class="text-slate-500 dark:text-slate-400 dark:text-slate-500">Description</dt>
          <dd class="col-span-2 text-slate-800 dark:text-slate-100">{{ detailRow.description || '—' }}</dd>

          <dt v-if="detailRow.notes" class="text-slate-500 dark:text-slate-400 dark:text-slate-500">Notes</dt>
          <dd v-if="detailRow.notes" class="col-span-2 whitespace-pre-line text-slate-700 dark:text-slate-200">
            {{ detailRow.notes }}
          </dd>

          <dt class="text-slate-500 dark:text-slate-400 dark:text-slate-500">Recorded</dt>
          <dd class="col-span-2 text-slate-700 dark:text-slate-200">
            {{ formatDateTime(detailRow.created_at) }}
            <span v-if="detailRow.recorded_by_name || detailRow.created_by_name"
                  class="text-slate-500 dark:text-slate-400 dark:text-slate-500">
              · by {{ detailRow.recorded_by_name || detailRow.created_by_name }}
            </span>
          </dd>
        </dl>

        <div v-if="isVoided(detailRow)"
             class="rounded-md border border-rose-200 bg-rose-50 p-2.5 text-[12px] text-rose-800">
          <div class="mb-0.5 text-[9px] font-bold uppercase tracking-widest">Void</div>
          <div v-if="detailRow.voided_by_name">
            Authorized by <span class="font-semibold">{{ detailRow.voided_by_name }}</span>
          </div>
          <div v-if="detailRow.voided_reason">Reason: {{ detailRow.voided_reason }}</div>
          <div v-if="detailRow.voided_at" class="italic text-rose-600">
            {{ formatDateTime(detailRow.voided_at) }}
          </div>
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="closeDetails">Close</button>
        <button v-if="detailRow && !isVoided(detailRow) && canEditExpense"
                class="btn-primary"
                @click="openEdit(detailRow); closeDetails()">
          Edit
        </button>
        <button v-if="detailRow && !isVoided(detailRow) && canVoidExpense"
                class="btn-primary !bg-rose-600 hover:!bg-rose-700"
                @click="askVoid(detailRow); closeDetails()">
          Void
        </button>
      </template>
    </Modal>

    <!-- Void confirmation -->
    <Modal :show="showVoid" title="Void expense" size="sm" @close="cancelVoid">
      <div v-if="voidTarget" class="space-y-3">
        <p class="text-sm text-slate-700 dark:text-slate-200">
          Void
          <span class="font-semibold">{{ voidTarget.description || voidTarget.uuid?.slice(0, 8) }}</span>
          <span class="text-slate-500 dark:text-slate-400 dark:text-slate-500"> ({{ money(voidTarget.amount) }})</span>?
          The record stays in the list for audit but is excluded from totals.
        </p>
        <div>
          <label class="label">Reason</label>
          <textarea v-model="voidReason"
                    rows="2"
                    class="input"
                    :disabled="voidSubmitting"
                    placeholder="e.g. duplicate entry"
                    @keydown.enter.exact.prevent="confirmVoid"></textarea>
        </div>
        <div v-if="voidError"
             class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ voidError }}
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" :disabled="voidSubmitting" @click="cancelVoid">Cancel</button>
        <button class="btn-primary !bg-rose-600 hover:!bg-rose-700"
                :disabled="voidSubmitting"
                @click="confirmVoid">
          {{ voidSubmitting ? 'Voiding…' : 'Void expense' }}
        </button>
      </template>
    </Modal>

    <!-- Toast -->
    <transition name="fade">
      <div v-if="toast"
           class="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-lg"
           :class="toastTone === 'rose' ? 'bg-rose-600' : 'bg-emerald-600'">
        {{ toast }}
      </div>
    </transition>
  </div>
</template>
