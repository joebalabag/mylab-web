<script setup>
import { computed, onMounted, ref, watch, nextTick } from 'vue'
import { usePaymentsStore } from '../stores/payments'
import { useDiscountsStore } from '../stores/discounts'
import { useTenantStore } from '../stores/tenant'
import { useAuthStore } from '../stores/auth'
import Modal from '../components/Modal.vue'
import EmptyState from '../components/EmptyState.vue'
import SkeletonRows from '../components/SkeletonRows.vue'
import RowActionMenu from '../components/RowActionMenu.vue'
import MobileFilterBar from '../components/MobileFilterBar.vue'
import { money, formatDateTime } from '../utils/format'
import {
  PAYMENT_METHODS, PAYMENT_METHOD_LABELS,
  EWALLET_TYPES,
  isNonCashArrangement, isChanneledPayment, isSelfResolvingArrangement,
  viewPayment,
  resolveArrangement,
} from '../api/payments'
// listUnpaidCases / listUnpaidItems come from the store so they route
// through Dexie when the station is offline (server-side joined queries
// aren't reachable offline; the store rebuilds them from cached tables).

const payments  = usePaymentsStore()
const discounts = useDiscountsStore()
const tenant    = useTenantStore()
const auth      = useAuthStore()

const search        = ref('')
const methodFilter  = ref('')
const statusFilter  = ref('')
const listError     = ref('')
// Cashier tape defaults to today — a busy counter mostly wants "what happened
// today". Both blank = show all dates. Built from local Y/M/D so we don't
// accidentally roll into yesterday at midnight due to UTC offset.
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const dateFrom = ref(todayStr())
const dateTo   = ref(todayStr())
// Tab filter — 'all' shows everything, 'paid' shows cash/ewallet/bank (money
// actually collected), 'arrangements' shows deferred/waived payments that need
// (or needed) follow-up settlement. Applied client-side over payments.items.
const tabFilter = ref('all')

async function loadPayments() {
  listError.value = ''
  payments.setFilters({
    tenant_uuid: auth.tenantUuid || '',
    keywords: search.value.trim(),
    payment_method: methodFilter.value || '',
    status: statusFilter.value ? [statusFilter.value] : [],
    date_from: dateFrom.value || '',
    date_to: dateTo.value || ''
  })
  try {
    await payments.fetch()
  } catch (e) {
    listError.value = e?.message || 'Failed to load payments'
  }
}
async function loadDiscounts() {
  try { await discounts.fetch({ page_number: 0, page_size: 500 }) } catch (e) { /* non-fatal */ }
}
onMounted(async () => {
  await Promise.all([loadPayments(), loadDiscounts()])
})

function onSearchEnter()  { loadPayments() }
function onFilterChange() { loadPayments() }

const filtered = computed(() => {
  const src = payments.items
  if (tabFilter.value === 'paid') {
    return src.filter(p => !isNonCashArrangement(p.payment_method))
  }
  if (tabFilter.value === 'arrangements') {
    return src.filter(p => isNonCashArrangement(p.payment_method))
  }
  return src
})
const totalCount = computed(() => payments.total || payments.items.length)
const completedCount = computed(() => payments.items.filter(p => p.status === 'completed').length)
// Arrangements needing follow-up: non-cash methods that aren't yet resolved
// (charity self-resolves; voided records don't count).
const pendingArrangementCount = computed(() => payments.items.filter(p =>
  isNonCashArrangement(p.payment_method)
  && !isSelfResolvingArrangement(p.payment_method)
  && p.status !== 'voided'
  && !p.arrangement_resolved_at
).length)
// Sum of the currently-shown payments' Total column, excluding voided —
// void kills the settlement so it shouldn't count as revenue on the tape.
const paymentsTotal = computed(() =>
  filtered.value
    .filter(p => p.status === 'completed')
    .reduce((s, p) => s + Number(p.total || 0), 0)
)
const activeDiscounts = computed(() => discounts.items.filter(d => d.status === 'active'))

// ─── Toast ───
const toast = ref('')
const toastTone = ref('emerald')
let toastTimer = null
function flash(m, tone = 'emerald') {
  toast.value = m
  toastTone.value = tone
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.value = '', 3000)
}
function flashError(e, fallback) {
  flash(e?.message || fallback || 'Something went wrong', 'rose')
}

// ─── Formatters ───
function fullPatientName(row) {
  if (!row) return ''
  const parts = [row.first_name || row.patient_first_name,
                 row.middle_name || row.patient_middle_name,
                 row.last_name || row.patient_last_name]
  const joined = parts.filter(Boolean).join(' ')
  const suffix = row.suffix || row.patient_suffix
  return suffix ? `${joined} ${suffix}` : joined
}
function ageFromBirthdate(bd) {
  if (!bd) return null
  const d = new Date(String(bd).replace(' ', 'T'))
  if (isNaN(d.getTime())) return null
  const now = new Date()
  let a = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--
  return a
}

// ═══════════════════════════════════════════════════════════════════════════
// NEW PAYMENT — step 1: search for a case with unpaid items
// ═══════════════════════════════════════════════════════════════════════════
const showCaseSearch = ref(false)
const caseSearchKw = ref('')
const caseResults = ref([])
const caseSearchLoading = ref(false)
const caseSearchError = ref('')

