<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as paymentsApi from '../../api/tenantSubscriptionPayments'
import * as tenantsApi  from '../../api/tenants'
import * as aiExtractionApi from '../../api/aiExtraction'
import { usePlansStore } from '../../stores/plans'
import Modal from '../../components/Modal.vue'
import ConfirmDialog from '../../components/ConfirmDialog.vue'
import EmptyState from '../../components/EmptyState.vue'
import SkeletonRows from '../../components/SkeletonRows.vue'
import { assetUrl } from '../../api/client'
import { money, formatDate, formatDateTime } from '../../utils/format'

// Local calendar day — toISOString slices the UTC date, which shows
// yesterday's date after midnight in +08:00 timezones.
function _localISO(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function daysAgoISO(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return _localISO(d)
}
function todayISO() {
  return _localISO(new Date())
}

// Convert the API's ISO datetime (with tz offset) to the datetime-local input
// format ("YYYY-MM-DDTHH:mm"), interpreting in local time.
function toDatetimeLocal(iso) {
  if (!iso) return ''
  const d = new Date(String(iso))
  if (isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
         `T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Convert a datetime-local value ("YYYY-MM-DDTHH:mm") back to an ISO 8601
// string that includes seconds and the browser's local timezone offset.
function fromDatetimeLocal(local) {
  if (!local) return undefined
  const d = new Date(local)
  if (isNaN(d.getTime())) return undefined
  const pad = (n) => String(n).padStart(2, '0')
  const offsetMin = -d.getTimezoneOffset()
  const sign = offsetMin >= 0 ? '+' : '-'
  const absMin = Math.abs(offsetMin)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
         `T${pad(d.getHours())}:${pad(d.getMinutes())}:00` +
         `${sign}${pad(Math.floor(absMin / 60))}:${pad(absMin % 60)}`
}

const PAYMENT_METHODS = [
  { value: 'ewallet',       label: 'E-Wallet (GCash / Maya / PayPal)' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cash',          label: 'Cash / Over-the-counter' },
  { value: 'card',          label: 'Credit / Debit Card' },
  { value: 'other',         label: 'Other' }
]

/* ─── Tenant picker (shared for the history filter) ─── */
const tenants        = ref([])
const tenantsLoading = ref(false)
const tenantsError   = ref('')
async function loadTenants() {
  tenantsLoading.value = true
  tenantsError.value = ''
  try {
    const res = await tenantsApi.listTenants({ page_size: 500 })
    tenants.value = Array.isArray(res?.results) ? res.results : []
  } catch (e) {
    tenantsError.value = e?.message || 'Failed to load tenants'
  } finally {
    tenantsLoading.value = false
  }
}
const tenantsByUuid = computed(() => {
  const m = {}
  for (const t of tenants.value) m[t.uuid] = t
  return m
})
function tenantLabel(uuid) {
  const t = tenantsByUuid.value[uuid]
  if (!t) return uuid ? `Tenant ${String(uuid).slice(0, 8)}…` : '—'
  return t.display_name || t.store_code || uuid
}

/* ─── Subscription-plan picker (shared for the Record Payment modal) ─── */
const plans = usePlansStore()
const recordablePlans = computed(() =>
  plans.items.filter(p => {
    const active = p.status ? p.status === 'active' : p.active !== false
    return active && Number(p.price) > 0
  })
)

/* ─── Section 1 — All pending payments (across every tenant) ─── */
const pendingRows    = ref([])
const pendingLoading = ref(false)
// Auto-expand when there's data, auto-collapse when the list is empty.
// Manual toggles by the user stay in effect until the row count crosses zero.
const pendingOpen = ref(false)
watch(() => pendingRows.value.length, (n) => { pendingOpen.value = n > 0 }, { immediate: true })
const pendingError   = ref('')
async function loadPending() {
  pendingLoading.value = true
  pendingError.value = ''
  try {
    const res = await paymentsApi.listPayments({
      payment_status: 'pending',
      page_size: 200
    })
    pendingRows.value = Array.isArray(res?.results) ? res.results : []
  } catch (e) {
    pendingError.value = e?.message || 'Failed to load pending payments'
  } finally {
    pendingLoading.value = false
  }
}

/* ─── Section 2 — History with filters (defaults: last 30 days · all tenants · approved) ─── */
const tenantScope   = ref('all')             // 'all' | 'specific'
const tenantUuid    = ref('')
const statusFilter  = ref('approved')
const search        = ref('')
const dateFrom      = ref(daysAgoISO(30))
const dateTo        = ref(todayISO())

const historyRows    = ref([])
const historyLoading = ref(false)
const historyError   = ref('')
async function loadHistory() {
  historyLoading.value = true
  historyError.value = ''
  try {
    const filters = {
      payment_status: statusFilter.value || undefined,
      keywords:       search.value.trim() || undefined,
      date_from:      dateFrom.value || undefined,
      date_to:        dateTo.value || undefined,
      page_size:      200
    }
    if (tenantScope.value === 'specific') {
      if (!tenantUuid.value) {
        historyRows.value = []
        historyError.value = 'Pick a tenant to filter by.'
        return
      }
      filters.tenant_uuid = tenantUuid.value
    }
    const res = await paymentsApi.listPayments(filters)
    historyRows.value = Array.isArray(res?.results) ? res.results : []
  } catch (e) {
    historyError.value = e?.message || 'Failed to load payments'
  } finally {
    historyLoading.value = false
  }
}

onMounted(async () => {
  await loadTenants()
  // Plans are needed by the Record Payment modal. Best-effort — a failure here
  // only means the plan picker falls back to the "no plans available" message.
  plans.fetchAll({ status: ['active'] }).catch(() => {})
  await Promise.all([loadPending(), loadHistory()])
})

onBeforeUnmount(() => {
  if (recordFileUrl.value) URL.revokeObjectURL(recordFileUrl.value)
})

let searchTimer = null
watch(search, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(loadHistory, 300)
})
watch([statusFilter, dateFrom, dateTo], loadHistory)
watch(tenantScope, (v) => {
  if (v === 'all') tenantUuid.value = ''
  loadHistory()
})
watch(tenantUuid, () => {
  if (tenantScope.value === 'specific') loadHistory()
})

/* ─── Summary counts ─── */
const pendingCount = computed(() => pendingRows.value.length)
const historyCounts = computed(() => {
  const c = { total: historyRows.value.length, pending: 0, approved: 0, rejected: 0, amount: 0 }
  for (const p of historyRows.value) {
    if (p.payment_status === 'approved') { c.approved++; c.amount += Number(p.amount_paid) || 0 }
    else if (p.payment_status === 'rejected') c.rejected++
    else c.pending++
  }
  return c
})

/* ─── Toast ─── */
const flashMsg  = ref('')
const flashTone = ref('emerald')
let flashTimer = null
function flash(msg, tone = 'emerald') {
  flashMsg.value = msg
  flashTone.value = tone
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => (flashMsg.value = ''), 2500)
}

/* ─── Record Payment modal — admin logs an off-platform tenant payment ─── */
const recordShow     = ref(false)
const recordSaving   = ref(false)
const recordError    = ref('')

function emptyRecordForm() {
  return {
    tenant_uuid: '',
    subscription_plan_uuid: '',
    amount_paid: '',
    payment_reference_number: '',
    payee_account_number: '',
    payment_method: 'ewallet',
    payment_method_name: 'GCash',
    payment_datetime: toDatetimeLocal(new Date().toISOString())
  }
}
const recordForm = ref(emptyRecordForm())

// Receipt + AI extraction state. Mirrors the pattern in SubscriptionView.vue.
const recordFile              = ref(null)
const recordFileUrl           = ref('')
const recordExtractionBusy    = ref(false)
const recordExtractionMessage = ref('')
const recordExtractionTone    = ref('slate')  // 'emerald' | 'slate' | 'rose'
const recordExtractedFields   = ref([])
const recordExtractedFileUrl  = ref('')
const recordExtractionPayload = ref(null)

function openRecord() {
  recordForm.value = emptyRecordForm()
  recordError.value = ''
  discardRecordReceiptPick()
  recordShow.value = true
}
function closeRecord() {
  recordShow.value = false
  recordError.value = ''
  recordForm.value = emptyRecordForm()
  discardRecordReceiptPick()
}

async function runRecordExtraction(file) {
  recordExtractionBusy.value = true
  recordExtractionMessage.value = 'Reading receipt…'
  recordExtractionTone.value = 'slate'
  recordExtractedFields.value = []
  recordExtractedFileUrl.value = ''
  recordExtractionPayload.value = null
  try {
    const res = await aiExtractionApi.extractReceipt(file)
    recordExtractedFileUrl.value = res?.file_url || ''
    recordExtractionPayload.value = res?.extraction || null
    const x = res?.extraction || null
    if (!x) {
      recordExtractionTone.value = 'slate'
      recordExtractionMessage.value = recordExtractedFileUrl.value
        ? 'Receipt uploaded, but no fields could be read. Fill them in manually.'
        : 'No fields could be read from the image. Fill them in manually.'
      return
    }
    const filled = []
    if (x.payment_reference_number) {
      recordForm.value.payment_reference_number = x.payment_reference_number
      filled.push('reference number')
    }
    if (x.payee_account_number) {
      recordForm.value.payee_account_number = x.payee_account_number
      filled.push('payee account')
    }
    if (x.payment_method) {
      recordForm.value.payment_method = x.payment_method
      filled.push('method')
    }
    if (x.payment_method_name) {
      recordForm.value.payment_method_name = x.payment_method_name
      filled.push('method name')
    }
    if (x.payment_datetime) {
      const dt = toDatetimeLocal(x.payment_datetime)
      if (dt) {
        recordForm.value.payment_datetime = dt
        filled.push('date & time')
      }
    }
    if (x.amount_paid != null) {
      recordForm.value.amount_paid = Number(x.amount_paid) || recordForm.value.amount_paid
      filled.push('amount paid')
    }
    recordExtractedFields.value = filled
    if (filled.length) {
      recordExtractionTone.value = 'emerald'
      const conf = x.confidence != null ? ` (confidence ${Math.round(Number(x.confidence) * 100)}%)` : ''
      recordExtractionMessage.value = `Auto-filled ${filled.join(', ')}${conf}. Double-check before submitting.`
    } else {
      recordExtractionMessage.value = 'Image processed, but no known fields matched. Fill them in manually.'
    }
  } catch (e) {
    recordExtractionTone.value = 'rose'
    recordExtractionMessage.value = e?.message || 'Extraction failed. You can still fill the fields manually.'
  } finally {
    recordExtractionBusy.value = false
  }
}

function onRecordReceiptPick(e) {
  const file = e.target.files?.[0]
  if (!file) return
  recordFile.value = file
  if (recordFileUrl.value) URL.revokeObjectURL(recordFileUrl.value)
  recordFileUrl.value = URL.createObjectURL(file)
  runRecordExtraction(file)
}
function discardRecordReceiptPick() {
  recordFile.value = null
  if (recordFileUrl.value) URL.revokeObjectURL(recordFileUrl.value)
  recordFileUrl.value = ''
  const el = document.getElementById('record-receipt-input')
  if (el) el.value = ''
  recordExtractionMessage.value = ''
  recordExtractedFields.value = []
  recordExtractedFileUrl.value = ''
  recordExtractionPayload.value = null
}

// Live preview of the tenant's current subscription + what this payment would
// activate. Mirrors the 3-rule flow in TenantSubscriptionPaymentService
// (applyApprovedPayment): no active plan or expired → immediate; ≤5 days
// remaining → scheduled at current expiry; >5 days → auto-approve is blocked
// (payment stays pending).
const selectedTenant = computed(() =>
  recordForm.value.tenant_uuid
    ? tenantsByUuid.value[recordForm.value.tenant_uuid] || null
    : null
)
const selectedRecordPlan = computed(() =>
  recordForm.value.subscription_plan_uuid
    ? plans.items.find(p => p.uuid === recordForm.value.subscription_plan_uuid) || null
    : null
)
const currentSubscription = computed(() => {
  const t = selectedTenant.value
  if (!t) return null
  const planUuid = t.current_subscription_plan_uuid || null
  const plan = planUuid ? (plans.items.find(p => p.uuid === planUuid) || null) : null
  const expiryIso = t.current_subscription_expiry || null
  const expiryDate = expiryIso ? new Date(String(expiryIso).replace(' ', 'T')) : null
  const now = new Date()
  const daysRemaining = expiryDate && !isNaN(expiryDate.getTime())
    ? Math.ceil((expiryDate.getTime() - now.getTime()) / 86_400_000)
    : null
  let state = 'none'
  if (planUuid) {
    if (daysRemaining == null) state = 'active'
    else if (daysRemaining < 0) state = 'expired'
    else {
      const warn = Number(t.current_subscription_expiry_warning_days) || 0
      if (warn && daysRemaining <= warn) state = 'expiring-soon'
      else state = 'active'
    }
  }
  return {
    plan_uuid: planUuid,
    plan_name: plan?.name || null,
    plan_code: plan?.code || null,
    plan_amount: t.current_subscription_plan_amount,
    days: t.current_subscription_days,
    start: t.current_subscription_start,
    expiry: expiryIso,
    expiry_date: expiryDate,
    days_remaining: daysRemaining,
    state
  }
})
const newSubscriptionPreview = computed(() => {
  const t = selectedTenant.value
  const plan = selectedRecordPlan.value
  if (!t || !plan) return null
  const days = Number(plan.days_duration) || 0
  if (!(days > 0)) return null
  const now = new Date()
  const curExpiry = t.current_subscription_expiry
    ? new Date(String(t.current_subscription_expiry).replace(' ', 'T'))
    : null
  const hasActive = !!curExpiry && !isNaN(curExpiry.getTime()) && curExpiry > now
  const daysToExpiry = hasActive
    ? Math.ceil((curExpiry.getTime() - now.getTime()) / 86_400_000)
    : 0
  let activation_mode, start, end
  if (!hasActive) {
    activation_mode = 'immediate'
    start = now
  } else if (daysToExpiry <= 5) {
    activation_mode = 'scheduled'
    start = curExpiry
  } else {
    activation_mode = 'blocked'
    start = null
  }
  if (start) {
    end = new Date(start)
    end.setDate(end.getDate() + days)
  }
  return { activation_mode, start, end, days, days_to_expiry: daysToExpiry }
})

// Default amount_paid to the picked plan's price when the admin hasn't yet
// typed one (or had the default from a different plan).
watch(() => recordForm.value.subscription_plan_uuid, (newUuid, oldUuid) => {
  if (!newUuid) return
  const plan = plans.items.find(p => p.uuid === newUuid)
  if (!plan) return
  const planPrice = Number(plan.price) || 0
  const current = Number(recordForm.value.amount_paid) || 0
  if (!current) {
    recordForm.value.amount_paid = planPrice
    return
  }
  // If the admin had the previous plan's price pre-filled (and hadn't edited),
  // follow the switch.
  if (oldUuid) {
    const oldPlan = plans.items.find(p => p.uuid === oldUuid)
    const oldPrice = Number(oldPlan?.price) || 0
    if (oldPrice && current === oldPrice) {
      recordForm.value.amount_paid = planPrice
    }
  }
})

async function submitRecord() {
  recordError.value = ''
  if (!recordForm.value.tenant_uuid) {
    recordError.value = 'Pick a tenant.'
    return
  }
  if (!recordForm.value.subscription_plan_uuid) {
    recordError.value = 'Pick a subscription plan.'
    return
  }
  const amt = Number(recordForm.value.amount_paid)
  if (!(amt >= 0)) {
    recordError.value = 'Enter the amount paid.'
    return
  }
  if (recordExtractionBusy.value) {
    recordError.value = 'Wait for the receipt to finish processing.'
    return
  }
  // A receipt is optional — but if the admin picked one, make sure the upload
  // call finished (so we have the stored file URL to attach).
  if (recordFile.value && !recordExtractedFileUrl.value) {
    recordError.value = 'Receipt upload didn\'t complete. Re-pick the image or discard it.'
    return
  }

  recordSaving.value = true
  try {
    const payload = {
      tenant_uuid: recordForm.value.tenant_uuid,
      subscription_plan_uuid: recordForm.value.subscription_plan_uuid,
      amount_paid: Number(recordForm.value.amount_paid) || 0,
      payment_attachment_url: recordExtractedFileUrl.value || undefined,
      payment_reference_number: recordForm.value.payment_reference_number || undefined,
      payee_account_number: recordForm.value.payee_account_number || undefined,
      payment_method: recordForm.value.payment_method || undefined,
      payment_method_name: recordForm.value.payment_method_name || undefined,
      payment_datetime: fromDatetimeLocal(recordForm.value.payment_datetime),
      ai_extraction: recordExtractionPayload.value || undefined
    }
    const created = await paymentsApi.uploadPayment(payload)
    const uuid = created?.uuid
    if (!uuid) {
      // Should never happen — upload always returns the row — but guard anyway.
      flash('Payment recorded. Refresh the list to find it.', 'emerald')
      closeRecord()
      await Promise.all([loadPending(), loadHistory()])
      return
    }

    // Chain the auto-approve. If it fails (most commonly: "Current plan still
    // has X days remaining; can only approve within 5 days of expiry"), the
    // record is already saved and shows up in the pending list — surface the
    // error so the admin knows why it didn't activate.
    try {
      await paymentsApi.approvePayment(uuid)
      flash('Payment recorded and approved ✓')
    } catch (approveErr) {
      flash(`Payment recorded as pending — ${approveErr?.message || 'auto-approve failed'}`, 'rose')
    }
    closeRecord()
    await Promise.all([loadPending(), loadHistory()])
  } catch (e) {
    recordError.value = e?.message || 'Failed to record payment'
  } finally {
    recordSaving.value = false
  }
}

/* ─── View modal (details, approve, reject) — shared by both sections ─── */
const detail        = ref(null)
const detailShow    = ref(false)
const detailLoading = ref(false)
const detailError   = ref('')

async function openView(p) {
  detailShow.value  = true
  detailError.value = ''
  detail.value      = p
  detailLoading.value = true
  try {
    const full = await paymentsApi.viewPayment(p.uuid)
    detail.value = full || p
  } catch (e) {
    detailError.value = e?.message || 'Failed to load full payment record'
  } finally {
    detailLoading.value = false
  }
}
function closeView() {
  detailShow.value  = false
  detail.value      = null
  detailError.value = ''
  approveStart.value = ''
  rejectReason.value = ''
}

const receiptZoom = ref(1)
const ZOOM_MIN = 0.5
const ZOOM_MAX = 4
const ZOOM_STEP = 0.25
function zoomIn()    { receiptZoom.value = Math.min(ZOOM_MAX, +(receiptZoom.value + ZOOM_STEP).toFixed(2)) }
function zoomOut()   { receiptZoom.value = Math.max(ZOOM_MIN, +(receiptZoom.value - ZOOM_STEP).toFixed(2)) }
function zoomReset() { receiptZoom.value = 1 }

const approveStart = ref('')
const confirmApprove = ref({ show: false })
const acting = ref(false)

function askApprove() { confirmApprove.value = { show: true } }
async function doApprove() {
  if (!detail.value?.uuid) return
  acting.value = true
  try {
    await paymentsApi.approvePayment(detail.value.uuid, approveStart.value || undefined)
    flash('Payment approved ✓')
    confirmApprove.value = { show: false }
    closeView()
    await Promise.all([loadPending(), loadHistory()])
  } catch (e) {
    flash(e?.message || 'Failed to approve payment', 'rose')
  } finally {
    acting.value = false
  }
}

const rejectReason = ref('')
const confirmReject = ref({ show: false })
function askReject() {
  if (!rejectReason.value.trim()) {
    flash('Please enter a rejection reason first.', 'rose')
    return
  }
  confirmReject.value = { show: true }
}
async function doReject() {
  if (!detail.value?.uuid) return
  acting.value = true
  try {
    await paymentsApi.rejectPayment(detail.value.uuid, rejectReason.value.trim())
    flash('Payment rejected ✓')
    confirmReject.value = { show: false }
    closeView()
    await Promise.all([loadPending(), loadHistory()])
  } catch (e) {
    flash(e?.message || 'Failed to reject payment', 'rose')
  } finally {
    acting.value = false
  }
}

function statusBadgeClass(s) {
  if (s === 'approved') return 'badge-success'
  if (s === 'rejected') return 'badge-danger'
  return 'badge-warn'
}
function statusLabel(s) {
  if (s === 'approved') return 'Approved'
  if (s === 'rejected') return 'Rejected'
  return 'Pending'
}

function resetHistoryFilters() {
  tenantScope.value  = 'all'
  tenantUuid.value   = ''
  statusFilter.value = 'approved'
  search.value       = ''
  dateFrom.value     = daysAgoISO(30)
  dateTo.value       = todayISO()
}

/* ─── Mobile-only collapsible history filters ─── */
// Six-column filter row is the tallest thing on this page on a phone. Hide it
// by default and let the user tap to expand. Tablet/desktop always show it
// inline. Same design as the ReportsView pattern.
const filtersOpen = ref(false)
const filtersSummary = computed(() => {
  const parts = []
  parts.push(tenantScope.value === 'specific'
    ? (tenantUuid.value ? tenantLabel(tenantUuid.value) : 'No tenant picked')
    : 'All tenants')
  parts.push(statusFilter.value ? statusLabel(statusFilter.value) : 'All statuses')
  parts.push(`${dateFrom.value} → ${dateTo.value}`)
  if (search.value.trim()) parts.push(`"${search.value.trim()}"`)
  return parts.join(' · ')
})
</script>

<template>
  <div class="flex h-full flex-col gap-4">
    <!-- Global toast -->
    <transition name="fade">
      <div v-if="flashMsg" class="rounded-md border px-4 py-2 text-sm"
           :class="flashTone === 'rose'
                   ? 'border-rose-100 bg-rose-50 text-rose-700'
                   : 'border-emerald-100 bg-emerald-50 text-emerald-700'">
        {{ flashMsg }}
      </div>
    </transition>

    <!-- ─── Section 1: Pending payments ─── -->
    <div class="card flex flex-col overflow-hidden">
      <div class="card-header">
        <button type="button"
                class="flex flex-1 items-center gap-2 text-left"
                :aria-expanded="pendingOpen"
                aria-controls="pending-payments-body"
                @click="pendingOpen = !pendingOpen">
          <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0 text-slate-500 transition-transform"
               :class="pendingOpen ? 'rotate-180' : ''"
               fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
          <div>
            <div class="flex items-center gap-2">
              <div class="text-sm font-semibold text-slate-800">Pending Payments</div>
              <span v-if="pendingCount > 0"
                    class="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">
                {{ pendingCount }}
              </span>
            </div>
            <div class="text-xs text-slate-500">
              Every payment awaiting review, across all tenants.
              <span v-if="pendingLoading" class="ml-1 text-indigo-600">· loading…</span>
            </div>
          </div>
        </button>
        <button class="btn-primary !px-3 !text-xs" @click.stop="openRecord"
                title="Record a payment on behalf of a tenant (off-platform GCash, bank transfer, cash, etc.)">
          + Record payment
        </button>
        <button class="btn-secondary !px-3" @click.stop="loadPending" :disabled="pendingLoading" title="Refresh">
          <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"/>
            <polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
        </button>
      </div>

      <div v-if="pendingError && pendingOpen" class="border-b border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-700">
        {{ pendingError }}
      </div>

      <div v-show="pendingOpen" id="pending-payments-body" class="max-h-[45vh] overflow-auto">
        <SkeletonRows v-if="pendingLoading && !pendingRows.length" :rows="4"
                      :columns="['lines','wide','bar','bar','pill','dot']" />
        <table v-else-if="pendingRows.length" class="table">
          <thead class="sticky top-0 z-10 bg-amber-50 shadow-[inset_0_-1px_0_theme(colors.amber.100)]">
            <tr>
              <th>Submitted</th>
              <th>Tenant</th>
              <th>Plan</th>
              <th class="text-right">Amount</th>
              <th>Method</th>
              <th>Reference</th>
              <th class="w-14 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in pendingRows" :key="p.uuid">
              <td class="whitespace-nowrap text-xs text-slate-600">{{ formatDateTime(p.created_at) }}</td>
              <td>
                <div class="max-w-[16ch] truncate font-semibold text-slate-800">
                  {{ p.tenant_display_name || tenantLabel(p.tenant_uuid) }}
                </div>
                <div class="font-mono text-[10px] text-slate-500">{{ p.tenant_store_code || '' }}</div>
              </td>
              <td>
                <div class="text-sm text-slate-800">{{ p.subscription_plan_name || p.subscription_plan_code || '—' }}</div>
                <div class="font-mono text-[10px] text-slate-500">{{ p.subscription_plan_code }}</div>
              </td>
              <td class="text-right font-semibold text-slate-800">
                {{ p.amount_paid != null ? money(p.amount_paid) : '—' }}
                <div v-if="p.amount_paid != null && Number(p.amount_paid) !== Number(p.subscription_plan_amount)"
                     class="text-[10px] font-normal"
                     :class="Number(p.amount_paid) < Number(p.subscription_plan_amount) ? 'text-rose-600' : 'text-emerald-600'">
                  {{ Number(p.amount_paid) < Number(p.subscription_plan_amount) ? 'Short' : 'Over' }}
                  by {{ money(Math.abs(Number(p.amount_paid) - Number(p.subscription_plan_amount))) }}
                </div>
              </td>
              <td class="text-xs">{{ p.payment_method_name || p.payment_method || '—' }}</td>
              <td class="font-mono text-[11px]">{{ p.payment_reference_number || '—' }}</td>
              <td class="text-right">
                <button type="button"
                        class="text-xs font-semibold text-indigo-600 hover:underline"
                        @click="openView(p)">
                  View / Review
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <EmptyState
          v-else-if="!pendingLoading"
          title="No pending payments"
          message="All caught up — every submitted payment has been reviewed."
        />
      </div>
    </div>

    <!-- ─── Section 2: History with filters ─── -->
    <div class="card flex flex-1 min-h-0 flex-col overflow-hidden">
      <div class="card-header">
        <div>
          <div class="text-sm font-semibold text-slate-800">Payment History</div>
          <div class="text-xs text-slate-500">
            {{ historyCounts.total }} record{{ historyCounts.total === 1 ? '' : 's' }} shown
            · <span class="text-emerald-700">{{ historyCounts.approved }} approved</span>
            · <span class="text-rose-700">{{ historyCounts.rejected }} rejected</span>
            · <span class="text-amber-700">{{ historyCounts.pending }} pending</span>
            <span v-if="historyCounts.approved > 0"
                  class="ml-2 text-slate-700">Total approved: <b>{{ money(historyCounts.amount) }}</b></span>
            <span v-if="historyLoading" class="ml-1 text-indigo-600">· loading…</span>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <button class="btn-ghost !text-xs" @click="resetHistoryFilters" :disabled="historyLoading">
            Reset filters
          </button>
          <button class="btn-secondary !px-3" @click="loadHistory" :disabled="historyLoading" title="Refresh">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Mobile-only collapse toggle. sm:hidden so tablet/desktop always
           show the filter body inline. Matches the ReportsView pattern. -->
      <button
        type="button"
        class="flex w-full items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2 text-left text-sm text-slate-700 sm:hidden"
        :aria-expanded="filtersOpen"
        aria-controls="history-filters-body"
        @click="filtersOpen = !filtersOpen"
      >
        <span class="flex min-w-0 items-center gap-2">
          <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0 text-slate-500" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
          <b class="shrink-0">Filters</b>
          <span class="truncate text-xs font-normal text-slate-500">· {{ filtersSummary }}</span>
        </span>
        <svg viewBox="0 0 24 24"
             class="h-4 w-4 shrink-0 text-slate-500 transition-transform"
             :class="filtersOpen && 'rotate-180'"
             fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      <!-- Filters -->
      <div
        id="history-filters-body"
        class="gap-2 border-b border-slate-100 p-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-6"
        :class="filtersOpen ? 'grid' : 'hidden sm:grid'"
      >
        <div class="lg:col-span-2">
          <label class="label">Tenant scope</label>
          <div class="flex gap-2">
            <label class="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm transition"
                   :class="tenantScope === 'all'
                           ? 'border-indigo-500 bg-indigo-50 font-semibold text-indigo-700'
                           : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300'">
              <input v-model="tenantScope" type="radio" value="all" class="sr-only" />
              All tenants
            </label>
            <label class="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm transition"
                   :class="tenantScope === 'specific'
                           ? 'border-indigo-500 bg-indigo-50 font-semibold text-indigo-700'
                           : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300'">
              <input v-model="tenantScope" type="radio" value="specific" class="sr-only" />
              Specific tenant
            </label>
          </div>
        </div>

        <div class="lg:col-span-2">
          <label class="label">
            Tenant
            <span v-if="tenantScope === 'specific'" class="text-rose-500">*</span>
          </label>
          <select v-model="tenantUuid" class="input" :disabled="tenantScope !== 'specific' || tenantsLoading">
            <option value="">
              {{ tenantScope === 'specific'
                 ? (tenantsLoading ? 'Loading tenants…' : 'Choose a tenant…')
                 : 'All tenants' }}
            </option>
            <option v-for="t in tenants" :key="t.uuid" :value="t.uuid">
              {{ t.display_name || t.store_code }}<span v-if="t.store_code"> · {{ t.store_code }}</span>
            </option>
          </select>
          <p v-if="tenantsError" class="mt-1 text-[11px] text-rose-600">{{ tenantsError }}</p>
        </div>

        <div>
          <label class="label">Status</label>
          <select v-model="statusFilter" class="input">
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        <div>
          <label class="label">Date from</label>
          <input v-model="dateFrom" type="date" class="input" />
        </div>

        <div class="sm:col-span-2 lg:col-span-5">
          <label class="label">Search</label>
          <input v-model="search" class="input"
                 placeholder="Reference #, method, payee account…" />
        </div>
        <div>
          <label class="label">Date to</label>
          <input v-model="dateTo" type="date" class="input" />
        </div>
      </div>

      <div v-if="historyError" class="border-b border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-700">
        {{ historyError }}
      </div>

      <div class="min-h-0 flex-1 overflow-auto">
        <SkeletonRows v-if="historyLoading && !historyRows.length" :rows="6"
                      :columns="['lines','wide','bar','bar','pill','dot']" />
        <table v-else-if="historyRows.length" class="table">
          <thead class="sticky top-0 z-10 bg-slate-50 shadow-[inset_0_-1px_0_theme(colors.slate.100)]">
            <tr>
              <th>Submitted</th>
              <th>Tenant</th>
              <th>Plan</th>
              <th class="text-right">Amount</th>
              <th>Method</th>
              <th>Reference</th>
              <th>Status</th>
              <th class="w-14 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in historyRows" :key="p.uuid">
              <td class="whitespace-nowrap text-xs text-slate-600">{{ formatDateTime(p.created_at) }}</td>
              <td>
                <div class="max-w-[16ch] truncate font-semibold text-slate-800">
                  {{ p.tenant_display_name || tenantLabel(p.tenant_uuid) }}
                </div>
                <div class="font-mono text-[10px] text-slate-500">{{ p.tenant_store_code || '' }}</div>
              </td>
              <td>
                <div class="text-sm text-slate-800">{{ p.subscription_plan_name || p.subscription_plan_code || '—' }}</div>
                <div class="font-mono text-[10px] text-slate-500">{{ p.subscription_plan_code }}</div>
              </td>
              <td class="text-right font-semibold text-slate-800">
                {{ p.amount_paid != null ? money(p.amount_paid) : '—' }}
                <div v-if="p.amount_paid != null && Number(p.amount_paid) !== Number(p.subscription_plan_amount)"
                     class="text-[10px] font-normal"
                     :class="Number(p.amount_paid) < Number(p.subscription_plan_amount) ? 'text-rose-600' : 'text-emerald-600'">
                  {{ Number(p.amount_paid) < Number(p.subscription_plan_amount) ? 'Short' : 'Over' }}
                  by {{ money(Math.abs(Number(p.amount_paid) - Number(p.subscription_plan_amount))) }}
                </div>
              </td>
              <td class="text-xs">{{ p.payment_method_name || p.payment_method || '—' }}</td>
              <td class="font-mono text-[11px]">{{ p.payment_reference_number || '—' }}</td>
              <td>
                <span :class="statusBadgeClass(p.payment_status)"
                      :title="p.payment_status === 'rejected' ? (p.rejection_reason || '') : ''">
                  {{ statusLabel(p.payment_status) }}
                </span>
              </td>
              <td class="text-right">
                <button type="button"
                        class="text-xs font-semibold text-indigo-600 hover:underline"
                        @click="openView(p)">
                  View / Review
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <EmptyState
          v-else-if="!historyLoading"
          title="No payments found"
          message="Adjust the filters — the defaults show approved payments from the last 30 days across all tenants."
        />
      </div>
    </div>

    <!-- View / Approve / Reject modal -->
    <Modal :show="detailShow"
           :title="detail ? `Payment · ${detail.subscription_plan_name || detail.subscription_plan_code || 'Subscription'}` : 'Payment'"
           size="xl"
           @close="closeView">
      <div v-if="detail" class="grid grid-cols-1 gap-5 md:grid-cols-2">
        <!-- LEFT: receipt image -->
        <div>
          <div class="mb-2 flex items-center justify-between">
            <label class="label !mb-0">Receipt</label>
            <div v-if="detail.payment_attachment_file" class="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white p-1 shadow-sm">
              <button type="button" class="btn-icon !h-7 !w-7" :disabled="receiptZoom <= ZOOM_MIN"
                      title="Zoom out" @click="zoomOut">
                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                     stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="11" cy="11" r="7"/>
                  <line x1="8" y1="11" x2="14" y2="11"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              </button>
              <div class="min-w-[3rem] px-2 text-center font-mono text-xs text-slate-700 select-none">
                {{ Math.round(receiptZoom * 100) }}%
              </div>
              <button type="button" class="btn-icon !h-7 !w-7" :disabled="receiptZoom >= ZOOM_MAX"
                      title="Zoom in" @click="zoomIn">
                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                     stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="11" cy="11" r="7"/>
                  <line x1="8" y1="11" x2="14" y2="11"/>
                  <line x1="11" y1="8" x2="11" y2="14"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              </button>
              <button type="button" class="btn-icon !h-7 !w-7" :disabled="receiptZoom === 1"
                      title="Reset zoom" @click="zoomReset">
                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                     stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="1 4 1 10 7 10"/>
                  <path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="max-h-[60vh] overflow-auto rounded-lg border border-slate-200 bg-slate-100">
            <div class="flex min-h-[40vh] items-center justify-center p-2">
              <img v-if="detail.payment_attachment_file" :src="assetUrl(detail.payment_attachment_file)"
                   :style="{ zoom: receiptZoom }"
                   class="max-h-[55vh] w-auto select-none object-contain" alt="Payment receipt" draggable="false" />
              <div v-else class="p-8 text-center text-xs text-slate-500">
                No receipt image attached.
              </div>
            </div>
          </div>
          <a v-if="detail.payment_attachment_file"
             :href="assetUrl(detail.payment_attachment_file)" target="_blank" rel="noopener"
             class="mt-2 inline-block text-xs font-semibold text-indigo-600 hover:underline">
            Open original in new tab
          </a>
        </div>

        <!-- RIGHT: details + approve/reject controls -->
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-3">
            <div class="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <div class="text-[10px] uppercase tracking-widest text-slate-500">Tenant</div>
              <div class="mt-0.5 text-sm font-semibold text-slate-800">
                {{ detail.tenant_display_name || tenantLabel(detail.tenant_uuid) }}
              </div>
              <div class="font-mono text-[11px] text-slate-500">{{ detail.tenant_store_code || '' }}</div>
            </div>
            <div class="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <div class="text-[10px] uppercase tracking-widest text-slate-500">Status</div>
              <div class="mt-0.5">
                <span :class="statusBadgeClass(detail.payment_status)">{{ statusLabel(detail.payment_status) }}</span>
              </div>
              <div v-if="detail.payment_status === 'rejected' && detail.rejection_reason"
                   class="mt-1 text-[11px] text-rose-700">
                {{ detail.rejection_reason }}
              </div>
            </div>
            <div class="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <div class="text-[10px] uppercase tracking-widest text-slate-500">Plan</div>
              <div class="mt-0.5 text-sm font-semibold text-slate-800">
                {{ detail.subscription_plan_name || detail.subscription_plan_code || '—' }}
              </div>
              <div class="font-mono text-[11px] text-slate-500">{{ detail.subscription_plan_code }}</div>
              <div class="text-[11px] text-slate-500">
                {{ detail.subscription_days ? `${detail.subscription_days} days` : '' }}
                <span v-if="detail.subscription_plan_amount != null">
                  · {{ money(detail.subscription_plan_amount) }}
                </span>
              </div>
            </div>
            <div class="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <div class="text-[10px] uppercase tracking-widest text-slate-500">Amount paid</div>
              <div class="mt-0.5 text-lg font-black text-slate-900">
                {{ detail.amount_paid != null ? money(detail.amount_paid) : '—' }}
              </div>
              <div v-if="detail.amount_paid != null && Number(detail.amount_paid) !== Number(detail.subscription_plan_amount)"
                   class="text-[11px]"
                   :class="Number(detail.amount_paid) < Number(detail.subscription_plan_amount) ? 'text-rose-600' : 'text-emerald-600'">
                {{ Number(detail.amount_paid) < Number(detail.subscription_plan_amount) ? 'Short' : 'Over' }}
                by {{ money(Math.abs(Number(detail.amount_paid) - Number(detail.subscription_plan_amount))) }}
              </div>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3 text-xs">
            <div>
              <div class="text-[10px] uppercase tracking-widest text-slate-500">Method</div>
              <div class="text-slate-800">{{ detail.payment_method_name || detail.payment_method || '—' }}</div>
            </div>
            <div>
              <div class="text-[10px] uppercase tracking-widest text-slate-500">Reference #</div>
              <div class="font-mono text-slate-800">{{ detail.payment_reference_number || '—' }}</div>
            </div>
            <div>
              <div class="text-[10px] uppercase tracking-widest text-slate-500">Payee account</div>
              <div class="font-mono text-slate-800">{{ detail.payee_account_number || '—' }}</div>
            </div>
            <div>
              <div class="text-[10px] uppercase tracking-widest text-slate-500">Paid at</div>
              <div class="text-slate-800">{{ formatDateTime(detail.payment_datetime) }}</div>
            </div>
            <div>
              <div class="text-[10px] uppercase tracking-widest text-slate-500">Submitted</div>
              <div class="text-slate-800">{{ formatDateTime(detail.created_at) }}</div>
            </div>
            <div v-if="detail.reviewed_at">
              <div class="text-[10px] uppercase tracking-widest text-slate-500">Reviewed</div>
              <div class="text-slate-800">{{ formatDateTime(detail.reviewed_at) }}</div>
            </div>
          </div>

          <div v-if="detail.payment_status !== 'approved' && detail.payment_status !== 'rejected'"
               class="space-y-3 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
            <div class="text-xs font-semibold text-slate-700">Review this payment</div>

            <div>
              <label class="label">Subscription start (optional)</label>
              <input v-model="approveStart" type="date" class="input" />
              <p class="text-[11px] text-slate-500">
                Leave blank to start today (or right after the current plan expires).
              </p>
            </div>

            <div>
              <label class="label">Rejection reason (required to reject)</label>
              <textarea v-model="rejectReason" rows="2" class="input"
                        placeholder="e.g. Receipt is illegible / reference # not found"></textarea>
            </div>

            <div class="flex flex-wrap justify-end gap-2">
              <button class="btn-danger" :disabled="acting" @click="askReject">Reject</button>
              <button class="btn-primary" :disabled="acting" @click="askApprove">Approve</button>
            </div>
          </div>
          <div v-else class="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            This payment has already been {{ detail.payment_status }}.
            <span v-if="detail.payment_status === 'approved' && detail.subscription_start">
              Subscription started {{ formatDate(detail.subscription_start) }}.
            </span>
          </div>

          <div v-if="detailLoading" class="text-[11px] text-indigo-600">Loading full record…</div>
          <div v-if="detailError" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {{ detailError }}
          </div>
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="closeView">Close</button>
      </template>
    </Modal>

    <ConfirmDialog
      :show="confirmApprove.show"
      title="Approve payment?"
      :message="detail
        ? `Approving will activate the ${detail.subscription_plan_name || detail.subscription_plan_code || 'subscription'} plan for ${detail.tenant_display_name || tenantLabel(detail.tenant_uuid)}${approveStart ? ' starting ' + approveStart : ''}.`
        : ''"
      confirm-text="Approve"
      :danger="false"
      @close="confirmApprove = { show: false }"
      @confirm="doApprove"
    />
    <ConfirmDialog
      :show="confirmReject.show"
      title="Reject payment?"
      :message="detail
        ? `Rejecting will notify the tenant. Reason: “${rejectReason.trim()}”.`
        : ''"
      confirm-text="Reject"
      @close="confirmReject = { show: false }"
      @confirm="doReject"
    />

    <!-- ─── Record Payment modal (admin logs an off-platform tenant payment) ─── -->
    <Modal :show="recordShow" title="Record Tenant Payment" size="xl" @close="closeRecord">
      <div class="space-y-4">
        <p class="rounded-md border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-xs text-slate-700">
          Log a payment the tenant sent you off-platform (GCash, bank transfer, cash, etc.).
          If the tenant has no active plan or is within 5 days of expiry, this will auto-approve
          and activate the subscription. Otherwise it stays as <b>pending</b> for later review.
        </p>

        <!-- Tenant + plan pickers -->
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label class="label">Tenant <span class="text-rose-500">*</span></label>
            <select v-model="recordForm.tenant_uuid" class="input" :disabled="tenantsLoading">
              <option value="">{{ tenantsLoading ? 'Loading tenants…' : 'Choose a tenant…' }}</option>
              <option v-for="t in tenants" :key="t.uuid" :value="t.uuid">
                {{ t.display_name || t.store_code }}<span v-if="t.store_code"> · {{ t.store_code }}</span>
              </option>
            </select>
            <p v-if="tenantsError" class="mt-1 text-[11px] text-rose-600">{{ tenantsError }}</p>
          </div>
          <div>
            <label class="label">Subscription plan <span class="text-rose-500">*</span></label>
            <select v-model="recordForm.subscription_plan_uuid" class="input" :disabled="plans.loading">
              <option value="">
                {{ plans.loading ? 'Loading plans…' : (recordablePlans.length ? 'Choose a plan…' : 'No active plans available') }}
              </option>
              <option v-for="p in recordablePlans" :key="p.uuid" :value="p.uuid">
                {{ p.name }} — {{ money(p.price) }} / {{ p.days_duration }}d
              </option>
            </select>
            <p v-if="plans.error" class="mt-1 text-[11px] text-rose-600">{{ plans.error }}</p>
          </div>
        </div>

        <!-- Current + new subscription preview -->
        <div v-if="currentSubscription || newSubscriptionPreview"
             class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <!-- Current subscription -->
          <div v-if="currentSubscription"
               class="rounded-lg border p-3"
               :class="currentSubscription.state === 'expired' ? 'border-rose-200 bg-rose-50'
                        : currentSubscription.state === 'expiring-soon' ? 'border-amber-200 bg-amber-50'
                        : currentSubscription.state === 'active' ? 'border-emerald-200 bg-emerald-50'
                        : 'border-slate-200 bg-slate-50'">
            <div class="flex items-center justify-between gap-2">
              <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Current subscription</div>
              <span v-if="currentSubscription.state === 'active'" class="badge-success">Active</span>
              <span v-else-if="currentSubscription.state === 'expiring-soon'" class="badge-warn">Expiring soon</span>
              <span v-else-if="currentSubscription.state === 'expired'" class="badge-danger">Expired</span>
              <span v-else class="badge-muted">No plan</span>
            </div>
            <div v-if="currentSubscription.state === 'none'"
                 class="mt-1 text-xs text-slate-600">
              This tenant has no subscription plan on file yet.
            </div>
            <div v-else class="mt-1 space-y-0.5">
              <div class="text-sm font-semibold text-slate-800">
                {{ currentSubscription.plan_name || currentSubscription.plan_code || '—' }}
              </div>
              <div v-if="currentSubscription.plan_code" class="font-mono text-[10px] text-slate-500">
                {{ currentSubscription.plan_code }}
              </div>
              <div class="text-xs text-slate-700">
                <span v-if="currentSubscription.plan_amount != null">{{ money(currentSubscription.plan_amount) }}</span>
                <span v-if="currentSubscription.days"> · {{ currentSubscription.days }}d</span>
              </div>
              <div class="text-xs text-slate-700">
                Expires <b>{{ formatDate(currentSubscription.expiry) || '—' }}</b>
                <span v-if="currentSubscription.days_remaining != null" class="text-slate-500">
                  <template v-if="currentSubscription.days_remaining < 0">
                    (expired {{ -currentSubscription.days_remaining }}d ago)
                  </template>
                  <template v-else>
                    ({{ currentSubscription.days_remaining }}d remaining)
                  </template>
                </span>
              </div>
            </div>
          </div>

          <!-- New subscription preview -->
          <div v-if="newSubscriptionPreview"
               class="rounded-lg border p-3"
               :class="newSubscriptionPreview.activation_mode === 'immediate' ? 'border-emerald-200 bg-emerald-50'
                        : newSubscriptionPreview.activation_mode === 'scheduled' ? 'border-indigo-200 bg-indigo-50'
                        : 'border-amber-200 bg-amber-50'">
            <div class="flex items-center justify-between gap-2">
              <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500">After this payment</div>
              <span v-if="newSubscriptionPreview.activation_mode === 'immediate'" class="badge-success">Activates now</span>
              <span v-else-if="newSubscriptionPreview.activation_mode === 'scheduled'" class="badge-info">Scheduled</span>
              <span v-else class="badge-warn">Blocked</span>
            </div>
            <div v-if="newSubscriptionPreview.activation_mode === 'blocked'"
                 class="mt-1 text-xs text-slate-700">
              Current plan still has <b>{{ newSubscriptionPreview.days_to_expiry }}d</b> left — more than 5.
              Auto-approve will fail; the payment will be recorded as <b>pending</b> for later review.
            </div>
            <div v-else class="mt-1 space-y-0.5">
              <div class="text-sm font-semibold text-slate-800">
                {{ selectedRecordPlan?.name || selectedRecordPlan?.code || 'Subscription plan' }}
              </div>
              <div class="text-xs text-slate-700">
                <span v-if="selectedRecordPlan?.price != null">{{ money(selectedRecordPlan.price) }}</span>
                <span v-if="newSubscriptionPreview.days"> · {{ newSubscriptionPreview.days }}d</span>
              </div>
              <div class="text-xs text-slate-700">
                <template v-if="newSubscriptionPreview.activation_mode === 'immediate'">
                  Starts <b>today</b>
                </template>
                <template v-else>
                  Starts <b>{{ formatDate(newSubscriptionPreview.start?.toISOString()) }}</b>
                  (when the current plan expires)
                </template>
              </div>
              <div class="text-xs text-slate-700">
                New expiration: <b>{{ formatDate(newSubscriptionPreview.end?.toISOString()) || '—' }}</b>
              </div>
            </div>
          </div>
        </div>

        <!-- Receipt (optional) -->
        <div>
          <label class="label">Receipt image (optional)</label>
          <div class="flex items-start gap-3">
            <div class="relative flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50">
              <img v-if="recordFileUrl" :src="recordFileUrl" class="h-full w-full object-contain" />
              <div v-else class="px-1 text-center text-[10px] text-slate-500">Attach a screenshot</div>
              <div v-if="recordExtractionBusy"
                   class="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-sm">
                <svg viewBox="0 0 24 24" class="h-6 w-6 animate-spin text-indigo-600" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 12a9 9 0 11-6.219-8.56"/>
                </svg>
              </div>
            </div>
            <div class="flex flex-col gap-2">
              <label class="btn-secondary cursor-pointer !text-xs">
                {{ recordFile ? 'Replace image' : 'Choose image' }}
                <input id="record-receipt-input" type="file" accept="image/*" class="hidden"
                       @change="onRecordReceiptPick" />
              </label>
              <button v-if="recordFile" type="button" class="btn-ghost !text-xs"
                      @click="discardRecordReceiptPick">Discard</button>
              <p class="text-[11px] text-slate-500">
                Optional — attach the screenshot the tenant forwarded, if you have one.
                We'll try to auto-fill the fields below from the image.
              </p>
            </div>
          </div>
          <div v-if="recordExtractionMessage"
               class="mt-2 rounded-md border px-3 py-2 text-xs"
               :class="recordExtractionTone === 'emerald' ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : recordExtractionTone === 'rose' ? 'border-rose-200 bg-rose-50 text-rose-800'
                        : 'border-slate-200 bg-slate-50 text-slate-700'">
            <div class="flex items-start gap-2">
              <svg v-if="recordExtractionBusy" viewBox="0 0 24 24" class="mt-0.5 h-3.5 w-3.5 animate-spin shrink-0" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 12a9 9 0 11-6.219-8.56"/>
              </svg>
              <svg v-else-if="recordExtractionTone === 'emerald'" viewBox="0 0 24 24" class="mt-0.5 h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" stroke-width="2.5"
                   stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              <span>{{ recordExtractionMessage }}</span>
            </div>
          </div>
        </div>

        <!-- Payment details -->
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <label class="label">Amount paid <span class="text-rose-500">*</span></label>
            <div class="relative">
              <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-500">₱</span>
              <input v-model.number="recordForm.amount_paid" type="number" min="0" step="0.01"
                     class="input pl-7 font-mono" placeholder="0.00" required />
            </div>
          </div>
          <div>
            <label class="label">Payment method</label>
            <select v-model="recordForm.payment_method" class="input">
              <option v-for="m in PAYMENT_METHODS" :key="m.value" :value="m.value">{{ m.label }}</option>
            </select>
          </div>
          <div>
            <label class="label">Method name</label>
            <input v-model="recordForm.payment_method_name" class="input" placeholder="e.g. GCash, BDO Online" />
          </div>
          <div>
            <label class="label">Reference number</label>
            <input v-model="recordForm.payment_reference_number" class="input font-mono"
                   placeholder="From the receipt" />
          </div>
          <div>
            <label class="label">Payee account number</label>
            <input v-model="recordForm.payee_account_number" class="input font-mono"
                   placeholder="Account you received payment to" />
          </div>
          <div class="sm:col-span-2">
            <label class="label">Payment date &amp; time</label>
            <input v-model="recordForm.payment_datetime" type="datetime-local" class="input" />
          </div>
        </div>

        <div v-if="recordError"
             class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ recordError }}
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" :disabled="recordSaving" @click="closeRecord">Cancel</button>
        <button class="btn-primary" :disabled="recordSaving || recordExtractionBusy" @click="submitRecord">
          {{ recordSaving ? 'Submitting…' : 'Record payment' }}
        </button>
      </template>
    </Modal>
  </div>
</template>
