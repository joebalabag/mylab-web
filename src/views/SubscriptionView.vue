<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useTenantStore } from '../stores/tenant'
import { useAuthStore } from '../stores/auth'
import { usePlansStore } from '../stores/plans'
import * as paymentsApi from '../api/tenantSubscriptionPayments'
import * as historyApi from '../api/tenantSubscriptionHistory'
import * as aiExtractionApi from '../api/aiExtraction'
import Modal from '../components/Modal.vue'
import { assetUrl } from '../api/client'
import { money, formatDate, formatDateTime } from '../utils/format'
import { loadPaypalSdk } from '../utils/paypalSdk'

const tenant = useTenantStore()
const auth   = useAuthStore()
const plans  = usePlansStore()

/* ─── Toast ─── */
const toast = ref({ show: false, tone: 'emerald', msg: '' })
let toastTimer = null
function flash(msg, tone = 'emerald') {
  toast.value = { show: true, tone, msg }
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value.show = false), 2400)
}

/* ─── Reload from server on mount so the subscription snapshot is fresh ─── */
const loading = ref(false)
const loadError = ref('')
async function reloadFromServer() {
  if (!tenant.current?.uuid) {
    loadError.value = 'No tenant is bound to this session yet.'
    return
  }
  loading.value = true
  loadError.value = ''
  try {
    await tenant.loadCurrentFromApi()
  } catch (e) {
    loadError.value = e?.message || 'Failed to refresh subscription'
  } finally {
    loading.value = false
  }
}

