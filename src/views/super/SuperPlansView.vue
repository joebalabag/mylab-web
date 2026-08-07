<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { usePlansStore } from '../../stores/plans'
import Modal from '../../components/Modal.vue'
import ConfirmDialog from '../../components/ConfirmDialog.vue'
import EmptyState from '../../components/EmptyState.vue'
import RowActionMenu from '../../components/RowActionMenu.vue'
import SkeletonRows from '../../components/SkeletonRows.vue'
import { assetUrl } from '../../api/client'
import { money, formatDateTime } from '../../utils/format'
import * as plansApi from '../../api/subscriptionPlans'

const plans = usePlansStore()

const search = ref('')
const statusFilter = ref('')

// Mobile-only collapse — hide the filter row by default on phones so the
// plans grid lands above the fold. Tablet/desktop always show it inline.
const filtersOpen = ref(false)
const filtersSummary = computed(() => {
  const parts = []
  if (search.value.trim()) parts.push(`"${search.value.trim()}"`)
  if (statusFilter.value)  parts.push(statusFilter.value === 'active' ? 'Active' : 'Inactive')
  return parts.length ? parts.join(' · ') : 'All plans'
})

const isActive = (p) => p.status ? p.status === 'active' : p.active !== false

async function reload() {
  try {
    await plans.fetchAll({
      keywords: search.value.trim() || undefined,
      status: statusFilter.value ? [statusFilter.value] : undefined
    })
  } catch (_) { /* store already recorded error */ }
}

onMounted(reload)

let searchTimer = null
watch(search, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(reload, 300)
})
watch(statusFilter, reload)

const rows = computed(() => plans.items)

const featuresToList = (text) => String(text || '')
  .split(/\r?\n/)
  .map(s => s.trim())
  .filter(Boolean)

const flashMsg = ref('')
const flashTone = ref('emerald')
let flashTimer = null
function flash(m, tone = 'emerald') {
  flashMsg.value = m
  flashTone.value = tone
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => flashMsg.value = '', 2500)
}

// Payment channel presets — mix of Philippine e-wallets and the common banks.
// "Other" lets admins type a free-form label via account_name.
const ACCOUNT_TYPES = [
  { value: 'gcash',      label: 'GCash' },
  { value: 'maya',       label: 'Maya' },
  { value: 'paypal',     label: 'PayPal' },
  { value: 'bdo',        label: 'BDO' },
  { value: 'bpi',        label: 'BPI' },
  { value: 'metrobank',  label: 'Metrobank' },
  { value: 'unionbank',  label: 'UnionBank' },
  { value: 'landbank',   label: 'Landbank' },
  { value: 'rcbc',       label: 'RCBC' },
  { value: 'security_bank', label: 'Security Bank' },
  { value: 'other',      label: 'Other' }
]
const accountTypeLabel = (v) => ACCOUNT_TYPES.find(x => x.value === v)?.label || v || ''

const emptyForm = () => ({
  code: '',
  name: '',
  price: 0,
  days_duration: 30,
  days_warning_for_near_expiry: 7,
  features: '',
  account_type: '',
  account_name: '',
  account_number: '',
  is_trial: false
})

const showForm = ref(false)
const editing = ref(null)
const form = ref(emptyForm())
const formError = ref('')
const saving = ref(false)

/* ─── Price change history ─── */
// Lazy-loaded each time the Edit modal opens or a stand-alone History modal
// is opened. Reused between the two so a plan viewed / edited / re-viewed in
// the same session doesn't repeat the network call unless the user hits Refresh.
const priceHistory = ref([])
const priceHistoryLoading = ref(false)
const priceHistoryError = ref('')
const priceHistoryPlanUuid = ref('')

const showHistoryModal = ref(false)
const historyPlan = ref(null)