function openNewPaymentFlow() {
  caseSearchKw.value = ''
  caseResults.value = []
  caseSearchError.value = ''
  showCaseSearch.value = true
  // Preload the full list of unpaid cases so the operator sees something
  // immediately without having to type first.
  runCaseSearch()
}
async function runCaseSearch() {
  caseSearchLoading.value = true
  caseSearchError.value = ''
  try {
    const rows = await payments.listUnpaidCases({ keywords: caseSearchKw.value.trim() || undefined })
    caseResults.value = Array.isArray(rows) ? rows : []
  } catch (e) {
    caseSearchError.value = e?.message || 'Search failed'
  } finally {
    caseSearchLoading.value = false
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// NEW PAYMENT — step 2: item checklist + discount + method + confirm
// ═══════════════════════════════════════════════════════════════════════════
const showPaymentForm = ref(false)
const paymentCase = ref(null)          // { case_uuid, case_number, patient_number, first/last_name, ... }
const paymentItems = ref([])           // { ...requisition_item, _selected: true }
const paymentItemsLoading = ref(false)
const paymentForm = ref({
  discount_uuid: '',
  discount_open_amount: 0,
  payment_method: 'cash',
  amount_tendered: 0,
  channel: '',    // ewallet provider (GCash, Maya…) or bank name (BDO, BPI…)
  reference: '',  // transaction / OR # / PO #
  billed_to: '',  // arrangements only — who's on the hook
  notes: '',
})
const paymentError = ref('')
const paymentSubmitting = ref(false)

async function selectCaseForPayment(kase) {
  paymentCase.value = kase
  paymentItems.value = []
  paymentForm.value = {
    discount_uuid: '',
    discount_open_amount: 0,
    payment_method: 'cash',
    amount_tendered: 0,
    channel: '',
    reference: '',
    billed_to: '',
    notes: '',
  }
  paymentError.value = ''
  showCaseSearch.value = false
  showPaymentForm.value = true

  paymentItemsLoading.value = true
  try {
    const rows = await payments.listUnpaidItems(kase.case_uuid)
    paymentItems.value = (Array.isArray(rows) ? rows : []).map((r) => ({
      ...r,
      _selected: true, // default all-in; operator unchecks to exclude
    }))
  } catch (e) {
    paymentError.value = e?.message || 'Failed to load unpaid items'
  } finally {
    paymentItemsLoading.value = false
  }
}

// Selected items — drive totals and the create payload.
const selectedPaymentItems = computed(() => paymentItems.value.filter(i => i._selected))
const paymentSubtotal = computed(() =>
  selectedPaymentItems.value.reduce((s, i) => s + Number(i.line_total || 0), 0)
)
// If no cashier-level discount picked, fall back to the sum of the requisition's
// quoted line discounts on the selected items. Otherwise compute from the
// selected discount snapshot (percent / fix / open_amount).
const selectedDiscount = computed(() =>
  activeDiscounts.value.find(d => d.uuid === paymentForm.value.discount_uuid) || null
)
const paymentDiscountAmount = computed(() => {
  const sub = paymentSubtotal.value
  if (sub <= 0) return 0
  if (selectedDiscount.value) {
    const d = selectedDiscount.value
    let raw = 0
    if (d.discount_type === 'percent') raw = sub * Number(d.value ?? 0) / 100
    else if (d.discount_type === 'fix') raw = Number(d.value ?? 0)
    else if (d.discount_type === 'open_amount') raw = Number(paymentForm.value.discount_open_amount || 0)
    if (raw < 0) raw = 0
    if (raw > sub) raw = sub
    return Math.round(raw * 100) / 100
  }
  // No override — sum quoted line discounts on selected items.
  return Math.round(
    selectedPaymentItems.value.reduce((s, i) => s + Number(i.line_discount_amount || 0), 0) * 100
  ) / 100
})
const paymentTotal = computed(() =>
  Math.max(0, Math.round((paymentSubtotal.value - paymentDiscountAmount.value) * 100) / 100)
)
const isCashPayment = computed(() => paymentForm.value.payment_method === 'cash')
// eWallet or bank transfer — needs a channel (provider/bank name) + reference.
const isChanneledForm = computed(() => isChanneledPayment(paymentForm.value.payment_method))
// True when the selected method is a non-collecting arrangement (A/R,
// insurance, paid outside, charity, other). These skip tendered/change and
// require billed_to.
const isArrangementPayment = computed(() => isNonCashArrangement(paymentForm.value.payment_method))
const changeAmount = computed(() => {
  if (!isCashPayment.value) return 0
  const t = Number(paymentForm.value.amount_tendered || 0)
  if (!Number.isFinite(t) || t <= 0) return 0
  return Math.max(0, Math.round((t - paymentTotal.value) * 100) / 100)
})

// Group selected items by requisition for display (matches how the requisition
// modal groups by package origin; here we group by parent requisition).
const itemsByRequisition = computed(() => {
  const groups = new Map()
  for (const it of paymentItems.value) {
    if (!groups.has(it.patient_requisition_uuid)) {
      groups.set(it.patient_requisition_uuid, {
        requisition_number: it.requisition_number,
        requisition_date: it.requisition_date,
        items: [],
      })
    }
    groups.get(it.patient_requisition_uuid).items.push(it)
  }
  return Array.from(groups.entries()).map(([uuid, g]) => ({ uuid, ...g }))
})

// Toggles for the checklist.
function toggleAllItems(v) { paymentItems.value.forEach(i => i._selected = v) }
function isAllSelected() { return paymentItems.value.length > 0 && paymentItems.value.every(i => i._selected) }
function isNoneSelected() { return paymentItems.value.every(i => !i._selected) }

// ─── Confirm-and-create dialog ───
const showConfirm = ref(false)
function askCreatePayment() {
  paymentError.value = ''
  if (!selectedPaymentItems.value.length) {
    paymentError.value = 'Pick at least one item to pay.'
    return
  }
  if (paymentForm.value.payment_method === 'cash') {
    const t = Number(paymentForm.value.amount_tendered || 0)
    if (t < paymentTotal.value) {
      paymentError.value = `Tendered amount (${money(t)}) is less than the total (${money(paymentTotal.value)}).`
      return
    }
  }
  if (paymentForm.value.payment_method === 'accounts_receivable'
      && !paymentForm.value.billed_to.trim()) {
    paymentError.value = 'A/R needs a Billed To (company or guarantor name).'
    return
  }
  if (isChanneledForm.value && !paymentForm.value.channel.trim()) {
    paymentError.value = paymentForm.value.payment_method === 'ewallet'
      ? 'Pick an eWallet provider.'
      : 'Enter the bank name.'
    return
  }
  if (selectedDiscount.value?.discount_type === 'open_amount'
      && Number(paymentForm.value.discount_open_amount || 0) <= 0) {
    paymentError.value = 'Enter a discount amount for the open-amount discount.'
    return
  }
  showConfirm.value = true
}
async function doCreatePayment() {
  showConfirm.value = false
  paymentSubmitting.value = true
  try {
    const payload = {
      tenant_uuid: auth.tenantUuid || undefined,
      patient_case_uuid: paymentCase.value.case_uuid,
      items: selectedPaymentItems.value.map(i => ({
        patient_requisition_item_uuid: i.uuid,
      })),
      discount_uuid: paymentForm.value.discount_uuid || undefined,
      discount_open_amount: selectedDiscount.value?.discount_type === 'open_amount'
        ? Number(paymentForm.value.discount_open_amount || 0)
        : undefined,
      payment_method: paymentForm.value.payment_method,
      amount_tendered: isCashPayment.value ? Number(paymentForm.value.amount_tendered || 0) : undefined,
      channel: isChanneledForm.value ? (paymentForm.value.channel.trim() || undefined) : undefined,
      reference: (isChanneledForm.value || isArrangementPayment.value)
        ? (paymentForm.value.reference.trim() || undefined) : undefined,
      billed_to: isArrangementPayment.value ? (paymentForm.value.billed_to.trim() || undefined) : undefined,
      notes: paymentForm.value.notes.trim() || undefined,
    }
    const created = await payments.create(payload)
    flash(`Payment ${created?.payment_number} created`)
    showPaymentForm.value = false
    await loadPayments()
    if (created?.uuid) openReceipt(created)
  } catch (e) {
    paymentError.value = e?.message || 'Failed to create payment'
  } finally {
    paymentSubmitting.value = false
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// RECEIPT MODAL — half short bond print stylesheet
// ═══════════════════════════════════════════════════════════════════════════
const showReceipt = ref(false)
const receipt = ref(null)
const receiptLoading = ref(false)
// Header lines pulled from Company Settings › Cashier Receipt Header. Split
// on newlines and trim outer blank lines; empty middle lines stay so users
// can space the block. When empty, the receipt falls back to auto-generated
// company-name/address rows.
const receiptHeaderLines = computed(() => {
  const raw = tenant.current?.receiptHeader
  if (!raw) return []
  const lines = String(raw).replace(/\r\n/g, '\n').split('\n').map(s => s.trim())
  while (lines.length && lines[0] === '') lines.shift()
  while (lines.length && lines[lines.length - 1] === '') lines.pop()
  return lines
})
async function openReceipt(paymentRowOrUuid) {
  const uuid = typeof paymentRowOrUuid === 'string' ? paymentRowOrUuid : paymentRowOrUuid.uuid
  showReceipt.value = true
  receipt.value = null
  receiptLoading.value = true
  try {
    receipt.value = await viewPayment(uuid)
  } catch (e) {
    flashError(e, 'Failed to load receipt')
  } finally {
    receiptLoading.value = false
  }
}
function closeReceipt() {
  showReceipt.value = false
  receipt.value = null
}
function printReceipt() {
  // Add a body flag so the @media print rules (see <style> at the bottom of
  // this file) know they should apply. The rules are scoped to
  // `body.printing-receipt` on purpose — the previous unscoped `body *`
  // visibility hack leaked into any other print flow that shared the app's
  // stylesheets, most notably the LaboratoryView / TestItemsView print
  // popup, which came out white because everything got hidden.
  if (typeof document !== 'undefined') {
    document.body.classList.add('printing-receipt')
    const clear = () => {
      document.body.classList.remove('printing-receipt')
      window.removeEventListener('afterprint', clear)
    }
    window.addEventListener('afterprint', clear)
    // Safety net — some browsers skip afterprint on cancel.
    setTimeout(clear, 30000)
  }
  nextTick(() => window.print())
}

// ─── Void ─── Requires manager/admin re-auth. The cashier's own session
// is never enough on its own; a supervisor has to type their credentials
// into the modal so the void carries their name in the audit trail.
const voidModal = ref({ show: false, payment: null })
const voidForm = ref({ username: '', password: '' })
const voidError = ref('')
const voidSubmitting = ref(false)
function askVoid(p) {
  voidModal.value = { show: true, payment: p }
  voidForm.value = { username: '', password: '' }
  voidError.value = ''
}
function closeVoidModal() {
  voidModal.value = { show: false, payment: null }
  voidForm.value = { username: '', password: '' }
  voidError.value = ''
}
async function doVoid() {
  voidError.value = ''
  const u = voidForm.value.username.trim()
  const pw = voidForm.value.password
  if (!u || !pw) {
    voidError.value = 'Enter a manager username and password.'
    return
  }
  const p = voidModal.value.payment
  voidSubmitting.value = true
  try {
    // Manager re-auth first — POST /auth/verify-manager. Returns { ok, user }.
    // The verified user must be an admin/manager of the same tenant.
    const check = await auth.verifyManager(u, pw)
    if (!check.ok) {
      voidError.value = check.message || 'Manager verification failed.'
      return
    }
    // Only after the override succeeds do we call the void endpoint.
    await payments.voidPayment(p.uuid)
    flash(`${p.payment_number} voided by ${check.user?.name || check.user?.username}`)
    closeVoidModal()
    await loadPayments()
  } catch (e) {
    voidError.value = e?.message || 'Failed to void payment'
  } finally {
    voidSubmitting.value = false
  }
}

// ─── Fine-grained access checks ──────────────────────────────────────
// The coarse `cashier / all-access` grant was retired in favour of the
// per-action rows 210-213. Every mutating action checks its specific
// sub_navigation; the read-only receipt view is always available to any
// user who can reach this page (router already gates on main_navigation).
const canNewPayment  = computed(() => auth.canDo('cashier', 'new payment'))
const canVoid        = computed(() => auth.canDo('cashier', 'void'))
const canResolve     = computed(() => auth.canDo('cashier', 'resolve arrangement'))

function actionsFor(p) {
  const isPendingArrangement = isNonCashArrangement(p.payment_method)
    && !isSelfResolvingArrangement(p.payment_method)
    && p.status === 'completed'
    && !p.arrangement_resolved_at
  return [
    { label: 'View / Reprint receipt', icon: 'eye', onClick: () => openReceipt(p) },
    ...(isPendingArrangement && canResolve.value
      ? [{ divider: true }, { label: 'Resolve arrangement', icon: 'check', onClick: () => openResolve(p) }]
      : []),
    ...(p.status === 'completed' && canVoid.value
      ? [{ divider: true }, { label: 'Void payment', icon: 'trash', variant: 'danger', onClick: () => askVoid(p) }]
      : []),
  ]
}

// ─── Resolve arrangement ───
const showResolve = ref(false)
const resolveTarget = ref(null)
const resolveForm = ref({
  resolved_method: 'cash',
  resolved_channel: '',
  resolved_reference: '',
  resolved_notes: '',
})
const resolveError = ref('')
const resolveSubmitting = ref(false)
const resolveIsChanneled = computed(() => isChanneledPayment(resolveForm.value.resolved_method))
function openResolve(p) {
  resolveTarget.value = p
  resolveForm.value = {
    resolved_method: 'cash',
    resolved_channel: '',
    resolved_reference: '',
    resolved_notes: '',
  }
  resolveError.value = ''
  showResolve.value = true
}
async function submitResolve() {
  resolveError.value = ''
  if (resolveIsChanneled.value && !resolveForm.value.resolved_channel.trim()) {
    resolveError.value = resolveForm.value.resolved_method === 'ewallet'
      ? 'Pick an eWallet provider.'
      : 'Enter the bank name.'
    return
  }
  resolveSubmitting.value = true
  try {
    await resolveArrangement(resolveTarget.value.uuid, {
      resolved_method: resolveForm.value.resolved_method,
      resolved_channel: resolveIsChanneled.value
        ? (resolveForm.value.resolved_channel.trim() || undefined)
        : undefined,
      resolved_reference: resolveForm.value.resolved_reference.trim() || undefined,
      resolved_notes: resolveForm.value.resolved_notes.trim() || undefined,
    })
    flash(`Marked ${resolveTarget.value.payment_number} as resolved`)
    showResolve.value = false
    await loadPayments()
  } catch (e) {
    resolveError.value = e?.message || 'Failed to resolve arrangement'
  } finally {
    resolveSubmitting.value = false
  }
}

function methodBadge(m) {
  switch (m) {
    case 'cash':                return 'bg-emerald-100 text-emerald-700'
    case 'ewallet':             return 'bg-sky-100 text-sky-700'
    case 'bank_transfer':       return 'bg-violet-100 text-violet-700'
    case 'insurance':           return 'bg-amber-100 text-amber-700'
    case 'accounts_receivable': return 'bg-rose-100 text-rose-700'
    case 'paid_outside':        return 'bg-teal-100 text-teal-700'
    case 'charity':             return 'bg-pink-100 text-pink-700'
    default:                    return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
  }
}
</script>

<template>
  <div class="flex h-full flex-col gap-4">
    <div class="grid grid-cols-2 gap-3 shrink-0">
      <div class="card"><div class="card-body">
        <div class="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Payments</div>
        <div class="mt-1 text-2xl font-bold">{{ totalCount }}</div>
      </div></div>
      <div class="card"><div class="card-body">
        <div class="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Completed</div>
        <div class="mt-1 text-2xl font-bold text-emerald-600">{{ completedCount }}</div>
      </div></div>
    </div>

    <div class="card flex flex-1 min-h-0 flex-col overflow-hidden">
      <div class="card-header">
        <div>
          <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">Cashier — Payments</div>
          <div class="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
            {{ filtered.length }} shown
            <span v-if="payments.loading" class="ml-1 text-brand-600">· loading…</span>
          </div>
        </div>
        <MobileFilterBar>
          <!-- Tab filter — split cash-in-hand from deferred/waived. Kept as
               segmented pills so both are one click away. -->
          <div class="inline-flex rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-0.5 text-xs">
            <button v-for="t in [
                      { k: 'all',          label: 'All' },
                      { k: 'paid',         label: 'Paid' },
                      { k: 'arrangements', label: 'Arrangements' }
                    ]" :key="t.k"
                    @click="tabFilter = t.k"
                    class="rounded px-2.5 py-1 font-semibold transition-colors"
                    :class="tabFilter === t.k
                            ? 'bg-white dark:bg-slate-900 text-brand-700 shadow-sm'
                            : 'text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-100'">
              {{ t.label }}
              <span v-if="t.k === 'arrangements' && pendingArrangementCount > 0"
                    class="ml-1 rounded-full bg-rose-100 px-1.5 text-[10px] font-bold text-rose-700">
                {{ pendingArrangementCount }}
              </span>
            </button>
          </div>
          <input v-model="search" @keyup.enter="onSearchEnter"
                 placeholder="Search PAY# / case / patient…" class="input w-full sm:w-64" />
          <!-- Date range — both default to today. Clearing both shows all dates;
               ✕ is a fast reset. -->
          <div class="flex items-center gap-1">
            <input type="date" v-model="dateFrom" @change="onFilterChange"
                   :max="dateTo || undefined"
                   title="From" class="input w-full sm:w-36" />
            <span class="text-xs text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">→</span>
            <input type="date" v-model="dateTo" @change="onFilterChange"
                   :min="dateFrom || undefined"
                   title="To" class="input w-full sm:w-36" />
            <button v-if="dateFrom || dateTo" type="button"
                    class="btn-ghost !px-2 !text-xs"
                    title="Clear date filter"
                    @click="dateFrom = ''; dateTo = ''; onFilterChange()">✕</button>
          </div>
          <select v-model="methodFilter" @change="onFilterChange" class="input w-full sm:w-40">
            <option value="">All methods</option>
            <option v-for="m in PAYMENT_METHODS" :key="m" :value="m">{{ PAYMENT_METHOD_LABELS[m] }}</option>
          </select>
          <select v-model="statusFilter" @change="onFilterChange" class="input w-full sm:w-36">
            <option value="">All status</option>
            <option value="completed">Completed</option>
            <option value="voided">Voided</option>
          </select>
          <button class="btn-secondary" @click="loadPayments" :disabled="payments.loading" title="Refresh">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
          </button>
          <template #action>
            <button v-if="canNewPayment" class="btn-primary" @click="openNewPaymentFlow">+ New Payment</button>
          </template>
        </MobileFilterBar>
      </div>

      <transition name="fade">
        <div v-if="toast"
             class="border-t px-4 py-2 text-sm"
             :class="toastTone === 'emerald'
                     ? 'border-emerald-100 bg-emerald-50 text-emerald-800'
                     : 'border-rose-100 bg-rose-50 text-rose-800'">
          {{ toast }}
        </div>
      </transition>

      <div v-if="listError" class="border-t border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        {{ listError }}
      </div>

      <div class="min-h-0 flex-1 overflow-auto">
        <SkeletonRows v-if="payments.loading && !payments.items.length"
                      :rows="8" label="Loading payments…"
                      :columns="['bar','lines','pill','bar','pill','dot']" />
        <table class="table" v-else-if="filtered.length">
          <thead class="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800 shadow-[inset_0_-1px_0_theme(colors.slate.100)]">
            <tr>
              <th class="w-32">PAY #</th>
              <th class="min-w-[16rem]">Patient / Case</th>
              <th>Method</th>
              <th class="text-right">Total</th>
              <th>Status</th>
              <th class="hidden md:table-cell">Date</th>
              <th class="hidden lg:table-cell">Transact By</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in filtered" :key="p.uuid" :class="p.status === 'voided' && 'bg-slate-50/50 dark:bg-slate-800/50'">
              <td class="font-mono text-xs font-semibold">
                <button type="button"
                        class="text-brand-600 hover:text-brand-800 hover:underline"
                        @click="openReceipt(p)"
                        :title="`View ${p.payment_number}`">{{ p.payment_number }}</button>
              </td>
              <td>
                <div class="font-medium text-slate-800 dark:text-slate-100">{{ fullPatientName(p) }}</div>
                <div class="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
                  <span class="font-mono">{{ p.patient_case_number || '—' }}</span>
                  <span v-if="p.patient_case_type" class="ml-1 rounded bg-slate-100 dark:bg-slate-800 px-1 text-[9px] font-bold uppercase">{{ p.patient_case_type }}</span>
                </div>
              </td>
              <td class="whitespace-nowrap">
                <!-- Method + inline resolution badge on one line. Reference # is
                     moved to the badge's tooltip so the cell stays scannable. -->
                <div class="flex items-center gap-1">
                  <span class="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                        :class="methodBadge(p.payment_method)"
                        :title="p.reference ? `Ref: ${p.reference}` : undefined">
                    {{ PAYMENT_METHOD_LABELS[p.payment_method] || p.payment_method }}
                  </span>
                  <span v-if="p.channel" class="text-[10px] font-semibold text-slate-600 dark:text-slate-300">· {{ p.channel }}</span>
                  <!-- Arrangement resolution badge: green = settled, amber = pending.
                       Charity is treated as auto-resolved so we don't nag ops to click through. -->
                  <template v-if="isNonCashArrangement(p.payment_method) && p.status !== 'voided'">
                    <span v-if="p.arrangement_resolved_at"
                          class="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-700">
                      Resolved
                    </span>
                    <span v-else-if="!isSelfResolvingArrangement(p.payment_method)"
                          class="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700">
                      Pending
                    </span>
                  </template>
                </div>
                <div v-if="p.billed_to" class="mt-0.5 text-[11px] text-slate-600 dark:text-slate-300">
                  <span class="text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">to</span> {{ p.billed_to }}
                </div>
              </td>
              <td class="text-right font-semibold" :class="p.status === 'voided' && 'text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 line-through'">
                {{ money(p.total) }}
              </td>
              <td>
                <span class="badge" :class="p.status === 'completed' ? 'badge-success' : 'badge-danger'">
                  <span class="mr-1 inline-block h-1.5 w-1.5 rounded-full"
                        :class="p.status === 'completed' ? 'bg-emerald-500' : 'bg-rose-500'"></span>
                  {{ p.status }}
                </span>
              </td>
              <td class="hidden md:table-cell text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">{{ formatDateTime(p.payment_date) }}</td>
              <td class="hidden lg:table-cell text-xs text-slate-700 dark:text-slate-200">
                <div>{{ p.created_by || '—' }}</div>
                <!-- Void audit: show who voided the payment, if any -->
                <div v-if="p.status === 'voided' && p.updated_by && p.updated_by !== p.created_by"
                     class="text-[10px] italic text-rose-500">voided by {{ p.updated_by }}</div>
              </td>
              <td class="text-right">
                <RowActionMenu :actions="actionsFor(p)" />
              </td>
            </tr>
          </tbody>
        </table>
        <EmptyState v-else-if="!payments.loading" title="No payments yet" message="Settle a finalized requisition to record the first payment." />
      </div>
    </div>

    <!-- Running total for the currently-filtered rows. Pinned at the bottom
         of the screen (outside the list card) so it stays put no matter how
         the list scrolls. Voided rows are excluded from the sum. -->
    <div class="card shrink-0">
      <div class="card-body flex items-center justify-between py-2">
        <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
          Total ({{ filtered.filter(p => p.status === 'completed').length }} completed)
          <span class="ml-2 text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 italic normal-case tracking-normal">· Voided excluded</span>
        </div>
        <div class="text-lg font-bold text-brand-700 tabular-nums">{{ money(paymentsTotal) }}</div>
      </div>
    </div>

    <!-- ═══ Step 1: search for a case with unpaid items ═══ -->
    <Modal :show="showCaseSearch" title="New Payment — pick a case" size="lg" @close="showCaseSearch = false">
      <div class="space-y-3">
        <p class="text-xs text-slate-600 dark:text-slate-300">
          Only cases with at least one unpaid <b>finalized</b> requisition item appear here.
          If a case you expect is missing, finalize its requisition first.
        </p>
        <form @submit.prevent="runCaseSearch" class="flex items-center gap-2">
          <input v-model="caseSearchKw"
                 placeholder="Search case #, patient name, MRN…"
                 class="input flex-1" autofocus />
          <button type="submit" class="btn-secondary" :disabled="caseSearchLoading">
            {{ caseSearchLoading ? 'Searching…' : 'Search' }}
          </button>
        </form>
        <div v-if="caseSearchError" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ caseSearchError }}
        </div>
        <div class="h-80 overflow-auto rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <table class="w-full text-xs">
            <thead class="sticky top-0 bg-slate-100 dark:bg-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
              <tr>
                <th class="px-2 py-1.5 text-left">Case #</th>
                <th class="px-2 py-1.5 text-left">Patient</th>
                <th class="px-2 py-1.5 text-right">Unpaid items</th>
                <th class="px-2 py-1.5 text-right">Balance</th>
                <th class="px-2 py-1.5 text-right"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in caseResults" :key="c.case_uuid" class="border-t border-slate-100 dark:border-slate-800">
                <td class="px-2 py-1">
                  <span class="font-mono font-semibold text-slate-700 dark:text-slate-200">{{ c.case_number }}</span>
                  <div class="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">{{ c.case_type }}</div>
                </td>
                <td class="px-2 py-1">
                  <div class="text-slate-800 dark:text-slate-100">{{ fullPatientName(c) }}</div>
                  <div class="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 font-mono">{{ c.patient_number }}</div>
                </td>
                <td class="px-2 py-1 text-right">{{ c.unpaid_count }}</td>
                <td class="px-2 py-1 text-right font-semibold">{{ money(c.unpaid_total) }}</td>
                <td class="px-2 py-1 text-right">
                  <button type="button" class="btn-primary !py-0.5 !text-[11px]" @click="selectCaseForPayment(c)">
                    Settle
                  </button>
                </td>
              </tr>
              <tr v-if="!caseResults.length && !caseSearchLoading">
                <td colspan="5" class="px-2 py-3 text-center text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
                  No cases with unpaid finalized items.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="showCaseSearch = false">Cancel</button>
      </template>
    </Modal>

    <!-- ═══ Step 2: payment form ═══ -->
    <Modal :show="showPaymentForm" title="New Payment" size="xl" @close="showPaymentForm = false">
      <div v-if="paymentCase" class="space-y-4">
        <!-- Patient + case banner -->
        <div class="rounded-lg border border-brand-100 bg-brand-50/50 p-3">
          <div class="flex flex-wrap items-center gap-2">
            <span class="rounded bg-white dark:bg-slate-900 border border-brand-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-700 dark:text-slate-200">
              {{ paymentCase.case_number }}
            </span>
            <span class="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-mono text-[11px] text-slate-600 dark:text-slate-300">
              {{ paymentCase.patient_number }}
            </span>
          </div>
          <div class="mt-1 text-base font-bold text-slate-800 dark:text-slate-100">
            {{ fullPatientName(paymentCase) }}
            <span class="ml-1 rounded bg-brand-100 px-1 text-[10px] font-bold uppercase text-brand-700">{{ paymentCase.sex || '?' }}</span>
            <span v-if="ageFromBirthdate(paymentCase.birthdate) !== null" class="ml-1 text-xs text-slate-600 dark:text-slate-300">
              · {{ ageFromBirthdate(paymentCase.birthdate) }} y/o
            </span>
          </div>
        </div>

        <!-- ═══ POS split ═══════════════════════════════════════════════
             Two columns: full-height items list on the left (the cart),
             sticky totals/discount/method/tendered stack on the right (the
             cashier drawer). Mirrors a terminal POS layout so muscle memory
             from any cashier tool carries over. -->
        <div class="grid grid-cols-1 gap-3 lg:grid-cols-5">
          <!-- LEFT: items -->
          <div class="lg:col-span-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/70 p-3 flex flex-col">
            <div class="mb-2 flex items-center justify-between">
              <div class="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
                Unpaid Items ({{ paymentItems.length }})
                <span v-if="paymentItemsLoading" class="ml-1 text-brand-600">· loading…</span>
              </div>
              <div class="flex items-center gap-2">
                <button type="button" class="text-[11px] font-semibold text-brand-600 hover:underline"
                        :disabled="isAllSelected()" @click="toggleAllItems(true)">Select all</button>
                <button type="button" class="text-[11px] font-semibold text-rose-600 hover:underline"
                        :disabled="isNoneSelected()" @click="toggleAllItems(false)">Clear</button>
              </div>
            </div>

            <div class="h-[420px] overflow-auto rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
              <div v-if="!paymentItemsLoading && !paymentItems.length"
                   class="flex h-full items-center justify-center text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
                No unpaid items. Nothing to settle for this case.
              </div>
              <table v-else class="w-full text-xs">
                <thead class="sticky top-0 bg-slate-100 dark:bg-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
                  <tr>
                    <th class="w-8 px-2 py-1.5 text-left"></th>
                    <th class="px-2 py-1.5 text-left">Item</th>
                    <th class="w-14 px-2 py-1.5 text-right">Qty</th>
                    <th class="w-24 px-2 py-1.5 text-right">Price</th>
                    <th class="w-24 px-2 py-1.5 text-right">Discount</th>
                    <th class="w-24 px-2 py-1.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="g in itemsByRequisition" :key="g.uuid">
                    <tr class="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                      <td colspan="6" class="px-2 py-1">
                        <span class="font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-200">{{ g.requisition_number }}</span>
                        <span class="ml-2 text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">{{ formatDateTime(g.requisition_date) }}</span>
                      </td>
                    </tr>
                    <!-- Excluded rows: pink tint + red left border; every
                         content cell strikes-through with dimmed text. -->
                    <tr v-for="it in g.items" :key="it.uuid"
                        class="border-t border-slate-100 dark:border-slate-800"
                        :class="!it._selected && 'bg-rose-50/60 border-l-4 border-l-rose-400'">
                      <td class="px-2 py-1 text-center">
                        <input type="checkbox" v-model="it._selected"
                               class="h-4 w-4"
                               :title="it._selected ? 'Exclude from payment' : 'Include in payment'" />
                      </td>
                      <td class="px-2 py-1" :class="!it._selected && 'line-through'">
                        <span class="font-mono font-semibold"
                              :class="it._selected ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500'">{{ it.code }}</span>
                        <span class="ml-1" :class="it._selected ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500'">{{ it.name }}</span>
                        <div v-if="it.package_code"
                             class="text-[10px]"
                             :class="it._selected ? 'text-amber-700' : 'text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500'">
                          via package {{ it.package_code }}
                        </div>
                      </td>
                      <td class="px-2 py-1 text-right"
                          :class="!it._selected && 'line-through text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500'">
                        {{ it.quantity }}
                      </td>
                      <td class="px-2 py-1 text-right"
                          :class="!it._selected && 'line-through text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500'">
                        {{ money(it.unit_price) }}
                      </td>
                      <td class="px-2 py-1 text-right"
                          :class="it._selected ? 'text-emerald-700' : 'text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 line-through'">
                        <span v-if="Number(it.line_discount_amount) > 0">− {{ money(it.line_discount_amount) }}</span>
                        <span v-else class="text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">—</span>
                      </td>
                      <td class="px-2 py-1 text-right font-semibold"
                          :class="!it._selected && 'line-through text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500'">
                        {{ money(it.line_total) }}
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>

            <div class="mt-2">
              <label class="label !text-[10px] !mb-1">Notes</label>
              <input v-model="paymentForm.notes" maxlength="2000" class="input !py-1 !text-xs" placeholder="Optional" />
            </div>
          </div>

          <!-- RIGHT: cashier drawer — totals, discount, method, tendered/change -->
          <div class="lg:col-span-2 rounded-lg border border-brand-200 bg-brand-50/40 p-3 flex flex-col gap-2">
            <!-- Subtotal + discount override -->
            <div class="flex items-center justify-between text-sm">
              <span class="text-slate-600 dark:text-slate-300">Subtotal</span>
              <span class="font-semibold text-slate-800 dark:text-slate-100">{{ money(paymentSubtotal) }}</span>
            </div>

            <div class="rounded-md border border-brand-100 bg-white/70 dark:bg-slate-900/70 px-2 py-1.5">
              <div class="flex items-center gap-2">
                <span class="whitespace-nowrap text-[10px] font-bold uppercase tracking-widest text-brand-700">
                  Discount
                </span>
                <select v-model="paymentForm.discount_uuid" class="input !py-1 !text-xs flex-1">
                  <option value="">Keep quoted line discounts</option>
                  <option v-for="d in activeDiscounts" :key="d.uuid" :value="d.uuid">
                    {{ d.code }} · {{ d.name }}
                    <template v-if="d.discount_type === 'percent'"> ({{ Number(d.value) }}%)</template>
                    <template v-else-if="d.discount_type === 'fix'"> ({{ money(d.value) }})</template>
                    <template v-else-if="d.discount_type === 'open_amount'"> (open)</template>
                  </option>
                </select>
                <span class="whitespace-nowrap font-semibold text-emerald-700 text-sm">
                  − {{ money(paymentDiscountAmount) }}
                </span>
              </div>
              <div v-if="selectedDiscount && selectedDiscount.discount_type === 'open_amount'"
                   class="mt-2 flex items-center gap-2">
                <span class="text-[10px] uppercase text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 tracking-widest">Amount</span>
                <input type="number" min="0" step="0.01"
                       v-model.number="paymentForm.discount_open_amount"
                       placeholder="0.00"
                       class="input !py-1 !text-xs text-right flex-1" />
              </div>
            </div>

            <!-- Total Due — the biggest thing in the drawer -->
            <div class="rounded-lg bg-brand-600 px-3 py-3 text-white">
              <div class="flex items-center justify-between">
                <span class="text-[11px] font-bold uppercase tracking-widest text-brand-100">Total Due</span>
                <span class="text-3xl font-extrabold tabular-nums">{{ money(paymentTotal) }}</span>
              </div>
            </div>

            <!-- Payment method -->
            <div>
              <label class="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Payment Method</label>
              <select v-model="paymentForm.payment_method" class="input mt-1">
                <option v-for="m in PAYMENT_METHODS" :key="m" :value="m">{{ PAYMENT_METHOD_LABELS[m] }}</option>
              </select>
            </div>

            <!-- Cash: big tendered input + big emerald change -->
            <template v-if="isCashPayment">
              <div>
                <label class="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Amount Tendered</label>
                <input type="number" min="0" step="0.01"
                       v-model.number="paymentForm.amount_tendered"
                       placeholder="0.00"
                       class="input mt-1 text-right text-3xl font-extrabold text-slate-800 dark:text-slate-100 tabular-nums !py-2" />
              </div>
              <div class="rounded-lg bg-emerald-500 px-3 py-3 text-white">
                <div class="flex items-center justify-between">
                  <span class="text-[11px] font-bold uppercase tracking-widest text-emerald-50">Change</span>
                  <span class="text-3xl font-extrabold tabular-nums">{{ money(changeAmount) }}</span>
                </div>
              </div>
            </template>

            <!-- eWallet or Bank Transfer: capture provider/bank + reference #.
                 Money still counts as collected — this is just proof-of-payment. -->
            <template v-if="isChanneledForm">
              <div>
                <label class="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
                  {{ paymentForm.payment_method === 'ewallet' ? 'eWallet Provider' : 'Bank' }}
                  <span class="text-rose-500">*</span>
                </label>
                <select v-if="paymentForm.payment_method === 'ewallet'"
                        v-model="paymentForm.channel" class="input mt-1">
                  <option value="">Pick a provider…</option>
                  <option v-for="w in EWALLET_TYPES" :key="w" :value="w">{{ w }}</option>
                </select>
                <input v-else v-model="paymentForm.channel" maxlength="100"
                       placeholder="BDO, BPI, Metrobank…" class="input mt-1" />
              </div>
              <div>
                <label class="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Reference Number</label>
                <input v-model="paymentForm.reference" maxlength="255"
                       placeholder="Transaction / OR / Confirmation #"
                       class="input mt-1 font-mono !text-xs" />
              </div>
            </template>

            <!-- Non-cash arrangement: capture who's being billed + a reference.
                 No cash changes hands at the counter; the requisition is still
                 unlocked so downstream (specimen collection, etc.) can proceed. -->
            <template v-if="isArrangementPayment">
              <div>
                <label class="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
                  Billed To
                  <span v-if="paymentForm.payment_method === 'accounts_receivable'" class="text-rose-500">*</span>
                </label>
                <input v-model="paymentForm.billed_to" maxlength="255"
                       :placeholder="paymentForm.payment_method === 'accounts_receivable'
                                     ? 'Company or guarantor name'
                                     : (paymentForm.payment_method === 'paid_outside'
                                        ? 'Where paid (e.g. corporate portal)'
                                        : 'Beneficiary / program (optional)')"
                       class="input mt-1" />
              </div>
              <div>
                <label class="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Reference</label>
                <input v-model="paymentForm.reference" maxlength="255"
                       placeholder="PO #, OR #, transaction ID… (optional)"
                       class="input mt-1 font-mono !text-xs" />
              </div>
              <div class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                No cash collected here — the items will be marked settled so the
                requisition can proceed. Remember to collect / follow up on
                {{ PAYMENT_METHOD_LABELS[paymentForm.payment_method] }} separately.
              </div>
            </template>
          </div>
        </div>

        <div v-if="paymentError" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ paymentError }}
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" :disabled="paymentSubmitting" @click="showPaymentForm = false">Cancel</button>
        <button class="btn-primary" :disabled="paymentSubmitting" @click="askCreatePayment">
          {{ paymentSubmitting ? 'Processing…' : 'Confirm Payment' }}
        </button>
      </template>
    </Modal>

    <!-- Confirm-and-create dialog -->
    <Modal :show="showConfirm" title="Confirm payment?" size="sm" @close="showConfirm = false">
      <div class="space-y-2 text-sm">
        <p>Settle <b>{{ selectedPaymentItems.length }}</b> item(s) on
          <b>{{ paymentCase?.case_number }}</b>
          for <b>{{ fullPatientName(paymentCase) }}</b>?
        </p>
        <div class="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2 text-xs">
          <div class="flex items-center justify-between">
            <span class="text-slate-600 dark:text-slate-300">Method</span>
            <span class="font-semibold">{{ PAYMENT_METHOD_LABELS[paymentForm.payment_method] }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-slate-600 dark:text-slate-300">Subtotal</span>
            <span>{{ money(paymentSubtotal) }}</span>
          </div>
          <div class="flex items-center justify-between text-emerald-700">
            <span class="text-slate-600 dark:text-slate-300">Discount</span>
            <span>− {{ money(paymentDiscountAmount) }}</span>
          </div>
          <div class="mt-1 flex items-center justify-between border-t border-slate-200 dark:border-slate-700 pt-1">
            <span class="text-xs font-bold uppercase tracking-widest text-brand-700">Total</span>
            <span class="text-base font-bold text-brand-700">{{ money(paymentTotal) }}</span>
          </div>
          <div v-if="isCashPayment" class="mt-1 flex items-center justify-between">
            <span class="text-slate-600 dark:text-slate-300">Tendered / Change</span>
            <span>{{ money(paymentForm.amount_tendered) }} / <b>{{ money(changeAmount) }}</b></span>
          </div>
          <template v-if="isChanneledForm">
            <div v-if="paymentForm.channel" class="mt-1 flex items-center justify-between">
              <span class="text-slate-600 dark:text-slate-300">{{ paymentForm.payment_method === 'ewallet' ? 'eWallet' : 'Bank' }}</span>
              <span class="font-semibold">{{ paymentForm.channel }}</span>
            </div>
            <div v-if="paymentForm.reference" class="flex items-center justify-between">
              <span class="text-slate-600 dark:text-slate-300">Reference</span>
              <span class="font-mono">{{ paymentForm.reference }}</span>
            </div>
          </template>
          <template v-if="isArrangementPayment">
            <div v-if="paymentForm.billed_to" class="mt-1 flex items-center justify-between">
              <span class="text-slate-600 dark:text-slate-300">Billed to</span>
              <span class="font-semibold">{{ paymentForm.billed_to }}</span>
            </div>
            <div v-if="paymentForm.reference" class="flex items-center justify-between">
              <span class="text-slate-600 dark:text-slate-300">Reference</span>
              <span class="font-mono">{{ paymentForm.reference }}</span>
            </div>
          </template>
        </div>
        <p class="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Selected items will be marked <b>settled</b>. Receipt opens for print after confirming.</p>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="showConfirm = false">Cancel</button>
        <button class="btn-primary" @click="doCreatePayment">Confirm &amp; Create</button>
      </template>
    </Modal>

    <!-- Receipt modal — its inner .receipt-sheet is the only thing printed
         (see the @media print rules below). Layout mimics a printed
         spreadsheet: 6-column grid, dashed section separators, values in
         navy. -->
    <Modal :show="showReceipt" title="Receipt" size="lg" @close="closeReceipt">
      <div v-if="receiptLoading" class="p-6 text-center text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Loading receipt…</div>
      <div v-else-if="receipt" class="receipt-sheet mx-auto max-w-2xl bg-white dark:bg-slate-900 p-2 text-[12px] leading-tight text-slate-900 dark:text-slate-100">
        <table class="receipt-grid w-full border-collapse">
          <tbody>
            <!-- Header: custom lines from Company Settings › Cashier Receipt Header,
                 or an auto-generated fallback (company name + address). -->
            <template v-if="receiptHeaderLines.length">
              <tr v-for="(line, i) in receiptHeaderLines" :key="'hdr' + i">
                <td colspan="6" class="text-center" :class="i === 0 && 'font-semibold'">
                  {{ line || ' ' }}
                </td>
              </tr>
            </template>
            <template v-else>
              <tr>
                <td colspan="6" class="text-center font-semibold">{{ tenant.current?.name || tenant.name || 'COMPANY NAME' }}</td>
              </tr>
              <tr>
                <td colspan="6" class="text-center">
                  {{ [tenant.current?.address1, tenant.current?.city, tenant.current?.province].filter(Boolean).join(', ') || 'Address' }}
                </td>
              </tr>
            </template>

            <!-- Dashed separator row -->
            <tr class="dash-top"><td colspan="6" class="p-0 h-0"></td></tr>

            <!-- Payment slip # + date -->
            <tr>
              <td>Payment Slip</td>
              <td colspan="3" class="text-navy">{{ receipt.payment_number }}</td>
              <td>Date</td>
              <td class="text-right text-navy">{{ formatDateTime(receipt.payment_date) }}</td>
            </tr>
            <!-- Payee -->
            <tr>
              <td>Payee</td>
              <td colspan="5" class="text-navy">{{ fullPatientName(receipt) }}</td>
            </tr>

            <!-- Particulars section header -->
            <tr>
              <td colspan="6" class="text-center font-semibold">Particulars</td>
            </tr>

            <!-- Item columns header -->
            <tr class="border-b border-slate-500">
              <td colspan="5" class="font-semibold">Item</td>
              <td class="text-right font-semibold">Amount</td>
            </tr>

            <!-- Item rows -->
            <tr v-for="it in receipt.items || []" :key="it.uuid" class="align-top">
              <td colspan="5">
                {{ it.code }} · {{ it.name }}
                <span v-if="Number(it.quantity) !== 1">× {{ it.quantity }}</span>
                <span v-if="it.package_code" class="text-[10px] italic"> (via {{ it.package_code }})</span>
              </td>
              <td class="text-right">{{ money(it.line_selling_price) }}</td>
            </tr>
            <!-- Dashed separator row -->
            <tr class="dash-top"><td colspan="6" class="p-0 h-0"></td></tr>

            <!-- Discount + Sub Total -->
            <tr>
              <td></td>
              <td>Discount</td>
              <td></td>
              <td class="text-right text-navy">{{ money(receipt.discount_amount || 0) }}</td>
              <td>Sub Total</td>
              <td class="text-right text-navy">{{ money(receipt.subtotal) }}</td>
            </tr>
            <!-- Payment Method + Due -->
            <tr>
              <td></td>
              <td>Payment Method</td>
              <td></td>
              <td class="text-right">{{ PAYMENT_METHOD_LABELS[receipt.payment_method] || receipt.payment_method }}</td>
              <td>Due</td>
              <td class="text-right">{{ money(receipt.total) }}</td>
            </tr>
            <!-- Tendered + Change (cash only) -->
            <tr v-if="receipt.payment_method === 'cash' && receipt.amount_tendered != null">
              <td></td>
              <td>Tendered</td>
              <td></td>
              <td class="text-right text-navy">{{ money(receipt.amount_tendered) }}</td>
              <td>Change</td>
              <td class="text-right text-navy">{{ money(receipt.change_amount) }}</td>
            </tr>
            <!-- Channel + Reference (ewallet / bank_transfer) -->
            <tr v-if="isChanneledPayment(receipt.payment_method) && receipt.channel">
              <td></td>
              <td>{{ receipt.payment_method === 'ewallet' ? 'eWallet' : 'Bank' }}</td>
              <td colspan="4" class="text-navy">{{ receipt.channel }}</td>
            </tr>
            <tr v-if="isChanneledPayment(receipt.payment_method) && receipt.reference">
              <td></td>
              <td>Reference</td>
              <td colspan="4" class="text-navy">{{ receipt.reference }}</td>
            </tr>
            <!-- Billed To + Reference (non-cash arrangements) -->
            <tr v-if="isNonCashArrangement(receipt.payment_method) && receipt.billed_to">
              <td></td>
              <td>Billed To</td>
              <td colspan="4" class="text-navy">{{ receipt.billed_to }}</td>
            </tr>
            <tr v-if="isNonCashArrangement(receipt.payment_method) && receipt.reference">
              <td></td>
              <td>Reference</td>
              <td colspan="4" class="text-navy">{{ receipt.reference }}</td>
            </tr>

            <!-- Cashier + Printed Date footer -->
            <tr class="text-[10px]">
              <td>Cashier</td>
              <td class="text-navy">{{ receipt.created_by || auth.user?.name || '' }}</td>
              <td></td>
              <td class="text-right">Printed Date:</td>
              <td colspan="2" class="text-center text-navy">{{ formatDateTime(new Date()) }}</td>
            </tr>
          </tbody>
        </table>

        <div v-if="receipt.status === 'voided'"
             class="mt-2 rounded border-2 border-rose-500 py-1 text-center text-xs font-bold uppercase text-rose-600">
          Voided
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="closeReceipt">Close</button>
        <button class="btn-primary" @click="printReceipt">Print</button>
      </template>
    </Modal>

    <!-- Void modal — manager/admin re-auth required. Cashiers can't self-void.
         The verified supervisor's name lands on the payment as `updated_by`
         (visible in the Transact By column as "voided by …"). -->
    <Modal :show="voidModal.show" title="Void payment — manager approval" size="sm" @close="closeVoidModal">
      <div v-if="voidModal.payment" class="space-y-3 text-sm">
        <div class="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2 text-xs">
          <div class="flex justify-between">
            <span class="text-slate-600 dark:text-slate-300">Payment #</span>
            <span class="font-mono font-semibold">{{ voidModal.payment.payment_number }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-600 dark:text-slate-300">Amount</span>
            <span class="font-bold text-brand-700">{{ money(voidModal.payment.total) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-600 dark:text-slate-300">Recorded by</span>
            <span>{{ voidModal.payment.created_by || '—' }}</span>
          </div>
        </div>
        <p class="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
          Voiding will mark the items <b>unpaid</b> so they can be re-billed. A
          store <b>manager</b> or <b>admin</b> must approve.
        </p>
        <form @submit.prevent="doVoid" class="space-y-2">
          <div>
            <label class="label">Manager username</label>
            <input v-model="voidForm.username" autocomplete="off"
                   class="input" placeholder="Supervisor login" autofocus />
          </div>
          <div>
            <label class="label">Password</label>
            <input v-model="voidForm.password" type="password" autocomplete="current-password"
                   class="input" placeholder="••••••" />
          </div>
        </form>
        <div v-if="voidError" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {{ voidError }}
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" :disabled="voidSubmitting" @click="closeVoidModal">Cancel</button>
        <button class="btn-danger" :disabled="voidSubmitting" @click="doVoid">
          {{ voidSubmitting ? 'Verifying…' : 'Approve &amp; Void' }}
        </button>
      </template>
    </Modal>

    <!-- Resolve arrangement modal — mark A/R, insurance, paid-outside, or
         other deferred payment as actually settled. Captures the real
         method used so the audit trail shows how the money came in. -->
    <Modal :show="showResolve" title="Resolve arrangement" size="md"
           @close="showResolve = false">
      <div v-if="resolveTarget" class="space-y-3 text-sm">
        <div class="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2 text-xs">
          <div class="flex justify-between">
            <span class="text-slate-600 dark:text-slate-300">Payment #</span>
            <span class="font-mono font-semibold">{{ resolveTarget.payment_number }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-600 dark:text-slate-300">Method</span>
            <span class="font-semibold">{{ PAYMENT_METHOD_LABELS[resolveTarget.payment_method] }}</span>
          </div>
          <div v-if="resolveTarget.billed_to" class="flex justify-between">
            <span class="text-slate-600 dark:text-slate-300">Billed to</span>
            <span>{{ resolveTarget.billed_to }}</span>
          </div>
          <div class="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-1 mt-1">
            <span class="text-slate-600 dark:text-slate-300">Amount</span>
            <span class="font-bold text-brand-700">{{ money(resolveTarget.total) }}</span>
          </div>
        </div>

        <div>
          <label class="label">Settled with</label>
          <select v-model="resolveForm.resolved_method" class="input">
            <option value="cash">Cash</option>
            <option value="ewallet">eWallet</option>
            <option value="bank_transfer">Bank Transfer</option>
          </select>
        </div>

        <template v-if="resolveIsChanneled">
          <div>
            <label class="label">
              {{ resolveForm.resolved_method === 'ewallet' ? 'eWallet Provider' : 'Bank' }}
              <span class="text-rose-500">*</span>
            </label>
            <select v-if="resolveForm.resolved_method === 'ewallet'"
                    v-model="resolveForm.resolved_channel" class="input">
              <option value="">Pick a provider…</option>
              <option v-for="w in EWALLET_TYPES" :key="w" :value="w">{{ w }}</option>
            </select>
            <input v-else v-model="resolveForm.resolved_channel" maxlength="100"
                   placeholder="BDO, BPI, Metrobank…" class="input" />
          </div>
        </template>

        <div>
          <label class="label">Reference #</label>
          <input v-model="resolveForm.resolved_reference" maxlength="255"
                 placeholder="OR # / transaction ID (optional)"
                 class="input font-mono" />
        </div>

        <div>
          <label class="label">Notes</label>
          <input v-model="resolveForm.resolved_notes" maxlength="2000"
                 placeholder="Optional — e.g. cheque #, date received"
                 class="input" />
        </div>

        <div v-if="resolveError" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {{ resolveError }}
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" :disabled="resolveSubmitting" @click="showResolve = false">Cancel</button>
        <button class="btn-primary" :disabled="resolveSubmitting" @click="submitResolve">
          {{ resolveSubmitting ? 'Saving…' : 'Mark as resolved' }}
        </button>
      </template>
    </Modal>
  </div>
</template>

<style>
/* Receipt grid — spreadsheet-style layout for the printed slip.
   Dashed rows draw the section separators without adding a whole extra
   row height. */
.receipt-sheet { font-family: Calibri, Arial, sans-serif; }
.receipt-grid { table-layout: auto; }
.receipt-grid td {
  padding: 1px 4px;
  vertical-align: middle;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.receipt-grid, .receipt-grid * { color: #000 !important; }
.receipt-grid tr.dash-top td {
  border-top: 1px dashed #64748b;
  height: 0;
  line-height: 0;
  padding: 0;
}

/* ═══ Print stylesheet ═══
   Half short bond paper = 5.5" × 8.5". Hide everything except the receipt
   sheet so window.print() outputs a clean bill on that page size, anchored
   to the top-left of the page.

   Why position:fixed + inset:0 instead of position:absolute:
   The modal wrappers use `position:fixed / relative / transform` in their
   parent chain, which becomes a containing block for `position:absolute` and
   pulls the receipt into the middle of the page. `position:fixed` anchors
   to the viewport (the print page), sidestepping any ancestor's positioning
   context.

   The html/body resets kill body margins that would otherwise push the
   receipt down a hair. `page-break-inside:avoid` keeps the whole bill on
   one sheet if it fits. */
/* Receipt print rules — SCOPED to `body.printing-receipt` on purpose.
   This <style> block is unscoped (Vue's `scoped` attribute doesn't isolate
   `body`/`html` selectors), so it lives in the global app bundle. An
   unscoped `body * { visibility: hidden }` used to leak into every OTHER
   print flow in the app that shares the app bundle — including the
   LaboratoryView / TestItemsView / PatientsView print popup, which copies
   every <style> from the parent document into the popup and would then
   rasterize a blank white page for lab reports.
   printReceipt() toggles `body.printing-receipt` on before window.print()
   and clears it on afterprint, so these rules only apply when a receipt
   is actually being printed. The @page below is harmless in other popups
   because they inject their own @page inline AFTER copying our styles. */
@media print {
  body.printing-receipt {
    margin: 0 !important;
    padding: 0 !important;
    background: white !important;
  }
  body.printing-receipt * {
    visibility: hidden !important;
  }
  body.printing-receipt .receipt-sheet,
  body.printing-receipt .receipt-sheet * {
    visibility: visible !important;
  }
  body.printing-receipt .receipt-sheet {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    width: 100% !important;
    max-width: none !important;
    border: none !important;
    box-shadow: none !important;
    padding: 0 !important;
    margin: 0 !important;
    page-break-inside: avoid;
  }
  @page { size: 5.5in 8.5in; margin: 0.3in; }
}
</style>