/* ─── Payment method presets ─── */
const PAYMENT_METHODS = [
  { value: 'ewallet',       label: 'E-Wallet (GCash / Maya / PayPal)' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cash',          label: 'Cash / Over-the-counter' },
  { value: 'card',          label: 'Credit / Debit Card' },
  { value: 'other',         label: 'Other' }
]

/* ─── Payment channel labels — mirror of the plan-CRUD dropdown ─── */
const ACCOUNT_TYPE_LABELS = {
  gcash: 'GCash', maya: 'Maya', paypal: 'PayPal',
  bdo: 'BDO', bpi: 'BPI', metrobank: 'Metrobank', unionbank: 'UnionBank',
  landbank: 'Landbank', rcbc: 'RCBC', security_bank: 'Security Bank',
  other: 'Other'
}
const accountTypeLabel = (v) => ACCOUNT_TYPE_LABELS[v] || v || ''

/* ─── Payment instructions (env-overridable) ─── */
const PAY_INSTRUCTIONS = {
  gcashName:   import.meta.env?.VITE_PAY_GCASH_NAME   || 'MyLab Platform',
  gcashNumber: import.meta.env?.VITE_PAY_GCASH_NUMBER || '0917 000 0000',
  bankName:    import.meta.env?.VITE_PAY_BANK_NAME    || 'BDO — MyLab Platform Inc.',
  bankAccount: import.meta.env?.VITE_PAY_BANK_ACCOUNT || '0000 0000 0000',
  qrImageUrl:  import.meta.env?.VITE_PAY_GCASH_QR_URL || ''
}

/* ─── Current subscription state ─── */
const subscription = computed(() => tenant.current || {})

const subscriptionExpiryDate = computed(() => subscription.value.current_subscription_expiry || null)
const subscriptionDaysRemaining = computed(() => {
  const exp = subscriptionExpiryDate.value
  if (!exp) return null
  const expTs = new Date(String(exp).replace(' ', 'T')).getTime()
  if (isNaN(expTs)) return null
  const diff = expTs - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
})
const subscriptionState = computed(() => {
  if (!subscription.value.current_subscription_plan_uuid) return 'none'
  const remain = subscriptionDaysRemaining.value
  if (remain == null) return 'active'
  if (remain < 0) return 'expired'
  const warn = Number(subscription.value.current_subscription_expiry_warning_days) || 0
  if (warn && remain <= warn) return 'expiring-soon'
  return 'active'
})

// Submit Payment is gated to plans that are near or past expiry. Tenants who
// are comfortably active — or who have not been provisioned a plan yet — can't
// submit a payment; the platform must seed the initial plan first. Also blocks
// submissions once a scheduled subscription is already queued (Rule 2 on the
// server) — a second payment there would just fail with "A scheduled
// subscription already exists".
const canSubmitPayment = computed(() =>
  (subscriptionState.value === 'expiring-soon' || subscriptionState.value === 'expired')
  && !scheduledCycle.value
)

/* ─── Renewal form ─── */
const renewForm = ref({
  subscription_plan_uuid: '',
  amount_paid: '',
  payment_reference_number: '',
  payee_account_number: '',
  payment_method: 'ewallet',
  payment_method_name: 'GCash',
  payment_datetime: ''
})
const renewFile = ref(null)
const renewFileUrl = ref('')
const renewError = ref('')
const renewSaving = ref(false)
// Collapse state — expanded by default; user can collapse manually.
const renewOpen = ref(true)

// AI extraction state — set while /ai-extraction/receipt is in flight and after it returns.
const extractionBusy = ref(false)
const extractionMessage = ref('')  // human-readable result summary
const extractionTone = ref('slate') // 'emerald' | 'slate' | 'rose'
const extractedFields = ref([])     // list of field names populated from OCR
const extractedFileUrl = ref('')    // /public/... URL returned by /ai-extraction/receipt
const extractionPayload = ref(null) // whole extraction object — echoed back to the upload API

function initRenewForm() {
  renewForm.value.subscription_plan_uuid = subscription.value.current_subscription_plan_uuid || ''
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

async function runExtraction(file) {
  extractionBusy.value = true
  extractionMessage.value = 'Reading receipt…'
  extractionTone.value = 'slate'
  extractedFields.value = []
  extractedFileUrl.value = ''
  extractionPayload.value = null
  try {
    const res = await aiExtractionApi.extractReceipt(file)
    extractedFileUrl.value = res?.file_url || ''
    extractionPayload.value = res?.extraction || null
    const x = res?.extraction || null
    if (!x) {
      extractionTone.value = 'slate'
      extractionMessage.value = extractedFileUrl.value
        ? 'Receipt uploaded, but no fields could be read. Please fill them in manually.'
        : 'No fields could be read from the image. Please fill them in manually.'
      return
    }
    const filled = []
    if (x.payment_reference_number) {
      renewForm.value.payment_reference_number = x.payment_reference_number
      filled.push('reference number')
    }
    if (x.payee_account_number) {
      renewForm.value.payee_account_number = x.payee_account_number
      filled.push('payee account')
    }
    if (x.payment_method) {
      renewForm.value.payment_method = x.payment_method
      filled.push('method')
    }
    if (x.payment_method_name) {
      renewForm.value.payment_method_name = x.payment_method_name
      filled.push('method name')
    }
    if (x.payment_datetime) {
      const dt = toDatetimeLocal(x.payment_datetime)
      if (dt) {
        renewForm.value.payment_datetime = dt
        filled.push('date & time')
      }
    }
    if (x.amount_paid != null) {
      renewForm.value.amount_paid = Number(x.amount_paid) || renewForm.value.amount_paid
      filled.push('amount paid')
    }
    extractedFields.value = filled
    if (filled.length) {
      extractionTone.value = 'emerald'
      const conf = x.confidence != null ? ` (confidence ${Math.round(Number(x.confidence) * 100)}%)` : ''
      extractionMessage.value = `Auto-filled ${filled.join(', ')}${conf}. Please double-check before submitting.`
    } else {
      extractionMessage.value = 'Image processed, but no known fields matched. Please fill them in manually.'
    }
  } catch (e) {
    extractionTone.value = 'rose'
    extractionMessage.value = e?.message || 'Extraction failed. You can still fill the fields manually.'
  } finally {
    extractionBusy.value = false
  }
}

function onReceiptPick(e) {
  const file = e.target.files?.[0]
  if (!file) return
  renewFile.value = file
  if (renewFileUrl.value) URL.revokeObjectURL(renewFileUrl.value)
  renewFileUrl.value = URL.createObjectURL(file)
  runExtraction(file)
}
function discardReceiptPick() {
  renewFile.value = null
  if (renewFileUrl.value) URL.revokeObjectURL(renewFileUrl.value)
  renewFileUrl.value = ''
  const el = document.getElementById('renew-receipt-input')
  if (el) el.value = ''
  extractionMessage.value = ''
  extractedFields.value = []
  extractedFileUrl.value = ''
  extractionPayload.value = null
}

async function submitRenewal() {
  renewError.value = ''
  if (!canSubmitPayment.value) {
    renewError.value = subscriptionState.value === 'none'
      ? 'No subscription plan on file yet. The platform must provision an initial plan before you can submit a payment.'
      : 'Payment submission opens when your plan enters its near-expiry window.'
    return
  }
  if (!renewForm.value.subscription_plan_uuid) {
    renewError.value = 'Please choose a subscription plan.'
    return
  }
  if (!renewFile.value) {
    renewError.value = 'Please attach a proof-of-payment image.'
    return
  }
  if (extractionBusy.value) {
    renewError.value = 'Please wait for the receipt to finish processing.'
    return
  }
  if (!extractedFileUrl.value) {
    renewError.value = 'Receipt upload didn\'t complete. Re-select the image and try again.'
    return
  }
  const amt = Number(renewForm.value.amount_paid)
  if (!(amt >= 0)) {
    renewError.value = 'Enter the amount paid.'
    return
  }
  renewSaving.value = true
  try {
    const tenantUuid = subscription.value.uuid || auth.tenantUuid || undefined
    const payload = {
      tenant_uuid: tenantUuid,
      subscription_plan_uuid: renewForm.value.subscription_plan_uuid,
      amount_paid: Number(renewForm.value.amount_paid) || 0,
      payment_attachment_url: extractedFileUrl.value,
      payment_reference_number: renewForm.value.payment_reference_number || undefined,
      payee_account_number: renewForm.value.payee_account_number || undefined,
      payment_method: renewForm.value.payment_method || undefined,
      payment_method_name: renewForm.value.payment_method_name || undefined,
      payment_datetime: fromDatetimeLocal(renewForm.value.payment_datetime),
      ai_extraction: extractionPayload.value || undefined
    }
    await paymentsApi.uploadPayment(payload)
    flash('Payment submitted — pending platform review ✓')
    discardReceiptPick()
    renewForm.value.amount_paid = ''
    renewForm.value.payment_reference_number = ''
    renewForm.value.payee_account_number = ''
    renewForm.value.payment_datetime = ''
    await loadPaymentHistory()
    await loadSubscriptionHistory()
    await reloadFromServer()
  } catch (e) {
    const raw = e?.message || ''
    if (/scheduled subscription already exists/i.test(raw)) {
      await loadSubscriptionHistory()
      renewError.value = 'You already have a subscription queued (shown in the "Next subscription queued" banner above). Wait until that cycle nears its expiry before submitting another payment.'
    } else {
      renewError.value = raw || 'Failed to submit payment'
    }
  } finally {
    renewSaving.value = false
  }
}

/* ─── Payment history ─── */
const payments = ref([])
const paymentsLoading = ref(false)
const paymentsError = ref('')

// Available plans for selection. The plans endpoint is admin-only server-side,
// but we still attempt the fetch: an admin token or a permissive backend will
// populate the list; a 403 silently degrades to the payment-history fallback.
const plansLoadError = ref('')
async function loadAvailablePlans() {
  plansLoadError.value = ''
  try {
    await plans.fetchAll({ status: ['active'] })
  } catch (e) {
    plansLoadError.value = e?.message || ''
  }
}

// Best-effort friendly label for a plan uuid: first from the loaded plans list,
// otherwise from the tenant's own past payment rows.
function planLabel(uuid) {
  if (!uuid) return null
  const fromPlans = plans.items.find(p => p.uuid === uuid)
  if (fromPlans) {
    return {
      code: fromPlans.code,
      name: fromPlans.name,
      price: Number(fromPlans.price) || 0,
      days: Number(fromPlans.days_duration) || 0
    }
  }
  const approved = payments.value.find(p => p.subscription_plan_uuid === uuid && p.payment_status === 'approved')
  const anyMatch = approved || payments.value.find(p => p.subscription_plan_uuid === uuid)
  if (anyMatch) {
    return {
      code: anyMatch.subscription_plan_code,
      name: anyMatch.subscription_plan_name,
      price: Number(anyMatch.subscription_plan_amount) || 0,
      days: Number(anyMatch.subscription_days) || 0
    }
  }
  return null
}

const availablePlans = computed(() =>
  plans.items.filter(p => {
    const isActive = p.status ? p.status === 'active' : p.active !== false
    const price = Number(p.price) || 0
    return isActive && price > 0
  })
)
const selectedPlanUuid = computed(() => renewForm.value.subscription_plan_uuid || '')
const selectedPlan = computed(() =>
  plans.items.find(p => p.uuid === selectedPlanUuid.value) || null
)
const qrImageForPayment = computed(() =>
  (selectedPlan.value?.qrcode_for_payment ? assetUrl(selectedPlan.value.qrcode_for_payment) : '') ||
  PAY_INSTRUCTIONS.qrImageUrl
)
function pickPlan(uuid) {
  renewForm.value.subscription_plan_uuid = uuid
  // Default amount_paid to the plan price when the user hasn't already typed one,
  // or hadn't customised it away from the previously-selected plan's price.
  const plan = plans.items.find(p => p.uuid === uuid)
  const planPrice = Number(plan?.price) || 0
  const current = Number(renewForm.value.amount_paid) || 0
  if (!current) renewForm.value.amount_paid = planPrice
}

/* ─── PayPal Smart Button ─── */
// The button is only rendered when a client id is configured AND a plan is
// picked AND the tenant is eligible to submit a payment (same gate as the
// manual receipt path).
const paypalClientId = String(import.meta.env?.VITE_PAYPAL_CLIENT_ID || '').trim()
const paypalCurrency = String(import.meta.env?.VITE_PAYPAL_CURRENCY || 'PHP').trim()
const paypalEnabled = computed(() => !!paypalClientId)
const paypalContainerRef = ref(null)
const paypalStatus = ref('')       // last message ("Processing…", errors, etc.)
const paypalStatusTone = ref('slate')
const paypalRenderedForPlan = ref('')  // guards against re-render loops

let paypalButtons = null

function setPaypalStatus(msg, tone = 'slate') {
  paypalStatus.value = msg
  paypalStatusTone.value = tone
}

async function renderPaypalButton() {
  if (!paypalEnabled.value) return
  if (!renewOpen.value || !canSubmitPayment.value) return
  const planUuid = selectedPlanUuid.value
  if (!planUuid) return
  if (paypalRenderedForPlan.value === planUuid && paypalButtons) return

  await nextTick()
  const container = paypalContainerRef.value
  if (!container) return

  // Tear down any previous instance before re-rendering. onCancel / errors
  // don't destroy it, but a plan change should.
  try { paypalButtons?.close?.() } catch (_) { /* SDK may not be loaded yet */ }
  paypalButtons = null
  container.innerHTML = ''

  let paypal
  try {
    paypal = await loadPaypalSdk({ clientId: paypalClientId, currency: paypalCurrency })
  } catch (e) {
    setPaypalStatus(e?.message || 'Failed to load the PayPal SDK.', 'rose')
    return
  }

  const tenantUuid = subscription.value.uuid || auth.tenantUuid || undefined

  paypalButtons = paypal.Buttons({
    style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal' },
    async createOrder() {
      setPaypalStatus('Opening PayPal…', 'slate')
      try {
        const res = await paymentsApi.paypalCreateOrder({
          tenant_uuid: tenantUuid,
          subscription_plan_uuid: planUuid,
        })
        const orderId = res?.order_id || res?.data?.order_id
        if (!orderId) throw new Error('Backend did not return a PayPal order id.')
        return orderId
      } catch (e) {
        setPaypalStatus(e?.message || 'Could not start PayPal checkout.', 'rose')
        throw e
      }
    },
    async onApprove(data) {
      setPaypalStatus('Confirming payment…', 'slate')
      try {
        const res = await paymentsApi.paypalCaptureOrder({
          tenant_uuid: tenantUuid,
          order_id: data.orderID,
        })
        const mode = res?.activation_mode || res?.data?.activation_mode
        const msg = mode === 'immediate'
          ? 'Payment received — subscription activated.'
          : mode === 'scheduled'
            ? 'Payment received — subscription scheduled to activate on your current plan\'s expiry.'
            : 'Payment already processed.'
        setPaypalStatus(msg, 'emerald')
        flash(msg)
        await loadPaymentHistory()
        await loadSubscriptionHistory()
        await reloadFromServer()
      } catch (e) {
        const raw = e?.message || ''
        // Rule 2 collision — surface the already-scheduled banner instead of a
        // generic error, and force-refresh history so it becomes visible in
        // case this browser hadn't seen it yet.
        if (/scheduled subscription already exists/i.test(raw)) {
          await loadSubscriptionHistory()
          setPaypalStatus('You already have a subscription queued (see "Next subscription queued" at the top). No need to pay again yet.', 'rose')
        } else {
          setPaypalStatus(raw || 'Capture failed. If PayPal charged you, contact support with the order id: ' + data.orderID, 'rose')
        }
      }
    },
    onCancel() {
      setPaypalStatus('PayPal checkout cancelled.', 'slate')
    },
    onError(err) {
      setPaypalStatus(err?.message || 'PayPal reported an error.', 'rose')
    },
  })

  try {
    await paypalButtons.render(container)
    paypalRenderedForPlan.value = planUuid
  } catch (e) {
    setPaypalStatus(e?.message || 'Failed to render the PayPal button.', 'rose')
  }
}

watch(
  [selectedPlanUuid, () => renewOpen.value, () => canSubmitPayment.value, paypalEnabled],
  () => renderPaypalButton(),
  { flush: 'post' },
)

const featuresToList = (text) => String(text || '')
  .split(/\r?\n/)
  .map(s => s.trim())
  .filter(Boolean)

const receiptView = ref({ show: false, url: '', title: '' })
const receiptZoom = ref(1)
const ZOOM_MIN = 0.5
const ZOOM_MAX = 4
const ZOOM_STEP = 0.25

function openReceiptView(p) {
  if (!p?.payment_attachment_file) return
  receiptView.value = {
    show: true,
    url: assetUrl(p.payment_attachment_file),
    title: `Receipt — ${p.subscription_plan_name || p.subscription_plan_code || 'Payment'}`
  }
  receiptZoom.value = 1
}
function closeReceiptView() {
  receiptView.value = { show: false, url: '', title: '' }
  receiptZoom.value = 1
}
function zoomIn()    { receiptZoom.value = Math.min(ZOOM_MAX, +(receiptZoom.value + ZOOM_STEP).toFixed(2)) }
function zoomOut()   { receiptZoom.value = Math.max(ZOOM_MIN, +(receiptZoom.value - ZOOM_STEP).toFixed(2)) }
function zoomReset() { receiptZoom.value = 1 }
function onWheelZoom(e) {
  if (!receiptView.value.show) return
  e.preventDefault()
  if (e.deltaY < 0) zoomIn()
  else zoomOut()
}

async function loadPaymentHistory() {
  if (!subscription.value.uuid) return
  paymentsLoading.value = true
  paymentsError.value = ''
  try {
    const res = await paymentsApi.listPayments({
      tenant_uuid: subscription.value.uuid,
      page_size: 20
    })
    payments.value = Array.isArray(res?.results) ? res.results : []
  } catch (e) {
    paymentsError.value = e?.message || 'Failed to load payment history'
  } finally {
    paymentsLoading.value = false
  }
}

/* ─── Subscription history (server-authoritative) ─── */
const history = ref([])
const historyLoading = ref(false)
const historyError = ref('')

function addDaysISO(iso, days) {
  if (!iso) return null
  const d = new Date(String(iso).replace(' ', 'T'))
  if (isNaN(d.getTime())) return null
  d.setDate(d.getDate() + Number(days || 0))
  return d
}

async function loadSubscriptionHistory() {
  if (!subscription.value.uuid) return
  historyLoading.value = true
  historyError.value = ''
  try {
    const res = await historyApi.listForTenant(subscription.value.uuid)
    const rows = Array.isArray(res?.results) ? res.results
                : Array.isArray(res) ? res
                : []
    history.value = rows
  } catch (e) {
    historyError.value = e?.message || 'Failed to load subscription history'
  } finally {
    historyLoading.value = false
  }
}

// The next-in-line cycle. Populated by Rule 2 (near-expiry approvals) — the
// server accepts a new payment while the current plan still has ≤5 days left
// and queues it as 'scheduled' to activate at the current expiry. Shown as
// its own tile at the top so the tenant sees what's already queued and
// understands the "A scheduled subscription already exists" error if they try
// to submit another payment.
const scheduledCycle = computed(() =>
  history.value.find(h => (h.status || '').toLowerCase() === 'scheduled') || null
)

const subscriptionCycles = computed(() => {
  const now = Date.now()
  return history.value
    .map(h => {
      const start = h.subscription_start || h.start_date || null
      const startD = start ? new Date(String(start).replace(' ', 'T')) : null
      // Prefer a server-provided end; fall back to start + subscription_days.
      const explicitEnd = h.subscription_end || h.end_date || null
      const endD = explicitEnd
        ? new Date(String(explicitEnd).replace(' ', 'T'))
        : addDaysISO(start, h.subscription_days)
      let state = 'past'
      if (startD && startD.getTime() > now) state = 'upcoming'
      else if (endD && endD.getTime() >= now) state = 'current'
      return { ...h, _start: startD, _end: endD, _state: state }
    })
    .sort((a, b) => (b._start?.getTime() || 0) - (a._start?.getTime() || 0))
})

onMounted(async () => {
  await reloadFromServer()
  initRenewForm()
  loadAvailablePlans()
  loadPaymentHistory()
  loadSubscriptionHistory()
})
watch(() => subscription.value.current_subscription_plan_uuid, initRenewForm)

onBeforeUnmount(() => {
  if (renewFileUrl.value) URL.revokeObjectURL(renewFileUrl.value)
})
</script>

<template>
  <div class="space-y-4">
    <div class="card">
      <div class="card-header">
        <div>
          <div class="text-sm font-semibold text-slate-800">Subscription</div>
          <div class="text-xs text-slate-500">Your current plan, renewal, and payment history</div>
        </div>
        <div class="flex items-center gap-2">
          <span v-if="loading" class="text-xs text-brand-600">Refreshing…</span>
          <span v-if="subscriptionState === 'active'" class="badge-success">Active</span>
          <span v-else-if="subscriptionState === 'expiring-soon'" class="badge-warn">Expiring soon</span>
          <span v-else-if="subscriptionState === 'expired'" class="badge-danger">Expired</span>
          <span v-else class="badge-muted">No plan</span>
          <button class="btn-ghost !text-xs" :disabled="loading" @click="reloadFromServer">Reload</button>
        </div>
      </div>

      <transition name="fade">
        <div v-if="toast.show"
             class="border-t px-4 py-2 text-sm"
             :class="toast.tone === 'emerald'
                     ? 'border-emerald-100 bg-emerald-50 text-emerald-800'
                     : 'border-rose-100 bg-rose-50 text-rose-800'">
          {{ toast.msg }}
        </div>
      </transition>
      <div v-if="loadError" class="border-t border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-700">
        {{ loadError }}
      </div>

      <!-- Status block -->
      <div class="card-body grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div class="rounded-lg border border-slate-100 bg-slate-50 p-3">
          <div class="text-[10px] uppercase tracking-widest text-slate-500">Plan</div>
          <div class="mt-0.5 text-sm font-semibold text-slate-800 break-words">
            {{ planLabel(subscription.current_subscription_plan_uuid)?.name
               || planLabel(subscription.current_subscription_plan_uuid)?.code
               || (subscription.current_subscription_plan_uuid ? '—' : 'No plan on file') }}
          </div>
          <div v-if="planLabel(subscription.current_subscription_plan_uuid)?.code"
               class="text-[11px] font-mono text-slate-500">
            {{ planLabel(subscription.current_subscription_plan_uuid).code }}
          </div>
        </div>
        <div class="rounded-lg border border-slate-100 bg-slate-50 p-3">
          <div class="text-[10px] uppercase tracking-widest text-slate-500">Amount</div>
          <div class="mt-0.5 text-sm font-semibold text-slate-800">
            {{ subscription.current_subscription_plan_amount ? money(subscription.current_subscription_plan_amount) : '—' }}
          </div>
          <div class="text-[11px] text-slate-500">
            {{ subscription.current_subscription_days ? `${subscription.current_subscription_days} days` : '' }}
          </div>
        </div>
        <div class="rounded-lg border border-slate-100 bg-slate-50 p-3">
          <div class="text-[10px] uppercase tracking-widest text-slate-500">Started</div>
          <div class="mt-0.5 text-sm text-slate-800">{{ formatDate(subscription.current_subscription_start) || '—' }}</div>
        </div>
        <div class="rounded-lg border p-3"
             :class="subscriptionState === 'expired' ? 'border-rose-200 bg-rose-50'
                      : subscriptionState === 'expiring-soon' ? 'border-amber-200 bg-amber-50'
                      : 'border-slate-100 bg-slate-50'">
          <div class="text-[10px] uppercase tracking-widest text-slate-500">Expires</div>
          <div class="mt-0.5 text-sm text-slate-800">{{ formatDate(subscription.current_subscription_expiry) || '—' }}</div>
          <div v-if="subscriptionDaysRemaining != null" class="text-[11px]"
               :class="subscriptionState === 'expired' ? 'text-rose-700'
                        : subscriptionState === 'expiring-soon' ? 'text-amber-700'
                        : 'text-slate-500'">
            <template v-if="subscriptionDaysRemaining < 0">
              Expired {{ -subscriptionDaysRemaining }} day{{ subscriptionDaysRemaining === -1 ? '' : 's' }} ago
            </template>
            <template v-else>
              {{ subscriptionDaysRemaining }} day{{ subscriptionDaysRemaining === 1 ? '' : 's' }} remaining
            </template>
          </div>
        </div>
      </div>

      <!-- Scheduled subscription banner — visible only when a 'scheduled'
           history row exists. Explains what will happen at current-plan
           expiry and is what "A scheduled subscription already exists"
           errors are referring to. -->
      <div v-if="scheduledCycle"
           class="border-t border-brand-100 bg-brand-50/60 px-4 py-3">
        <div class="flex items-start gap-3">
          <svg viewBox="0 0 24 24" class="mt-0.5 h-5 w-5 shrink-0 text-brand-600" fill="none"
               stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
            <polyline points="9 16 11 18 15 14"/>
          </svg>
          <div class="min-w-0 flex-1">
            <div class="text-xs font-bold uppercase tracking-widest text-brand-700">Next subscription queued</div>
            <div class="mt-0.5 text-sm text-slate-800">
              <b>{{ scheduledCycle.subscription_plan_name || scheduledCycle.subscription_plan_code || 'Subscription plan' }}</b>
              <span v-if="scheduledCycle.subscription_plan_amount">
                · {{ money(scheduledCycle.subscription_plan_amount) }}
              </span>
              <span v-if="scheduledCycle.subscription_days">
                · {{ scheduledCycle.subscription_days }} day{{ scheduledCycle.subscription_days === 1 ? '' : 's' }}
              </span>
            </div>
            <div class="text-xs text-slate-600">
              Activates on <b>{{ formatDate(scheduledCycle.subscription_start) || '—' }}</b>
              (when your current plan expires) and runs until
              <b>{{ formatDate(scheduledCycle.subscription_end) || '—' }}</b>.
            </div>
            <div class="mt-1 text-[11px] text-slate-500">
              You've already paid — no need to submit another payment until this cycle nears its own expiry.
            </div>
          </div>
        </div>
      </div>

      <!-- Renewal form -->
      <div class="border-t border-slate-100 px-4 py-4">
        <button type="button"
                class="flex w-full items-center justify-between text-left"
                :aria-expanded="renewOpen"
                aria-controls="renew-form-body"
                @click="renewOpen = !renewOpen">
          <div>
            <div class="text-sm font-semibold text-slate-800">Submit Payment (Renew / Continue)</div>
            <div class="text-xs text-slate-500">Attach your GCash / bank-transfer receipt. Platform will review and activate.</div>
          </div>
          <span class="ml-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
                :title="renewOpen ? 'Collapse' : 'Expand'">
            <svg viewBox="0 0 24 24" class="h-4 w-4 transition-transform"
                 :class="renewOpen ? 'rotate-180' : ''"
                 fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </span>
        </button>

        <div v-if="!canSubmitPayment && renewOpen"
             id="renew-form-body"
             class="mt-3 rounded-md border px-3 py-2 text-xs"
             :class="scheduledCycle
                     ? 'border-brand-200 bg-brand-50 text-brand-900'
                     : 'border-slate-200 bg-slate-50 text-slate-700'">
          <div class="flex items-start gap-2">
            <svg viewBox="0 0 24 24" class="mt-0.5 h-4 w-4 shrink-0"
                 :class="scheduledCycle ? 'text-brand-600' : 'text-slate-500'"
                 fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            <div v-if="scheduledCycle">
              <div class="font-semibold">Next subscription already queued</div>
              <div class="mt-0.5">
                <b>{{ scheduledCycle.subscription_plan_name || scheduledCycle.subscription_plan_code || 'Your next plan' }}</b>
                will activate on <b>{{ formatDate(scheduledCycle.subscription_start) || '—' }}</b>
                when your current plan expires. You've already paid — no further action needed until that cycle nears its own expiry.
                See the <b>Next subscription queued</b> banner at the top for details.
              </div>
            </div>
            <div v-else-if="subscriptionState === 'none'">
              <div class="font-semibold text-slate-800">No subscription plan on file</div>
              <div class="mt-0.5">
                Your account hasn't been assigned a plan yet. The platform will provision an initial plan for you — payment submission opens once that plan enters its near-expiry window.
              </div>
            </div>
            <div v-else>
              <div class="font-semibold text-slate-800">Renewal not yet available</div>
              <div class="mt-0.5">
                Your subscription is still active. You'll be able to submit a payment once your plan enters its near-expiry window<span
                  v-if="Number(subscription.current_subscription_expiry_warning_days) > 0">
                  ({{ subscription.current_subscription_expiry_warning_days }} day{{ Number(subscription.current_subscription_expiry_warning_days) === 1 ? '' : 's' }} before expiry)</span>.
              </div>
            </div>
          </div>
        </div>

        <form v-show="renewOpen"
              class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2"
              :class="{ 'pointer-events-none select-none opacity-60': !canSubmitPayment }"
              :aria-disabled="!canSubmitPayment"
              @submit.prevent="submitRenewal">
          <div class="sm:col-span-2">
            <label class="label">Choose subscription plan *</label>

            <!-- Plan cards -->
            <div v-if="availablePlans.length" class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <button
                v-for="p in availablePlans"
                :key="p.uuid"
                type="button"
                @click="pickPlan(p.uuid)"
                class="relative rounded-xl border p-4 text-left transition"
                :class="selectedPlanUuid === p.uuid
                        ? 'border-brand-500 ring-2 ring-brand-200 bg-white shadow-sm'
                        : 'border-slate-200 bg-white hover:border-brand-300 hover:shadow-sm'"
              >
                <svg v-if="selectedPlanUuid === p.uuid"
                     viewBox="0 0 24 24" class="absolute right-2 top-2 h-4 w-4 text-brand-600"
                     fill="none" stroke="currentColor" stroke-width="3"
                     stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <div class="flex flex-wrap items-center gap-2">
                  <span class="rounded bg-brand-100 px-2 py-0.5 font-mono text-[10px] font-bold text-brand-700">{{ p.code }}</span>
                  <span v-if="p.uuid === subscription.current_subscription_plan_uuid" class="badge-success">Current</span>
                </div>
                <div class="mt-1 text-base font-bold text-slate-800">{{ p.name }}</div>
                <div class="mt-2 flex items-baseline gap-1">
                  <span class="text-xl font-black text-slate-900">{{ money(p.price) }}</span>
                  <span class="text-xs text-slate-500">
                    / {{ p.days_duration }} day{{ p.days_duration === 1 ? '' : 's' }}
                  </span>
                </div>

                <div v-if="p.days_warning_for_near_expiry" class="mt-1 text-[11px] text-slate-500">
                  🔔 Warn {{ p.days_warning_for_near_expiry }} day{{ p.days_warning_for_near_expiry === 1 ? '' : 's' }} before expiry
                </div>

                <ul v-if="featuresToList(p.features).length" class="mt-3 space-y-1 text-xs text-slate-600">
                  <li v-for="(f, i) in featuresToList(p.features)" :key="i" class="flex items-start gap-1.5">
                    <svg viewBox="0 0 24 24" class="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" fill="none" stroke="currentColor" stroke-width="2.5"
                         stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    <span>{{ f }}</span>
                  </li>
                </ul>
              </button>
            </div>

            <!-- Fallback: no plan list available (e.g. tenant token can't list plans) -->
            <div v-else class="space-y-2">
              <div v-if="selectedPlanUuid && planLabel(selectedPlanUuid)"
                   class="rounded-xl border border-brand-200 bg-brand-50/30 p-4">
                <div class="flex flex-wrap items-center gap-2">
                  <span v-if="planLabel(selectedPlanUuid).code"
                        class="rounded bg-brand-100 px-2 py-0.5 font-mono text-[10px] font-bold text-brand-700">
                    {{ planLabel(selectedPlanUuid).code }}
                  </span>
                  <span v-if="selectedPlanUuid === subscription.current_subscription_plan_uuid" class="badge-success">Current</span>
                </div>
                <div class="mt-1 text-base font-bold text-slate-800">
                  {{ planLabel(selectedPlanUuid).name || 'Subscription plan' }}
                </div>
                <div class="mt-2 flex items-baseline gap-1">
                  <span class="text-xl font-black text-slate-900">{{ money(planLabel(selectedPlanUuid).price) }}</span>
                  <span class="text-xs text-slate-500">
                    / {{ planLabel(selectedPlanUuid).days }} day{{ planLabel(selectedPlanUuid).days === 1 ? '' : 's' }}
                  </span>
                </div>
              </div>
              <input v-model="renewForm.subscription_plan_uuid" class="input font-mono"
                     placeholder="Paste subscription plan UUID" />
              <p class="text-[11px] text-slate-500">
                Enter any plan UUID to switch. The platform will confirm the plan on approval.
              </p>
            </div>
          </div>

          <!-- PayPal Smart Button — instant, auto-approved. Only shown when a
               VITE_PAYPAL_CLIENT_ID is configured. Sits above the manual
               receipt flow so tenants that prefer PayPal can skip the whole
               submit-and-wait dance. -->
          <div v-if="paypalEnabled && selectedPlanUuid && canSubmitPayment"
               class="sm:col-span-2 rounded-lg border border-brand-200 bg-brand-50/40 p-4">
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="text-sm font-semibold text-slate-800">Pay instantly with PayPal</div>
                <div class="mt-0.5 text-xs text-slate-600">
                  Skip the receipt upload — your subscription activates automatically as soon as PayPal confirms the payment.
                  <span v-if="selectedPlan">
                    You'll be charged <b>{{ money(selectedPlan.price) }}</b>
                    for <b>{{ selectedPlan.name }}</b>.
                  </span>
                </div>
              </div>
              <span class="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
                Recommended
              </span>
            </div>
            <div ref="paypalContainerRef" class="mt-3 min-h-[3rem]"></div>
            <div v-if="paypalStatus"
                 class="mt-2 rounded-md border px-3 py-2 text-xs"
                 :class="paypalStatusTone === 'emerald' ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : paypalStatusTone === 'rose' ? 'border-rose-200 bg-rose-50 text-rose-800'
                          : 'border-slate-200 bg-white text-slate-700'">
              {{ paypalStatus }}
            </div>
            <div class="mt-3 flex items-center gap-2 text-[11px] text-slate-500">
              <div class="h-px flex-1 bg-slate-200"></div>
              <span>or upload a receipt below</span>
              <div class="h-px flex-1 bg-slate-200"></div>
            </div>
          </div>

          <!-- LEFT: Payment instructions -->
          <div class="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div class="text-sm font-semibold text-slate-800">Payment Instructions</div>

            <!-- QR -->
            <div class="mt-3 flex flex-col items-center">
              <div class="flex aspect-square w-40 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white sm:w-48">
                <transition name="fade" mode="out-in">
                  <img v-if="qrImageForPayment" :key="qrImageForPayment"
                       :src="qrImageForPayment" class="h-full w-full object-contain" alt="Payment QR" />
                  <div v-else class="p-4 text-center text-xs text-slate-500">
                    <svg viewBox="0 0 24 24" class="mx-auto h-10 w-10 text-slate-300" fill="none" stroke="currentColor" stroke-width="1.5"
                         stroke-linecap="round" stroke-linejoin="round">
                      <rect x="3" y="3" width="7" height="7" rx="1"/>
                      <rect x="14" y="3" width="7" height="7" rx="1"/>
                      <rect x="3" y="14" width="7" height="7" rx="1"/>
                      <path d="M14 14h3v3h-3zM17 17h4M14 20h3M20 14v7"/>
                    </svg>
                    <div class="mt-2">Payment QR</div>
                    <div class="text-[10px] text-slate-400">
                      Select a plan first.
                    </div>
                  </div>
                </transition>
              </div>
              <div v-if="selectedPlan" class="mt-2 text-center">
                <div class="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Scan for</div>
                <div class="text-sm font-semibold text-slate-800">{{ selectedPlan.name }}</div>
                <div class="font-mono text-[10px] text-slate-500">{{ selectedPlan.code }} · {{ money(selectedPlan.price) }}</div>
              </div>
              <div v-else-if="!selectedPlanUuid" class="mt-2 text-center text-[11px] text-slate-500">
                Pick a plan above to load its QR.
              </div>
            </div>

            <!-- Steps + account -->
            <div class="mt-4 space-y-3 text-sm">
              <ol class="list-inside list-decimal space-y-1 text-slate-700">
                <li>Select subscription plan.</li>
                <li>Scan the QR code for payment using your payment app.</li>
                <li>Take a screenshot of the confirmation page (must show reference number).</li>
                <li>Fill in the form on the right and upload the screenshot. Platform will approve within 1–2 business day.</li>
              </ol>
              <div v-if="selectedPlan?.account_type || selectedPlan?.account_name || selectedPlan?.account_number"
                   class="rounded-md border border-slate-200 bg-white p-3 text-xs">
                <div class="font-semibold text-slate-700">
                  {{ selectedPlan.account_type
                     ? `Pay via ${accountTypeLabel(selectedPlan.account_type)}`
                     : 'Payee account' }}
                </div>
                <div class="mt-1 text-slate-600">
                  <b v-if="selectedPlan.account_name">{{ selectedPlan.account_name }}</b>
                  <br v-if="selectedPlan.account_name" />
                  <template v-if="selectedPlan.account_number">
                    Account No.:
                    <span class="font-mono">{{ selectedPlan.account_number }}</span>
                  </template>
                </div>
              </div>
            </div>
          </div>

          <!-- RIGHT: Receipt + AI-populatable payment details -->
          <div class="space-y-4">
            <div>
              <label class="label">Receipt image *</label>
              <div class="flex items-start gap-3">
                <div class="relative flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50">
                  <img v-if="renewFileUrl" :src="renewFileUrl" class="h-full w-full object-contain" />
                  <div v-else class="text-center text-[10px] text-slate-500 px-1">Upload a screenshot</div>
                  <div v-if="extractionBusy"
                       class="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-sm">
                    <svg viewBox="0 0 24 24" class="h-6 w-6 animate-spin text-brand-600" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 12a9 9 0 11-6.219-8.56"/>
                    </svg>
                  </div>
                </div>
                <div class="flex flex-col gap-2">
                  <label class="btn-secondary cursor-pointer !text-xs">
                    {{ renewFile ? 'Replace image' : 'Choose image' }}
                    <input id="renew-receipt-input" type="file" accept="image/*" class="hidden" @change="onReceiptPick" />
                  </label>
                  <button v-if="renewFile" type="button" class="btn-ghost !text-xs" @click="discardReceiptPick">Discard</button>
                  <p class="text-[11px] text-slate-500">
                    JPG/PNG/WebP, up to 10 MB. We'll try to auto-fill the fields below from the image.
                  </p>
                </div>
              </div>

              <div v-if="extractionMessage"
                   class="mt-2 rounded-md border px-3 py-2 text-xs"
                   :class="extractionTone === 'emerald' ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            : extractionTone === 'rose' ? 'border-rose-200 bg-rose-50 text-rose-800'
                            : 'border-slate-200 bg-slate-50 text-slate-700'">
                <div class="flex items-start gap-2">
                  <svg v-if="extractionBusy" viewBox="0 0 24 24" class="mt-0.5 h-3.5 w-3.5 animate-spin shrink-0" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 12a9 9 0 11-6.219-8.56"/>
                  </svg>
                  <svg v-else-if="extractionTone === 'emerald'" viewBox="0 0 24 24" class="mt-0.5 h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" stroke-width="2.5"
                       stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  <span>{{ extractionMessage }}</span>
                </div>
              </div>
            </div>

            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div class="sm:col-span-2">
                <label class="label">Amount paid *</label>
                <div class="relative">
                  <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-500">₱</span>
                  <input v-model.number="renewForm.amount_paid" type="number" min="0" step="0.01"
                         class="input pl-7 font-mono" placeholder="0.00" required />
                </div>
              </div>
              <div>
                <label class="label">Payment method</label>
                <select v-model="renewForm.payment_method" class="input">
                  <option v-for="m in PAYMENT_METHODS" :key="m.value" :value="m.value">{{ m.label }}</option>
                </select>
              </div>
              <div>
                <label class="label">Method name</label>
                <input v-model="renewForm.payment_method_name" class="input" placeholder="e.g. GCash, BDO Online" />
              </div>
              <div>
                <label class="label">Reference number</label>
                <input v-model="renewForm.payment_reference_number" class="input font-mono" placeholder="Shown on your receipt" />
              </div>
              <div>
                <label class="label">Payee account number</label>
                <input v-model="renewForm.payee_account_number" class="input font-mono" placeholder="Account you paid to" />
              </div>
              <div class="sm:col-span-2">
                <label class="label">Payment date &amp; time</label>
                <input v-model="renewForm.payment_datetime" type="datetime-local" class="input" />
              </div>
            </div>
          </div>

          <div v-if="renewError" class="sm:col-span-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {{ renewError }}
          </div>

          <div class="sm:col-span-2 flex justify-end">
            <button type="submit" class="btn-primary" :disabled="renewSaving || !canSubmitPayment">
              {{ renewSaving ? 'Submitting…' : 'Submit payment for review' }}
            </button>
          </div>
        </form>
      </div>

      <!-- Payment history -->
      <div class="border-t border-slate-100 px-4 py-4">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-sm font-semibold text-slate-800">Payment history</div>
            <div class="text-xs text-slate-500">Most recent submissions</div>
          </div>
          <button class="btn-ghost !text-xs" :disabled="paymentsLoading" @click="loadPaymentHistory">Refresh</button>
        </div>
        <div v-if="paymentsError" class="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ paymentsError }}
        </div>
        <div class="mt-2 overflow-x-auto">
          <table class="table">
            <thead>
              <tr>
                <th>Submitted</th>
                <th>Plan</th>
                <th class="text-right">Plan Price</th>
                <th class="text-right">Amount Paid</th>
                <th>Method</th>
                <th>Reference</th>
                <th>Status</th>
                <th class="text-right">Receipt</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="paymentsLoading && !payments.length">
                <td colspan="8" class="py-4 text-center text-sm text-slate-500">Loading…</td>
              </tr>
              <tr v-else-if="!payments.length">
                <td colspan="8" class="py-4 text-center text-sm text-slate-500">No payments submitted yet.</td>
              </tr>
              <tr v-for="p in payments" :key="p.uuid">
                <td class="text-xs text-slate-600">{{ formatDateTime(p.created_at) }}</td>
                <td>
                  <div class="font-semibold text-slate-800">{{ p.subscription_plan_name || p.subscription_plan_code || '—' }}</div>
                  <div class="text-[10px] text-slate-500 font-mono">{{ p.subscription_plan_code }}</div>
                </td>
                <td class="text-right text-slate-700">{{ money(p.subscription_plan_amount) }}</td>
                <td class="text-right font-semibold text-slate-800">
                  {{ p.amount_paid != null ? money(p.amount_paid) : '—' }}
                  <div v-if="p.amount_paid != null && Number(p.amount_paid) !== Number(p.subscription_plan_amount)"
                       class="text-[10px] font-normal"
                       :class="Number(p.amount_paid) < Number(p.subscription_plan_amount) ? 'text-rose-600' : 'text-emerald-600'">
                    {{ Number(p.amount_paid) < Number(p.subscription_plan_amount) ? 'Short' : 'Over' }}
                    by {{ money(Math.abs(Number(p.amount_paid) - Number(p.subscription_plan_amount))) }}
                  </div>
                </td>
                <td class="text-xs">
                  {{ p.payment_method_name || p.payment_method || '—' }}
                </td>
                <td class="font-mono text-[11px]">{{ p.payment_reference_number || '—' }}</td>
                <td>
                  <span v-if="p.payment_status === 'approved'" class="badge-success">Approved</span>
                  <span v-else-if="p.payment_status === 'rejected'" class="badge-danger" :title="p.rejection_reason || ''">Rejected</span>
                  <span v-else class="badge-warn">Pending</span>
                </td>
                <td class="text-right">
                  <button v-if="p.payment_attachment_file" type="button"
                          class="text-xs font-semibold text-brand-600 hover:underline"
                          @click="openReceiptView(p)">View</button>
                  <span v-else class="text-xs text-slate-400">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Subscription history -->
      <div class="border-t border-slate-100 px-4 py-4">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-sm font-semibold text-slate-800">Subscription history</div>
            <div class="text-xs text-slate-500">Every activated cycle for this store</div>
          </div>
          <button class="btn-ghost !text-xs" :disabled="historyLoading" @click="loadSubscriptionHistory">Refresh</button>
        </div>
        <div v-if="historyError" class="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ historyError }}
        </div>
        <div class="mt-2 overflow-x-auto">
          <table class="table">
            <thead>
              <tr>
                <th>Plan</th>
                <th>Period</th>
                <th class="text-right">Duration</th>
                <th class="text-right">Amount</th>
                <th>Activated</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="historyLoading && !subscriptionCycles.length">
                <td colspan="6" class="py-4 text-center text-sm text-slate-500">Loading…</td>
              </tr>
              <tr v-else-if="!subscriptionCycles.length">
                <td colspan="6" class="py-4 text-center text-sm text-slate-500">
                  No subscription cycles on record yet.
                </td>
              </tr>
              <tr v-for="c in subscriptionCycles" :key="c.uuid"
                  :class="c._state === 'current' ? 'bg-emerald-50/40' : ''">
                <td>
                  <div class="font-semibold text-slate-800">
                    {{ c.subscription_plan_name || c.subscription_plan_code || '—' }}
                  </div>
                  <div class="text-[10px] text-slate-500 font-mono">{{ c.subscription_plan_code }}</div>
                </td>
                <td class="text-xs text-slate-700">
                  {{ formatDate(c.subscription_start || c.start_date) }}
                  <span class="text-slate-400"> → </span>
                  {{ c._end ? formatDate(c._end.toISOString()) : '—' }}
                </td>
                <td class="text-right text-xs text-slate-700">
                  {{ c.subscription_days ? `${c.subscription_days} days` : '—' }}
                </td>
                <td class="text-right font-semibold text-slate-800">
                  {{ c.amount_paid != null ? money(c.amount_paid) : money(c.subscription_plan_amount) }}
                </td>
                <td class="text-xs text-slate-600">
                  {{ formatDateTime(c.activated_at || c.reviewed_at || c.updated_at || c.created_at) }}
                </td>
                <td>
                  <span v-if="c._state === 'current'" class="badge-success">Current</span>
                  <span v-else-if="c._state === 'upcoming'" class="badge-info">Upcoming</span>
                  <span v-else class="badge-muted">Ended</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Receipt image preview -->
    <Modal :show="receiptView.show" :title="receiptView.title" size="xl" @close="closeReceiptView">
      <!-- Zoom toolbar -->
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div class="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white p-1 shadow-sm">
          <button type="button" class="btn-icon !h-7 !w-7" :disabled="receiptZoom <= ZOOM_MIN"
                  title="Zoom out" @click="zoomOut">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="7"/>
              <line x1="8" y1="11" x2="14" y2="11"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </button>
          <div class="min-w-[3.5rem] px-2 text-center font-mono text-xs text-slate-700 select-none">
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
          <div class="mx-1 h-4 w-px bg-slate-200" />
          <button type="button" class="btn-icon !h-7 !w-7" :disabled="receiptZoom === 1"
                  title="Reset zoom" @click="zoomReset">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <polyline points="1 4 1 10 7 10"/>
              <path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
            </svg>
          </button>
        </div>
        <div class="text-[10px] text-slate-500">Scroll wheel to zoom · drag scrollbars to pan</div>
      </div>

      <div class="max-h-[75vh] overflow-auto bg-slate-100 rounded-lg"
           @wheel="onWheelZoom">
        <div class="flex min-h-[50vh] items-center justify-center p-2">
          <img v-if="receiptView.url" :src="receiptView.url"
               :style="{ zoom: receiptZoom, transition: 'zoom 120ms ease-out' }"
               class="max-h-[70vh] w-auto object-contain select-none"
               draggable="false"
               alt="Payment receipt" />
        </div>
      </div>
      <template #footer>
        <a v-if="receiptView.url" :href="receiptView.url" target="_blank" rel="noopener"
           class="btn-secondary !text-xs">Open original</a>
        <button class="btn-primary" @click="closeReceiptView">Close</button>
      </template>
    </Modal>
  </div>
</template>