async function loadPriceHistory(uuid) {
  if (!uuid) { priceHistory.value = []; priceHistoryPlanUuid.value = ''; return }
  priceHistoryLoading.value = true
  priceHistoryError.value = ''
  priceHistoryPlanUuid.value = uuid
  try {
    const res = await plansApi.listPriceHistory(uuid)
    // api client returns the unwrapped payload; be defensive about shape.
    priceHistory.value = Array.isArray(res) ? res : (res?.results || [])
  } catch (e) {
    priceHistory.value = []
    priceHistoryError.value = e?.message || 'Failed to load price history'
  } finally {
    priceHistoryLoading.value = false
  }
}

function openHistory(p) {
  historyPlan.value = p
  showHistoryModal.value = true
  loadPriceHistory(p.uuid)
}

function priceSourceLabel(s) {
  if (s === 'create') return 'Created'
  if (s === 'edit') return 'Edited'
  return s || '—'
}
function priceSourceTone(s) {
  if (s === 'create') return 'bg-emerald-100 text-emerald-700'
  return 'bg-slate-100 text-slate-700'
}
function pricePctChange(oldVal, newVal) {
  const o = Number(oldVal)
  const n = Number(newVal)
  if (!Number.isFinite(o) || !Number.isFinite(n) || o === 0) return null
  return ((n - o) / o) * 100
}

/* ─── QR image upload ─── */
const qrFile = ref(null)
const qrObjectUrl = ref('')
const qrExisting = ref('')  // server-relative URL of the current image when editing

function releaseQrObjectUrl() {
  if (qrObjectUrl.value) URL.revokeObjectURL(qrObjectUrl.value)
  qrObjectUrl.value = ''
}
onBeforeUnmount(releaseQrObjectUrl)

function onQrPick(e) {
  const file = e.target.files?.[0]
  if (!file) return
  qrFile.value = file
  releaseQrObjectUrl()
  qrObjectUrl.value = URL.createObjectURL(file)
}
function discardQrPick() {
  qrFile.value = null
  releaseQrObjectUrl()
  const el = document.getElementById('plan-qr-input')
  if (el) el.value = ''
}

const qrPreviewSrc = computed(() =>
  qrObjectUrl.value || (qrExisting.value ? assetUrl(qrExisting.value) : '')
)

function openAdd() {
  editing.value = null
  form.value = emptyForm()
  formError.value = ''
  qrFile.value = null
  qrExisting.value = ''
  releaseQrObjectUrl()
  priceHistory.value = []
  priceHistoryError.value = ''
  priceHistoryPlanUuid.value = ''
  showForm.value = true
}
function openEdit(p) {
  editing.value = p
  form.value = {
    code: p.code || '',
    name: p.name || '',
    price: Number(p.price) || 0,
    days_duration: Number(p.days_duration) || 30,
    days_warning_for_near_expiry: Number(p.days_warning_for_near_expiry) || 7,
    features: p.features || '',
    account_type:   p.account_type   || '',
    account_name:   p.account_name   || '',
    account_number: p.account_number || '',
    is_trial: !!p.is_trial
  }
  formError.value = ''
  qrFile.value = null
  qrExisting.value = p.qrcode_for_payment || ''
  releaseQrObjectUrl()
  showForm.value = true
  loadPriceHistory(p.uuid)
}

async function submit() {
  formError.value = ''
  const code = form.value.code.trim().toUpperCase()
  const name = form.value.name.trim()
  if (!code) { formError.value = 'Plan code is required'; return }
  if (!name) { formError.value = 'Plan name is required'; return }
  if (!(form.value.days_duration >= 1)) {
    formError.value = 'Duration must be at least 1 day'; return
  }
  if (!(form.value.price >= 0)) {
    formError.value = 'Price must be zero or more'; return
  }

  // Trial plans are enforced free by the API. Coerce the price here so the
  // admin never accidentally submits a paid trial and gets a 400 back.
  const isTrial = !!form.value.is_trial
  const price = isTrial ? 0 : (Number(form.value.price) || 0)

  // POS modules + terminal cap were retired from the UI — send empty array +
  // null so the API-side columns clear out and don't gate any tenant.
  const payload = {
    code,
    name,
    price,
    days_duration: Number(form.value.days_duration),
    days_warning_for_near_expiry: Number(form.value.days_warning_for_near_expiry) || 0,
    features: form.value.features?.trim() || undefined,
    account_type:   form.value.account_type   || undefined,
    account_name:   form.value.account_name?.trim()   || undefined,
    account_number: form.value.account_number?.trim() || undefined,
    allowed_modules: [],
    max_terminals: null,
    is_trial: isTrial
  }

  saving.value = true
  try {
    if (editing.value) {
      const priorPrice = Number(editing.value.price ?? 0)
      await plans.update(editing.value.uuid, payload, qrFile.value)
      flash(`Updated ${name}`)
      // If price actually moved, refresh the history so the new entry shows
      // up before the modal closes — otherwise the panel would go stale.
      if (Number(payload.price ?? 0) !== priorPrice) {
        await loadPriceHistory(editing.value.uuid)
      }
    } else {
      await plans.create(payload, qrFile.value)
      flash(`Created ${code} · ${name}`)
    }
    showForm.value = false
    qrFile.value = null
    qrExisting.value = ''
    releaseQrObjectUrl()
  } catch (e) {
    formError.value = e?.message || 'Save failed'
  } finally {
    saving.value = false
  }
}

const confirmStatus = ref({ show: false, plan: null, nextStatus: null })
function askToggleStatus(p) {
  confirmStatus.value = { show: true, plan: p, nextStatus: isActive(p) ? 'inactive' : 'active' }
}
async function doToggleStatus() {
  const { plan, nextStatus } = confirmStatus.value
  try {
    await plans.setStatus(plan.uuid, nextStatus)
    flash(`${plan.name} is now ${nextStatus}`)
  } catch (e) {
    flash(e?.message || 'Failed to update status', 'rose')
  }
  confirmStatus.value = { show: false, plan: null, nextStatus: null }
}

const confirmDelete = ref({ show: false, plan: null })
function askDelete(p) {
  confirmDelete.value = { show: true, plan: p }
}
async function doDelete() {
  const p = confirmDelete.value.plan
  try {
    await plans.remove(p.uuid)
    flash(`Deleted ${p.name}`)
  } catch (e) {
    flash(e?.message || 'Failed to delete', 'rose')
  }
  confirmDelete.value = { show: false, plan: null }
}
</script>

<template>
  <div class="flex h-full flex-col gap-4">
    <div class="card flex flex-1 min-h-0 flex-col overflow-hidden">
      <div class="card-header">
        <div>
          <div class="text-sm font-semibold text-slate-800">Subscription Plans</div>
          <div class="text-xs text-slate-500">
            {{ rows.length }} record{{ rows.length === 1 ? '' : 's' }}
            <span v-if="plans.loading" class="ml-1 text-indigo-600">· loading…</span>
          </div>
        </div>
        <button class="btn-primary" @click="openAdd">
          <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New Plan
        </button>
      </div>

      <!-- Mobile-only collapse toggle. sm:hidden so tablet/desktop always
           show the filter row inline. Matches the ReportsView pattern. -->
      <button
        type="button"
        class="flex w-full items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2 text-left text-sm text-slate-700 sm:hidden"
        :aria-expanded="filtersOpen"
        aria-controls="super-plans-filters"
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

      <div
        id="super-plans-filters"
        class="gap-2 border-b border-slate-100 p-4 grid-cols-1 sm:grid-cols-2"
        :class="filtersOpen ? 'grid' : 'hidden sm:grid'"
      >
        <input v-model="search" class="input" placeholder="Search by code, name, features…" />
        <select v-model="statusFilter" class="input">
          <option value="">All statuses</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
        </select>
      </div>

      <transition name="fade">
        <div v-if="flashMsg" class="border-b px-4 py-2 text-sm"
             :class="flashTone === 'rose'
                     ? 'border-rose-100 bg-rose-50 text-rose-700'
                     : 'border-emerald-100 bg-emerald-50 text-emerald-700'">
          {{ flashMsg }}
        </div>
      </transition>
      <div v-if="plans.error" class="border-b border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-700">
        {{ plans.error }}
      </div>

      <div class="min-h-0 flex-1 overflow-auto">
        <SkeletonRows v-if="plans.loading && !rows.length" :rows="4" :cols="3" />
        <div v-else-if="!rows.length" class="p-4">
          <EmptyState title="No plans found" message="Adjust filters or create a new subscription plan." />
        </div>

        <div v-else class="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="p in rows"
            :key="p.uuid"
            class="relative rounded-xl border p-4 transition"
            :class="isActive(p) ? 'border-slate-200 bg-white hover:border-indigo-300 hover:shadow-sm' : 'border-slate-200 bg-slate-50 opacity-70'"
          >
            <div class="absolute right-2 top-2">
              <RowActionMenu :actions="[
                { label: 'Edit', icon: 'edit', onClick: () => openEdit(p) },
                { label: 'Price history', icon: 'history', onClick: () => openHistory(p) },
                { label: isActive(p) ? 'Deactivate' : 'Activate',
                  icon: isActive(p) ? 'deactivate' : 'activate',
                  variant: isActive(p) ? 'danger' : 'success',
                  onClick: () => askToggleStatus(p) },
                { divider: true },
                { label: 'Delete', icon: 'trash', variant: 'danger', onClick: () => askDelete(p) }
              ]" />
            </div>

            <div class="flex items-center gap-2">
              <span class="rounded bg-indigo-100 px-2 py-0.5 font-mono text-[10px] font-bold text-indigo-700">{{ p.code }}</span>
              <span v-if="!isActive(p)" class="badge-danger">Inactive</span>
              <span v-if="p.is_trial"
                    class="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700"
                    title="Offered on the public register page.">
                Trial
              </span>
              <span v-if="p.qrcode_for_payment"
                    class="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700"
                    title="QR configured">
                <svg viewBox="0 0 24 24" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="7" height="7" rx="1"/>
                  <rect x="14" y="3" width="7" height="7" rx="1"/>
                  <rect x="3" y="14" width="7" height="7" rx="1"/>
                </svg>
                QR
              </span>
            </div>
            <div class="mt-1 flex items-start gap-3">
              <div class="flex-1 text-lg font-bold text-slate-800">{{ p.name }}</div>
              <img v-if="p.qrcode_for_payment" :src="assetUrl(p.qrcode_for_payment)"
                   class="h-12 w-12 shrink-0 rounded border border-slate-200 object-contain bg-white"
                   alt="Plan QR" />
            </div>

            <div class="mt-3 flex items-baseline gap-1">
              <span class="text-2xl font-black text-slate-900">{{ money(p.price) }}</span>
              <span class="text-xs text-slate-500">/ {{ p.days_duration }} day{{ p.days_duration === 1 ? '' : 's' }}</span>
            </div>

            <div v-if="p.days_warning_for_near_expiry" class="mt-2 text-xs text-slate-600">
              🔔 Warn {{ p.days_warning_for_near_expiry }} day{{ p.days_warning_for_near_expiry === 1 ? '' : 's' }} before expiry
            </div>

            <div v-if="p.account_type || p.account_number || p.account_name"
                 class="mt-3 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-600">
              <div class="flex items-center gap-1">
                <span class="font-semibold text-slate-700">{{ accountTypeLabel(p.account_type) || 'Payee' }}</span>
                <span v-if="p.account_number" class="font-mono">· {{ p.account_number }}</span>
              </div>
              <div v-if="p.account_name" class="truncate">{{ p.account_name }}</div>
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
          </div>
        </div>
      </div>
    </div>

    <!-- Add / Edit Modal -->
    <Modal :show="showForm" :title="editing ? 'Edit Plan' : 'New Plan'" size="lg" @close="showForm = false">
      <form class="space-y-4" @submit.prevent="submit">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label class="label">Plan Code *</label>
            <input v-model="form.code" class="input font-mono uppercase" placeholder="e.g. PRO-30" required />
          </div>
          <div>
            <label class="label">Plan Name *</label>
            <input v-model="form.name" class="input" placeholder="e.g. Pro (Monthly)" required />
          </div>
          <div>
            <label class="label">Price (₱) *</label>
            <input v-model.number="form.price" type="number" min="0" step="0.01" class="input"
                   :disabled="form.is_trial"
                   :required="!form.is_trial" />
            <p v-if="form.is_trial" class="mt-1 text-[11px] text-emerald-600">
              Trials are always free — price is locked to ₱0.
            </p>
          </div>
          <div>
            <label class="label">Duration (days) *</label>
            <input v-model.number="form.days_duration" type="number" min="1" step="1" class="input" required />
          </div>
          <div class="sm:col-span-2">
            <label class="label">Days warning before expiry</label>
            <input v-model.number="form.days_warning_for_near_expiry" type="number" min="0" step="1" class="input"
                   placeholder="e.g. 7" />
            <p class="mt-1 text-[11px] text-slate-500">Tenants will start seeing a renewal reminder this many days before their plan ends.</p>
          </div>

          <div class="sm:col-span-2 rounded-lg border border-emerald-100 bg-emerald-50/40 p-3">
            <label class="flex cursor-pointer items-start gap-2">
              <input type="checkbox" v-model="form.is_trial"
                     class="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
              <span class="flex-1">
                <span class="block text-sm font-semibold text-slate-800">Offer as a trial on the public register page</span>
                <span class="block text-[11px] text-slate-600">
                  When on, this plan appears as a pickable option when new stores register. Trials are always free (price locked to ₱0). The plan still respects the modules + terminal cap you set above.
                </span>
              </span>
            </label>
          </div>
          <div class="sm:col-span-2">
            <label class="label">Features (one per line)</label>
            <textarea v-model="form.features" rows="4" class="input"
                      placeholder="Barcode scanner&#10;Multi-branch&#10;Priority support"></textarea>
            <p class="mt-1 text-[11px] text-slate-500">Free-form text — each non-blank line becomes a bullet point.</p>
          </div>

          <div class="sm:col-span-2 rounded-lg border border-slate-100 bg-slate-50 p-3">
            <div class="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">Payee account</div>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label class="label">Account type</label>
                <select v-model="form.account_type" class="input">
                  <option value="">— Select channel —</option>
                  <option v-for="a in ACCOUNT_TYPES" :key="a.value" :value="a.value">{{ a.label }}</option>
                </select>
              </div>
              <div>
                <label class="label">Account number</label>
                <input v-model="form.account_number" class="input font-mono"
                       placeholder="e.g. 0917 000 0000 / 0000 0000 0000" />
              </div>
              <div class="sm:col-span-2">
                <label class="label">Account name</label>
                <input v-model="form.account_name" class="input"
                       placeholder="Registered account holder name" />
                <p class="mt-1 text-[11px] text-slate-500">Shown to tenants alongside the QR when they pay for this plan.</p>
              </div>
            </div>
          </div>

          <div class="sm:col-span-2">
            <label class="label">QR code for payment</label>
            <div class="flex items-start gap-3">
              <div class="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50">
                <img v-if="qrPreviewSrc" :src="qrPreviewSrc" class="h-full w-full object-contain" alt="Plan QR" />
                <div v-else class="text-center text-[10px] text-slate-500 px-1">
                  <svg viewBox="0 0 24 24" class="mx-auto h-8 w-8 text-slate-300" fill="none" stroke="currentColor" stroke-width="1.5"
                       stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1"/>
                    <rect x="14" y="3" width="7" height="7" rx="1"/>
                    <rect x="3" y="14" width="7" height="7" rx="1"/>
                    <path d="M14 14h3v3h-3zM17 17h4M14 20h3M20 14v7"/>
                  </svg>
                  <div class="mt-1">No QR</div>
                </div>
              </div>
              <div class="flex flex-col gap-2">
                <label class="btn-secondary cursor-pointer !text-xs">
                  {{ qrExisting || qrFile ? 'Replace image' : 'Upload image' }}
                  <input id="plan-qr-input" type="file" accept="image/*" class="hidden" @change="onQrPick" />
                </label>
                <button v-if="qrFile" type="button" class="btn-ghost !text-xs" @click="discardQrPick">Discard pick</button>
                <p class="text-[11px] text-slate-500">
                  JPG / PNG / WebP / GIF / SVG, up to 5 MB. This QR is shown to tenants when they choose this plan.
                </p>
              </div>
            </div>
          </div>
        </div>
        <div v-if="formError" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ formError }}
        </div>
      </form>

      <!-- Price change history — only meaningful when editing an existing plan.
           New plans have no history yet; the first entry is created server-side. -->
      <section v-if="editing" class="mt-6 border-t border-slate-100 pt-4">
        <div class="mb-2 flex items-center justify-between">
          <div>
            <div class="text-sm font-semibold text-slate-800">Price change history</div>
            <div class="text-[11px] text-slate-500">
              Append-only log — an entry is written whenever this plan's price changes.
              <span v-if="priceHistory.length">{{ priceHistory.length }} entr{{ priceHistory.length === 1 ? 'y' : 'ies' }}.</span>
            </div>
          </div>
          <button type="button" class="btn-secondary !text-xs"
                  :disabled="priceHistoryLoading"
                  @click="loadPriceHistory(editing.uuid)">
            {{ priceHistoryLoading ? 'Loading…' : 'Refresh' }}
          </button>
        </div>

        <div v-if="priceHistoryError"
             class="mb-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {{ priceHistoryError }}
        </div>

        <div class="overflow-x-auto rounded-lg border border-slate-100">
          <table class="table text-xs">
            <thead class="bg-slate-50">
              <tr>
                <th class="text-left">When</th>
                <th>Source</th>
                <th class="text-right">Price</th>
                <th class="text-left">Changed by</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!priceHistoryLoading && !priceHistory.length">
                <td colspan="4" class="p-4 text-center text-slate-500">
                  No price changes recorded yet.
                </td>
              </tr>
              <tr v-for="row in priceHistory" :key="row.uuid">
                <td class="text-slate-700">{{ formatDateTime(row.changed_at) }}</td>
                <td>
                  <span class="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                        :class="priceSourceTone(row.source)">
                    {{ priceSourceLabel(row.source) }}
                  </span>
                </td>
                <td class="text-right font-mono">
                  <span v-if="row.old_price != null" class="text-slate-400">
                    {{ money(row.old_price) }} →
                  </span>
                  <b class="text-slate-800">{{ money(row.new_price) }}</b>
                  <div v-if="pricePctChange(row.old_price, row.new_price) != null"
                       class="mt-0.5 text-[10px]"
                       :class="pricePctChange(row.old_price, row.new_price) > 0
                               ? 'text-emerald-700'
                               : pricePctChange(row.old_price, row.new_price) < 0
                                 ? 'text-rose-700'
                                 : 'text-slate-500'">
                    {{ pricePctChange(row.old_price, row.new_price) > 0 ? '+' : '' }}{{ pricePctChange(row.old_price, row.new_price).toFixed(2) }}%
                  </div>
                </td>
                <td class="text-slate-700">{{ row.changed_by || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <template #footer>
        <button class="btn-secondary" :disabled="saving" @click="showForm = false">Cancel</button>
        <button class="btn-primary" :disabled="saving" @click="submit">
          {{ saving ? 'Saving…' : (editing ? 'Save Changes' : 'Create Plan') }}
        </button>
      </template>
    </Modal>

    <!-- Stand-alone Price history modal — reachable from the row menu so
         admins can audit price movement without entering the edit form. -->
    <Modal :show="showHistoryModal"
           :title="historyPlan ? `Price history · ${historyPlan.code} · ${historyPlan.name}` : 'Price history'"
           size="lg"
           @close="showHistoryModal = false">
      <div v-if="historyPlan" class="space-y-3">
        <div class="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <div>
            Current price
            <b class="ml-1 font-mono text-sm text-slate-800">{{ money(historyPlan.price) }}</b>
            <span class="text-slate-500"> / {{ historyPlan.days_duration }} day{{ historyPlan.days_duration === 1 ? '' : 's' }}</span>
          </div>
          <button type="button" class="btn-secondary !text-xs"
                  :disabled="priceHistoryLoading"
                  @click="loadPriceHistory(historyPlan.uuid)">
            {{ priceHistoryLoading ? 'Loading…' : 'Refresh' }}
          </button>
        </div>

        <div v-if="priceHistoryError"
             class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {{ priceHistoryError }}
        </div>

        <div class="overflow-x-auto rounded-lg border border-slate-100">
          <table class="table text-xs">
            <thead class="bg-slate-50">
              <tr>
                <th class="text-left">When</th>
                <th>Source</th>
                <th class="text-right">Price</th>
                <th class="text-left">Changed by</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!priceHistoryLoading && !priceHistory.length">
                <td colspan="4" class="p-4 text-center text-slate-500">
                  No price changes recorded yet.
                </td>
              </tr>
              <tr v-for="row in priceHistory" :key="row.uuid">
                <td class="text-slate-700">{{ formatDateTime(row.changed_at) }}</td>
                <td>
                  <span class="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                        :class="priceSourceTone(row.source)">
                    {{ priceSourceLabel(row.source) }}
                  </span>
                </td>
                <td class="text-right font-mono">
                  <span v-if="row.old_price != null" class="text-slate-400">
                    {{ money(row.old_price) }} →
                  </span>
                  <b class="text-slate-800">{{ money(row.new_price) }}</b>
                  <div v-if="pricePctChange(row.old_price, row.new_price) != null"
                       class="mt-0.5 text-[10px]"
                       :class="pricePctChange(row.old_price, row.new_price) > 0
                               ? 'text-emerald-700'
                               : pricePctChange(row.old_price, row.new_price) < 0
                                 ? 'text-rose-700'
                                 : 'text-slate-500'">
                    {{ pricePctChange(row.old_price, row.new_price) > 0 ? '+' : '' }}{{ pricePctChange(row.old_price, row.new_price).toFixed(2) }}%
                  </div>
                </td>
                <td class="text-slate-700">{{ row.changed_by || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="showHistoryModal = false">Close</button>
      </template>
    </Modal>

    <ConfirmDialog
      :show="confirmStatus.show"
      :title="confirmStatus.nextStatus === 'active' ? 'Activate Plan?' : 'Deactivate Plan?'"
      :message="confirmStatus.plan
        ? `${confirmStatus.plan.name} will ${confirmStatus.nextStatus === 'active' ? 'be offered to new tenants' : 'no longer appear as a selectable plan (existing tenants keep it)'}.`
        : ''"
      :confirm-text="confirmStatus.nextStatus === 'active' ? 'Activate' : 'Deactivate'"
      :danger="confirmStatus.nextStatus !== 'active'"
      @close="confirmStatus = { show: false, plan: null, nextStatus: null }"
      @confirm="doToggleStatus"
    />
    <ConfirmDialog
      :show="confirmDelete.show"
      title="Delete Plan?"
      :message="confirmDelete.plan
        ? `This will permanently remove ${confirmDelete.plan.code} · ${confirmDelete.plan.name}. This cannot be undone.`
        : ''"
      confirm-text="Delete"
      @close="confirmDelete = { show: false, plan: null }"
      @confirm="doDelete"
    />
  </div>
</template>
