<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useTenantStore } from '../../stores/tenant'
import { useUsersStore } from '../../stores/users'
import { usePlansStore } from '../../stores/plans'
import { useAccessTemplateStore } from '../../stores/accessTemplate'
import * as tenantsApi from '../../api/tenants'
import * as userAccessApi from '../../api/userAccess'
import * as historyApi from '../../api/tenantSubscriptionHistory'
import Modal from '../../components/Modal.vue'
import ConfirmDialog from '../../components/ConfirmDialog.vue'
import EmptyState from '../../components/EmptyState.vue'
import SkeletonRows from '../../components/SkeletonRows.vue'
import RowActionMenu from '../../components/RowActionMenu.vue'
import { formatDate, formatDateTime, money } from '../../utils/format'
import { randomPassword, makeAdminUsername } from '../../utils/generate'
import { assetUrl } from '../../api/client'
import { allTimezones, DEFAULT_TIMEZONE } from '../../utils/timezones'

const TIMEZONES = allTimezones()

const tenants = useTenantStore()
const users   = useUsersStore()
const plans   = usePlansStore()
const accessTemplate = useAccessTemplateStore()

const search       = ref('')
const statusFilter = ref('')

// Mobile-only collapse — hide the filter row by default on phones so the
// tenants table lands above the fold. Tablet/desktop always show it inline.
const filtersOpen = ref(false)
const filtersSummary = computed(() => {
  const parts = []
  if (search.value.trim()) parts.push(`"${search.value.trim()}"`)
  if (statusFilter.value)  parts.push(statusFilter.value === 'active' ? 'Active' : 'Inactive')
  return parts.length ? parts.join(' · ') : 'All tenants'
})
const loading      = ref(false)
const listError    = ref('')

async function loadTenants() {
  loading.value = true
  listError.value = ''
  try {
    await tenants.fetchAllFromApi({
      keywords: search.value.trim() || undefined,
      status: statusFilter.value ? [statusFilter.value] : []
    })
  } catch (e) {
    listError.value = e?.message || 'Failed to load tenants'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadTenants()
  // Best-effort — needed by the "Alter subscription plan" modal's plan picker.
  plans.fetchAll({ status: ['active'] }).catch(() => {})
})

function onSearchEnter()  { loadTenants() }
function onFilterChange() { loadTenants() }

const filtered = computed(() => tenants.all)

const flashMsg = ref('')
let flashTimer = null
function flash(m) {
  flashMsg.value = m
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => flashMsg.value = '', 2500)
}

const emptyForm = () => ({
  display_name: '',
  legal_name: '',
  owner_name: '',
  store_code: '',
  branch: '',
  terminal_id: '',
  currency: 'PHP',
  timezone: DEFAULT_TIMEZONE,
  address_street1: '',
  address_street2: '',
  city: '',
  province: '',
  postal_code: '',
  country: 'Philippines',
  contact_number: '',
  email_address: '',
  website: '',
  tin_number: '',
  is_vat_registered: false,
  show_tin_on_receipt: true,
  receipt_header: '',
  receipt_footer: '',
  receipt_show_logo: true
})

const showForm  = ref(false)
const editing   = ref(null)
const form      = ref(emptyForm())
const formError = ref('')
const submitting = ref(false)

// Logo state — file to upload, blob preview, existing URL when editing
const logoFile      = ref(null)
const logoObjectUrl = ref('')
const existingLogo  = ref('')
function releaseObjectUrl() {
  if (logoObjectUrl.value) URL.revokeObjectURL(logoObjectUrl.value)
  logoObjectUrl.value = ''
}
watch(showForm, (open) => { if (!open) releaseObjectUrl() })

function onLogoPick(e) {
  const file = e.target.files?.[0]
  if (!file) return
  logoFile.value = file
  releaseObjectUrl()
  logoObjectUrl.value = URL.createObjectURL(file)
}
function clearPickedLogo() {
  logoFile.value = null
  releaseObjectUrl()
}
const logoPreviewSrc = computed(() =>
  logoObjectUrl.value || (existingLogo.value ? assetUrl(existingLogo.value) : '')
)

function openAdd() {
  editing.value = null
  form.value = emptyForm()
  logoFile.value = null
  existingLogo.value = ''
  releaseObjectUrl()
  formError.value = ''
  showForm.value = true
}
function openEdit(t) {
  editing.value = t
  form.value = {
    display_name:      t.display_name       || '',
    legal_name:        t.legal_name         || '',
    owner_name:        t.owner_name         || '',
    store_code:        t.store_code         || '',
    branch:            t.branch             || '',
    terminal_id:       t.terminal_id        || '',
    currency:          t.currency           || 'PHP',
    timezone:          t.timezone           || DEFAULT_TIMEZONE,
    address_street1:   t.address_street1    || '',
    address_street2:   t.address_street2    || '',
    city:              t.city               || '',
    province:          t.province           || '',
    postal_code:       t.postal_code        || '',
    country:           t.country            || 'Philippines',
    contact_number:    t.contact_number     || '',
    email_address:     t.email_address      || '',
    website:           t.website            || '',
    tin_number:        t.tin_number         || '',
    is_vat_registered:  !!t.is_vat_registered,
    show_tin_on_receipt:!!t.show_tin_on_receipt,
    receipt_header:    t.receipt_header     || '',
    receipt_footer:    t.receipt_footer     || '',
    receipt_show_logo:  !!t.receipt_show_logo
  }
  logoFile.value = null
  releaseObjectUrl()
  existingLogo.value = t.company_logo || ''
  formError.value = ''
  showForm.value = true
}

/* ─── Credentials modal (auto-provisioned admin) ─── */
const credentials = ref(null)   // { tenant, username, password }
const copiedField = ref('')

function copyValue(kind, value) {
  const write = (typeof navigator !== 'undefined' && navigator.clipboard)
    ? navigator.clipboard.writeText(value)
    : Promise.reject()
  write.catch(() => {
    const ta = document.createElement('textarea')
    ta.value = value
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy') } catch (_) { /* ignore */ }
    document.body.removeChild(ta)
  }).finally(() => {
    copiedField.value = kind
    setTimeout(() => { if (copiedField.value === kind) copiedField.value = '' }, 1500)
  })
}
function copyAllCredentials() {
  const c = credentials.value
  if (!c) return
  const block = [
    `Store:    ${c.tenant.display_name} (${c.tenant.store_code})`,
    `Sign-in:  /login`,
    `Username: ${c.username}`,
    `Password: ${c.password}`
  ].join('\n')
  copyValue('all', block)
}

async function submit() {
  formError.value = ''
  if (!form.value.display_name.trim()) { formError.value = 'Store name is required'; return }
  if (!editing.value && !form.value.store_code.trim()) {
    formError.value = 'Store code is required'
    return
  }
  // On create, the tenant's contact email is copied to the auto-provisioned
  // admin account, so it needs to be present and valid.
  if (!editing.value) {
    const email = form.value.email_address.trim()
    if (!email) {
      formError.value = 'Contact email is required — it becomes the auto-provisioned admin\'s email'
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      formError.value = 'Contact email is not a valid email address'
      return
    }
  }

  // When editing an existing tenant, changing the timezone shifts the
  // wall-clock interpretation of any scheduled discount rules already on the
  // books. Confirm before persisting so a super-admin doesn't silently move
  // every "Senior Tuesday 6–9pm" by hours.
  if (editing.value && form.value.timezone && editing.value.timezone && form.value.timezone !== editing.value.timezone) {
    const confirmed = window.confirm(
      `Change timezone from ${editing.value.timezone} to ${form.value.timezone}?\n\n` +
        'Scheduled discounts with day-of-week or time-of-day rules will be ' +
        'reinterpreted in the new zone (e.g. "Tuesday 6pm" becomes 6pm in ' +
        `${form.value.timezone} instead of ${editing.value.timezone}).`
    )
    if (!confirmed) return
  }

  submitting.value = true
  try {
    // Build the API payload — only non-empty values so the server keeps defaults for edits
    const apiPayload = {
      display_name:      form.value.display_name.trim(),
      legal_name:        form.value.legal_name.trim(),
      owner_name:        form.value.owner_name.trim(),
      store_code:        form.value.store_code.trim().toUpperCase(),
      branch:            form.value.branch.trim(),
      terminal_id:       form.value.terminal_id.trim(),
      currency:          form.value.currency.trim() || 'PHP',
      timezone:          form.value.timezone.trim() || DEFAULT_TIMEZONE,
      address_street1:   form.value.address_street1.trim(),
      address_street2:   form.value.address_street2.trim(),
      city:              form.value.city.trim(),
      province:          form.value.province.trim(),
      postal_code:       form.value.postal_code.trim(),
      country:           form.value.country.trim(),
      contact_number:    form.value.contact_number.trim(),
      email_address:     form.value.email_address.trim(),
      website:           form.value.website.trim(),
      tin_number:        form.value.tin_number.trim(),
      is_vat_registered:  !!form.value.is_vat_registered,
      show_tin_on_receipt:!!form.value.show_tin_on_receipt,
      receipt_header:    form.value.receipt_header.trim(),
      receipt_footer:    form.value.receipt_footer.trim(),
      receipt_show_logo:  !!form.value.receipt_show_logo
    }

    if (editing.value) {
      const updated = await tenants.updateTenantViaApi(editing.value.uuid, apiPayload, logoFile.value)
      flash(`Updated ${updated?.display_name || apiPayload.display_name}`)
      showForm.value = false
      return
    }

    // Create tenant, then auto-provision an admin user for it.
    const created = await tenants.createTenantViaApi(apiPayload, logoFile.value)
    if (!created?.uuid) throw new Error('Tenant creation returned no uuid')

    const usernameSet = new Set()
    for (const u of users.items) {
      if (u.username) usernameSet.add(u.username.toLowerCase())
    }
    const username = makeAdminUsername(created.store_code, usernameSet)
    const password = randomPassword(10)

    let userCreated = null
    try {
      userCreated = await users.create({
        tenant_uuid: created.uuid,
        username,
        password,
        confirm_password: password,
        name: `${created.display_name} Admin`,
        email: apiPayload.email_address || undefined,
        role: 'manager'
      })
    } catch (userErr) {
      console.warn('Auto-provision admin user failed:', userErr?.message || userErr)
    }

    // Auto-grant the new admin FULL access. If the template hasn't been loaded
    // yet (or the fetch fails), we still succeed on tenant creation — the
    // super admin can grant access manually from Tenant Users.
    let accessGranted = false
    if (userCreated?.uuid) {
      try {
        await accessTemplate.fetch()
        const items = accessTemplate.allNavigationIds.map(id => ({
          navigation_id: id,
          has_access:   true
        }))
        if (items.length) {
          await userAccessApi.saveUserAccess(userCreated.uuid, items)
          accessGranted = true
        }
      } catch (accessErr) {
        console.warn('Auto-grant admin access failed:', accessErr?.message || accessErr)
      }
    }

    flash(userCreated
      ? `Created ${created.display_name} · ${created.store_code} with admin @${username}${accessGranted ? ' (full access granted)' : ''}`
      : `Created ${created.display_name} · ${created.store_code} (admin user provisioning failed — set it up manually)`
    )
    showForm.value = false
    credentials.value = userCreated ? { tenant: created, username, password } : null
  } catch (e) {
    formError.value = e?.message || 'Failed to save tenant'
  } finally {
    submitting.value = false
  }
}

/* ─── Status / Delete ─── */
const confirmStatus = ref({ show: false, tenant: null, next: '' })
function askToggleStatus(t) {
  const next = (t.status === 'active') ? 'inactive' : 'active'
  confirmStatus.value = { show: true, tenant: t, next }
}
async function doToggleStatus() {
  const { tenant, next } = confirmStatus.value
  confirmStatus.value = { show: false, tenant: null, next: '' }
  try {
    await tenants.setTenantStatusViaApi(tenant.uuid, next)
    flash(`${tenant.display_name} is now ${next}`)
  } catch (e) {
    flash(e?.message || 'Failed to update status')
  }
}

/* ─── Per-row subscription snapshot helpers ─── */
function subscriptionDaysRemaining(t) {
  const exp = t?.current_subscription_expiry
  if (!exp) return null
  const expTs = new Date(String(exp).replace(' ', 'T')).getTime()
  if (isNaN(expTs)) return null
  return Math.ceil((expTs - Date.now()) / (1000 * 60 * 60 * 24))
}
function subscriptionState(t) {
  if (!t?.current_subscription_plan_uuid) return 'none'
  const remain = subscriptionDaysRemaining(t)
  if (remain == null) return 'active'
  if (remain < 0) return 'expired'
  const warn = Number(t.current_subscription_expiry_warning_days) || 0
  if (warn && remain <= warn) return 'expiring-soon'
  return 'active'
}
function subscriptionPlanLabel(t) {
  const p = plans.byUuid(t?.current_subscription_plan_uuid)
  if (p) return { name: p.name, code: p.code }
  return { name: null, code: null }
}

/* ─── Alter subscription plan ─── */
const alter = ref({
  show: false,
  tenant: null,
  plan_uuid: '',
  start_date: '',
  days: '',
  amount: '',
  reason: '',
  error: '',
  saving: false
})

// Convert "YYYY-MM-DD HH:mm:ss+08:00" (or full ISO) to the value a
// <input type="date"> expects ("YYYY-MM-DD"), in local time.
function toDateInputValue(iso) {
  if (!iso) return ''
  const d = new Date(String(iso).replace(' ', 'T'))
  if (isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Add a whole number of days to a "YYYY-MM-DD" and return the same shape.
function addDaysToDateInput(dateStr, days) {
  if (!dateStr) return ''
  const n = Number(days)
  if (!Number.isFinite(n)) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, (m || 1) - 1, d || 1)
  if (isNaN(dt.getTime())) return ''
  dt.setDate(dt.getDate() + n)
  const pad = (v) => String(v).padStart(2, '0')
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}

const alterPlans = computed(() =>
  plans.items.filter(p => (p.status ? p.status === 'active' : p.active !== false))
)
const alterSelectedPlan = computed(() =>
  plans.items.find(p => p.uuid === alter.value.plan_uuid) || null
)

// When the admin picks a different plan, prefill amount + duration from that
// plan. End date recomputes automatically via the watcher below.
function onAlterPlanChange() {
  const p = alterSelectedPlan.value
  if (!p) return
  if (p.price != null) alter.value.amount = Number(p.price) || 0
  if (p.days_duration != null) alter.value.days = Number(p.days_duration) || 0
}

function todayDateInputValue() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// End date is fully derived from start + days. A computed guarantees the
// input value updates the instant days duration changes. When no start date
// is on file yet, fall back to today so the end date is still meaningful.
const alterStartAnchor = computed(() => alter.value.start_date || todayDateInputValue())
const alterEndDate = computed(() => {
  const days = Number(alter.value.days)
  if (!(days > 0)) return ''
  return addDaysToDateInput(alterStartAnchor.value, days)
})

async function openAlterSubscription(t) {
  // Seed the modal with whatever the list row already has …
  alter.value = {
    show: true,
    tenant: t,
    plan_uuid:  t.current_subscription_plan_uuid || '',
    start_date: toDateInputValue(t.current_subscription_start),
    days:       t.current_subscription_days != null
                ? Number(t.current_subscription_days)
                : '',
    amount:     t.current_subscription_plan_amount != null
                ? Number(t.current_subscription_plan_amount)
                : '',
    reason: '',
    error: '',
    saving: false
  }
  // … then fetch the full record so start_date / days are guaranteed present
  // even when the list endpoint doesn't include the subscription snapshot.
  try {
    const full = await tenantsApi.viewTenant(t.uuid)
    if (!full || !alter.value.show || alter.value.tenant?.uuid !== t.uuid) return
    alter.value = {
      ...alter.value,
      tenant: { ...t, ...full },
      plan_uuid:  full.current_subscription_plan_uuid || alter.value.plan_uuid,
      start_date: toDateInputValue(full.current_subscription_start) || alter.value.start_date,
      days:       full.current_subscription_days != null
                  ? Number(full.current_subscription_days) : alter.value.days,
      amount:     full.current_subscription_plan_amount != null
                  ? Number(full.current_subscription_plan_amount) : alter.value.amount
    }
  } catch (_) { /* fall back to the row data */ }
}
function closeAlterSubscription() {
  alter.value = {
    show: false, tenant: null, plan_uuid: '', start_date: '', days: '',
    amount: '', reason: '', error: '', saving: false
  }
}
async function submitAlterSubscription() {
  alter.value.error = ''
  const t = alter.value.tenant
  if (!t?.uuid) return
  const reason = alter.value.reason.trim()
  if (!reason) {
    alter.value.error = 'Please provide a reason for the change.'
    return
  }

  const originalPlan = t.current_subscription_plan_uuid || ''
  const originalDays = t.current_subscription_days != null
    ? Number(t.current_subscription_days) : null
  const originalEnd  = toDateInputValue(t.current_subscription_expiry)
  const originalAmt  = t.current_subscription_plan_amount != null
    ? Number(t.current_subscription_plan_amount) : null

  const newPlan = alter.value.plan_uuid || ''
  const newDays = alter.value.days === '' ? null : Number(alter.value.days)
  const newEnd  = alterEndDate.value || ''
  const newAmt  = alter.value.amount === '' ? null : Number(alter.value.amount)

  if (newAmt != null && !(newAmt >= 0)) {
    alter.value.error = 'Amount must be zero or more.'
    return
  }
  if (newDays != null && !(newDays >= 0)) {
    alter.value.error = 'Days must be zero or more.'
    return
  }

  const changedPlan = newPlan  && newPlan  !== originalPlan
  const changedDays = newDays != null && newDays !== originalDays
  const changedEnd  = newEnd   && newEnd   !== originalEnd
  const changedAmt  = newAmt != null && newAmt !== originalAmt

  if (!changedPlan && !changedDays && !changedEnd && !changedAmt) {
    alter.value.error = 'Change at least one field before saving.'
    return
  }

  alter.value.saving = true
  try {
    const payload = { alter_reason: reason }
    if (changedPlan) payload.current_subscription_plan_uuid   = newPlan
    if (changedDays) payload.current_subscription_days        = newDays
    if (changedEnd)  payload.current_subscription_expiry      = newEnd
    if (changedAmt) payload.current_subscription_plan_amount  = newAmt
    await tenants.alterTenantSubscriptionViaApi(t.uuid, payload)
    flash(`Updated subscription for ${t.display_name}`)
    closeAlterSubscription()
  } catch (e) {
    alter.value.error = e?.message || 'Failed to alter subscription'
  } finally {
    alter.value.saving = false
  }
}

/* ─── View details modal ─── */
const details = ref({
  show: false,
  tenant: null,      // full tenant record (from viewTenant)
  history: [],       // subscription history rows for this tenant
  loading: false,
  error: '',
})

async function openDetails(t) {
  details.value = { show: true, tenant: t, history: [], loading: true, error: '' }
  try {
    const [full, hist] = await Promise.all([
      tenantsApi.viewTenant(t.uuid).catch(() => null),
      historyApi.listForTenant(t.uuid).catch((e) => { throw e }),
    ])
    if (!details.value.show || details.value.tenant?.uuid !== t.uuid) return
    const rows = Array.isArray(hist?.results) ? hist.results
                 : Array.isArray(hist) ? hist
                 : []
    details.value = {
      show: true,
      tenant: full ? { ...t, ...full } : t,
      history: rows,
      loading: false,
      error: '',
    }
  } catch (e) {
    if (!details.value.show) return
    details.value.error = e?.message || 'Failed to load details'
    details.value.loading = false
  }
}
function closeDetails() {
  details.value = { show: false, tenant: null, history: [], loading: false, error: '' }
}

// Sort history: current first, upcoming next, then past by most recent start.
const detailsHistorySorted = computed(() => {
  const now = Date.now()
  return [...details.value.history]
    .map(h => {
      const startISO = h.subscription_start || h.start_date
      const endISO   = h.subscription_end   || h.end_date
      const startD = startISO ? new Date(String(startISO).replace(' ', 'T')) : null
      const endD   = endISO   ? new Date(String(endISO).replace(' ', 'T'))   : null
      let state = 'past'
      const status = String(h.status || '').toLowerCase()
      if (status === 'scheduled' || (startD && startD.getTime() > now)) state = 'upcoming'
      else if (status === 'active' || (endD && endD.getTime() >= now && startD && startD.getTime() <= now)) state = 'current'
      return { ...h, _start: startD, _end: endD, _state: state, _status: status }
    })
    .sort((a, b) => {
      const rank = (s) => s === 'current' ? 0 : s === 'upcoming' ? 1 : 2
      const r = rank(a._state) - rank(b._state)
      if (r !== 0) return r
      return (b._start?.getTime() || 0) - (a._start?.getTime() || 0)
    })
})

const confirmDelete = ref({ show: false, tenant: null })
function askDelete(t) { confirmDelete.value = { show: true, tenant: t } }
async function doDelete() {
  const t = confirmDelete.value.tenant
  confirmDelete.value = { show: false, tenant: null }
  try {
    await tenants.removeTenantViaApi(t.uuid)
    flash(`Deleted ${t.display_name}`)
  } catch (e) {
    flash(e?.message || 'Failed to delete tenant')
  }
}
</script>

<template>
  <div class="flex h-full flex-col gap-4">
    <div class="card flex flex-1 min-h-0 flex-col overflow-hidden">
      <div class="card-header">
        <div>
          <div class="text-sm font-semibold text-slate-800">Tenants / Stores</div>
          <div class="text-xs text-slate-500">
            {{ filtered.length }} shown
            <span v-if="loading" class="ml-1 text-brand-600">· loading…</span>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button class="btn-secondary !px-3" @click="loadTenants" :disabled="loading" title="Refresh">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
          </button>
          <button class="btn-primary" @click="openAdd">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New Tenant
          </button>
        </div>
      </div>

      <!-- Mobile-only collapse toggle. sm:hidden so tablet/desktop always
           show the filter row inline. Matches the ReportsView pattern. -->
      <button
        type="button"
        class="flex w-full items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2 text-left text-sm text-slate-700 sm:hidden"
        :aria-expanded="filtersOpen"
        aria-controls="super-tenants-filters"
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
        id="super-tenants-filters"
        class="gap-2 border-b border-slate-100 p-4 grid-cols-1 sm:grid-cols-2"
        :class="filtersOpen ? 'grid' : 'hidden sm:grid'"
      >
        <input
          v-model="search"
          @keyup.enter="onSearchEnter"
          class="input"
          placeholder="Search by name, code, email, city… (Enter)"
        />
        <select v-model="statusFilter" @change="onFilterChange" class="input">
          <option value="">All statuses</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
        </select>
      </div>

      <transition name="fade">
        <div v-if="flashMsg" class="border-b border-emerald-100 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          {{ flashMsg }}
        </div>
      </transition>
      <div v-if="listError" class="border-b border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-700">
        {{ listError }}
      </div>

      <div class="min-h-0 flex-1 overflow-auto">
        <SkeletonRows
          v-if="loading && !filtered.length"
          :rows="6"
          label="Loading tenants…"
          :columns="['thumb','lines','wide','bar','pill','dot']"
        />
        <table v-else-if="filtered.length" class="table">
          <thead class="sticky top-0 z-10 bg-slate-50 shadow-[inset_0_-1px_0_theme(colors.slate.100)]">
            <tr>
              <th>Store</th>
              <th class="hidden md:table-cell">Contact</th>
              <th>Subscription</th>
              <th class="hidden lg:table-cell">Created</th>
              <th class="hidden lg:table-cell">Last active</th>
              <th>Status</th>
              <th class="w-14 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in filtered" :key="t.uuid">
              <td>
                <div class="flex items-center gap-3">
                  <div class="hidden h-10 w-10 shrink-0 overflow-hidden rounded-md bg-slate-100 sm:block">
                    <img v-if="t.company_logo" :src="assetUrl(t.company_logo)" class="h-full w-full object-contain" />
                    <div v-else class="flex h-full w-full items-center justify-center text-slate-400">
                      <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v10a1 1 0 001 1h14a1 1 0 001-1V9"/>
                      </svg>
                    </div>
                  </div>
                  <div class="min-w-0">
                    <div class="truncate font-semibold text-slate-800">{{ t.display_name }}</div>
                    <div class="text-xs text-slate-500">
                      <span class="font-mono">{{ t.store_code }}</span>
                      <span v-if="t.city"> · {{ t.city }}</span>
                    </div>
                  </div>
                </div>
              </td>
              <td class="hidden md:table-cell text-slate-700">
                <div v-if="t.email_address" class="text-sm">{{ t.email_address }}</div>
                <div v-if="t.contact_number" class="text-xs text-slate-500">{{ t.contact_number }}</div>
                <div v-if="!t.email_address && !t.contact_number" class="text-xs text-slate-400">—</div>
              </td>
              <td>
                <template v-if="subscriptionState(t) === 'none'">
                  <span class="badge-muted">No plan</span>
                </template>
                <template v-else>
                  <div class="flex items-center gap-1.5">
                    <span v-if="subscriptionState(t) === 'active'" class="badge-success">Active</span>
                    <span v-else-if="subscriptionState(t) === 'expiring-soon'" class="badge-warn">Expiring soon</span>
                    <span v-else class="badge-danger">Expired</span>
                    <span v-if="subscriptionPlanLabel(t).code"
                          class="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-700"
                          :title="subscriptionPlanLabel(t).name || ''">
                      {{ subscriptionPlanLabel(t).code }}
                    </span>
                  </div>
                  <div class="mt-0.5 text-[11px]"
                       :class="subscriptionState(t) === 'expired' ? 'text-rose-700'
                                : subscriptionState(t) === 'expiring-soon' ? 'text-amber-700'
                                : 'text-slate-500'">
                    <span>{{ formatDate(t.current_subscription_expiry) }}</span>
                    <span v-if="subscriptionDaysRemaining(t) != null">
                      · <template v-if="subscriptionDaysRemaining(t) < 0">
                          expired {{ -subscriptionDaysRemaining(t) }}d ago
                        </template>
                        <template v-else>
                          {{ subscriptionDaysRemaining(t) }}d left
                        </template>
                    </span>
                  </div>
                  <div v-if="t.current_subscription_plan_amount != null"
                       class="text-[10px] text-slate-500">
                    {{ money(t.current_subscription_plan_amount) }}
                    <span v-if="t.current_subscription_days">
                      · {{ t.current_subscription_days }}d
                    </span>
                  </div>
                </template>
                <!-- Next subscription queued (from tenant_subscription_history
                     where status='scheduled'). Attached to the row by
                     TenantService.listDashboard. -->
                <div v-if="t.next_subscription"
                     class="mt-1 flex items-start gap-1 rounded border border-indigo-200 bg-indigo-50 px-1.5 py-1 text-[11px] text-indigo-800">
                  <svg viewBox="0 0 24 24" class="mt-0.5 h-3 w-3 shrink-0"
                       fill="none" stroke="currentColor" stroke-width="2"
                       stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/>
                    <line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                    <polyline points="9 16 11 18 15 14"/>
                  </svg>
                  <div class="min-w-0">
                    <div class="font-semibold">
                      Next: {{ t.next_subscription.subscription_plan_name || t.next_subscription.subscription_plan_code }}
                    </div>
                    <div class="text-[10px]">
                      Activates {{ formatDate(t.next_subscription.subscription_start) }}
                      <span v-if="t.next_subscription.subscription_plan_amount != null">
                        · {{ money(t.next_subscription.subscription_plan_amount) }}
                      </span>
                      <span v-if="t.next_subscription.subscription_days">
                        · {{ t.next_subscription.subscription_days }}d
                      </span>
                    </div>
                  </div>
                </div>
              </td>
              <td class="hidden lg:table-cell text-xs text-slate-500">{{ formatDateTime(t.created_at) }}</td>
              <td class="hidden lg:table-cell text-xs text-slate-500">
                {{ formatDateTime(t.last_active_at || t.last_active || t.last_used_at || t.last_login_at) }}
              </td>
              <td>
                <span v-if="t.status === 'active'" class="badge-success">Active</span>
                <span v-else class="badge-danger">Inactive</span>
              </td>
              <td class="text-right">
                <RowActionMenu :actions="[
                  { label: 'View details', icon: 'eye', onClick: () => openDetails(t) },
                  { label: 'Edit', icon: 'edit', onClick: () => openEdit(t) },
                  { label: 'Alter subscription plan', icon: 'edit', onClick: () => openAlterSubscription(t) },
                  { label: (t.status === 'active') ? 'Deactivate' : 'Activate',
                    icon: (t.status === 'active') ? 'deactivate' : 'activate',
                    variant: (t.status === 'active') ? 'danger' : 'success',
                    onClick: () => askToggleStatus(t) },
                  { divider: true },
                  { label: 'Delete', icon: 'trash', variant: 'danger', onClick: () => askDelete(t) }
                ]" />
              </td>
            </tr>
          </tbody>
        </table>
        <EmptyState
          v-else-if="!loading"
          title="No tenants found"
          message="Adjust filters or create a new tenant."
        />
      </div>
    </div>

    <!-- Add / Edit Modal -->
    <Modal :show="showForm" :title="editing ? 'Edit Tenant' : 'New Tenant'" size="xl" @close="showForm = false">
      <div v-if="!editing" class="mb-3 flex items-start gap-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-800">
        <svg viewBox="0 0 24 24" class="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="16" x2="12" y2="12"/>
          <line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
        <div>
          Creating a new tenant will also provision an <b>Admin</b> user for the store, using the
          <b>Contact email</b> below as the admin's email. The username and password will be generated
          automatically and shown once after save — copy them then.
        </div>
      </div>
      <form class="max-h-[70vh] space-y-6 overflow-y-auto pr-1" @submit.prevent="submit">
        <!-- Identity -->
        <section class="space-y-3">
          <div class="text-xs font-bold uppercase tracking-widest text-slate-500">Company Identity</div>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <!-- Logo -->
            <div class="sm:col-span-1">
              <label class="label">Company Logo</label>
              <div class="flex h-32 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50">
                <img v-if="logoPreviewSrc" :src="logoPreviewSrc" class="h-full w-full object-contain" />
                <div v-else class="text-center text-xs text-slate-500">
                  <svg viewBox="0 0 24 24" class="mx-auto h-8 w-8 text-slate-300" fill="none" stroke="currentColor" stroke-width="1.5"
                       stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="5" width="18" height="14" rx="2"/>
                    <circle cx="8" cy="10" r="1.5"/>
                    <path d="M21 15l-5-5-8 8"/>
                  </svg>
                  No logo
                </div>
              </div>
              <div class="mt-2 flex flex-wrap gap-2">
                <label class="btn-secondary cursor-pointer !text-xs">
                  {{ existingLogo || logoFile ? 'Replace' : 'Upload' }}
                  <input type="file" accept="image/*" class="hidden" @change="onLogoPick" />
                </label>
                <button v-if="logoFile" type="button" class="btn-ghost !text-xs" @click="clearPickedLogo">Discard pick</button>
              </div>
            </div>

            <div class="sm:col-span-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label class="label">Store Code *</label>
                <input v-model="form.store_code" required class="input font-mono uppercase" placeholder="MNDG-001" />
              </div>
              <div>
                <label class="label">Store (Display) Name *</label>
                <input v-model="form.display_name" required class="input" placeholder="Corner Store" />
              </div>
              <div class="sm:col-span-2">
                <label class="label">Legal name</label>
                <input v-model="form.legal_name" class="input" placeholder="Registered business name" />
              </div>
              <div class="sm:col-span-2">
                <label class="label">Owner name</label>
                <input v-model="form.owner_name" autocomplete="name" class="input"
                       placeholder="Full name of the store owner" />
              </div>
              <div>
                <label class="label">Branch</label>
                <input v-model="form.branch" class="input" placeholder="Main Branch" />
              </div>
              <div>
                <label class="label">Terminal ID</label>
                <input v-model="form.terminal_id" class="input font-mono" placeholder="T01" />
              </div>
              <div>
                <label class="label">Currency</label>
                <input v-model="form.currency" class="input w-32" placeholder="PHP" />
              </div>
              <div>
                <label class="label">Timezone</label>
                <select v-model="form.timezone" class="input">
                  <option v-for="tz in TIMEZONES" :key="tz" :value="tz">{{ tz }}</option>
                </select>
                <p class="mt-1 text-[11px] text-slate-500">
                  Drives discount schedule rules (day / time windows). Changing this
                  reinterprets existing scheduled discounts in the new zone.
                </p>
              </div>
            </div>
          </div>
        </section>

        <!-- Contact -->
        <section class="space-y-3 border-t border-slate-100 pt-4">
          <div class="text-xs font-bold uppercase tracking-widest text-slate-500">Contact</div>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label class="label">
                Email
                <span v-if="!editing" class="text-rose-500">*</span>
              </label>
              <input v-model="form.email_address" type="email"
                     :required="!editing"
                     class="input" placeholder="hello@store.local" />
              <p v-if="!editing" class="mt-1 text-[11px] text-slate-500">
                This email becomes the auto-provisioned admin account's email.
              </p>
            </div>
            <div>
              <label class="label">Phone</label>
              <input v-model="form.contact_number" class="input" placeholder="+63 917 000 0000" />
            </div>
            <div class="sm:col-span-2">
              <label class="label">Website</label>
              <input v-model="form.website" class="input" placeholder="https://example.com" />
            </div>
          </div>
        </section>

        <!-- Address -->
        <section class="space-y-3 border-t border-slate-100 pt-4">
          <div class="text-xs font-bold uppercase tracking-widest text-slate-500">Address</div>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div class="sm:col-span-2">
              <label class="label">Street address 1</label>
              <input v-model="form.address_street1" class="input" placeholder="e.g. 123 Rizal St." />
            </div>
            <div class="sm:col-span-2">
              <label class="label">Street address 2</label>
              <input v-model="form.address_street2" class="input" placeholder="Optional" />
            </div>
            <div>
              <label class="label">City</label>
              <input v-model="form.city" class="input" />
            </div>
            <div>
              <label class="label">Province / State</label>
              <input v-model="form.province" class="input" />
            </div>
            <div>
              <label class="label">Postal code</label>
              <input v-model="form.postal_code" class="input font-mono" />
            </div>
            <div>
              <label class="label">Country</label>
              <input v-model="form.country" class="input" />
            </div>
          </div>
        </section>

        <!-- Tax & Receipt -->
        <section class="space-y-3 border-t border-slate-100 pt-4">
          <div class="text-xs font-bold uppercase tracking-widest text-slate-500">Tax &amp; Receipt</div>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label class="label">TIN</label>
              <input v-model="form.tin_number" class="input font-mono" placeholder="000-000-000-000" />
            </div>
            <div class="flex flex-col justify-end gap-2 sm:col-span-1">
              <label class="inline-flex items-center gap-2 text-sm">
                <input v-model="form.is_vat_registered" type="checkbox" class="h-4 w-4 rounded border-slate-300" />
                <span>VAT-registered</span>
              </label>
              <label class="inline-flex items-center gap-2 text-sm">
                <input v-model="form.show_tin_on_receipt" type="checkbox" class="h-4 w-4 rounded border-slate-300" />
                <span>Show TIN on receipt</span>
              </label>
              <label class="inline-flex items-center gap-2 text-sm">
                <input v-model="form.receipt_show_logo" type="checkbox" class="h-4 w-4 rounded border-slate-300" />
                <span>Show logo on receipt</span>
              </label>
            </div>
            <div class="sm:col-span-2">
              <label class="label">Receipt header text</label>
              <input v-model="form.receipt_header" class="input" placeholder="OFFICIAL RECEIPT" />
            </div>
            <div class="sm:col-span-2">
              <label class="label">Receipt footer text</label>
              <textarea v-model="form.receipt_footer" rows="2" class="input" placeholder="Thank you for choosing us!"></textarea>
            </div>
          </div>
        </section>

        <div v-if="formError" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ formError }}
        </div>
      </form>
      <template #footer>
        <button class="btn-secondary" :disabled="submitting" @click="showForm = false">Cancel</button>
        <button class="btn-primary" :disabled="submitting" @click="submit">
          {{ submitting ? 'Saving…' : (editing ? 'Save Changes' : 'Create Tenant') }}
        </button>
      </template>
    </Modal>

    <!-- Auto-generated admin credentials (shown ONCE) -->
    <Modal
      :show="!!credentials"
      title="Admin credentials generated"
      size="md"
      @close="credentials = null"
    >
      <div v-if="credentials" class="space-y-4">
        <div class="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <svg viewBox="0 0 24 24" class="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <div>
            This is the <b>only time</b> the password is shown. Copy it now and share it with the tenant admin securely.
          </div>
        </div>

        <div class="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Tenant</div>
          <div class="text-sm font-semibold text-slate-800">
            {{ credentials.tenant.display_name }}
            <span class="ml-1 font-mono text-xs text-slate-500">({{ credentials.tenant.store_code }})</span>
          </div>
        </div>

        <div>
          <div class="mb-1 flex items-center justify-between">
            <label class="label !mb-0">Username</label>
            <button
              class="text-xs font-semibold text-indigo-600 hover:underline"
              @click="copyValue('username', credentials.username)"
            >
              {{ copiedField === 'username' ? '✓ Copied' : 'Copy' }}
            </button>
          </div>
          <div class="rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-800 select-all">
            {{ credentials.username }}
          </div>
        </div>

        <div>
          <div class="mb-1 flex items-center justify-between">
            <label class="label !mb-0">Password</label>
            <button
              class="text-xs font-semibold text-indigo-600 hover:underline"
              @click="copyValue('password', credentials.password)"
            >
              {{ copiedField === 'password' ? '✓ Copied' : 'Copy' }}
            </button>
          </div>
          <div class="rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-800 select-all">
            {{ credentials.password }}
          </div>
        </div>

        <div class="text-xs text-slate-500">
          Role: <b class="text-slate-700">Manager</b> · Sign-in URL:
          <code class="rounded bg-slate-100 px-1.5 py-0.5 text-[11px]">/login</code>
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="copyAllCredentials">
          {{ copiedField === 'all' ? '✓ Copied' : 'Copy all' }}
        </button>
        <button class="btn-primary" @click="credentials = null">Done</button>
      </template>
    </Modal>

    <!-- Alter subscription plan -->
    <Modal :show="alter.show" title="Alter subscription plan" size="lg" @close="closeAlterSubscription">
      <div v-if="alter.tenant" class="space-y-4">
        <div class="rounded-lg border border-slate-100 bg-slate-50 p-3">
          <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Tenant</div>
          <div class="text-sm font-semibold text-slate-800">
            {{ alter.tenant.display_name }}
            <span class="ml-1 font-mono text-xs text-slate-500">({{ alter.tenant.store_code }})</span>
          </div>
        </div>

        <!-- Read-only snapshot of the current subscription -->
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div class="rounded-lg border border-slate-100 bg-white p-3">
            <div class="text-[10px] uppercase tracking-widest text-slate-500">Current plan</div>
            <div class="mt-0.5 text-sm font-semibold text-slate-800 truncate">
              {{ (plans.byUuid(alter.tenant.current_subscription_plan_uuid)?.name)
                 || (plans.byUuid(alter.tenant.current_subscription_plan_uuid)?.code)
                 || (alter.tenant.current_subscription_plan_uuid ? '—' : 'No plan') }}
            </div>
          </div>
          <div class="rounded-lg border border-slate-100 bg-white p-3">
            <div class="text-[10px] uppercase tracking-widest text-slate-500">Started</div>
            <div class="mt-0.5 text-sm text-slate-800">
              {{ formatDate(alter.tenant.current_subscription_start) }}
            </div>
          </div>
          <div class="rounded-lg border border-slate-100 bg-white p-3">
            <div class="text-[10px] uppercase tracking-widest text-slate-500">Ends</div>
            <div class="mt-0.5 text-sm text-slate-800">
              {{ formatDate(alter.tenant.current_subscription_expiry) }}
            </div>
          </div>
          <div class="rounded-lg border border-slate-100 bg-white p-3">
            <div class="text-[10px] uppercase tracking-widest text-slate-500">Amount</div>
            <div class="mt-0.5 text-sm text-slate-800">
              {{ alter.tenant.current_subscription_plan_amount != null
                 ? money(alter.tenant.current_subscription_plan_amount)
                 : '—' }}
            </div>
          </div>
        </div>

        <!-- Editable "new values" section -->
        <div class="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
          <div class="mb-3 text-xs font-semibold text-slate-700">New values</div>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div class="sm:col-span-2">
              <label class="label">Plan</label>
              <select v-model="alter.plan_uuid" class="input" @change="onAlterPlanChange">
                <option value="">— Keep current / no change —</option>
                <option v-for="p in alterPlans" :key="p.uuid" :value="p.uuid">
                  {{ p.name }} · {{ p.code }} · {{ money(p.price) }} / {{ p.days_duration }}d
                </option>
              </select>
              <p v-if="plans.loading" class="mt-1 text-[11px] text-indigo-600">Loading plans…</p>
              <p v-else-if="!alterPlans.length" class="mt-1 text-[11px] text-slate-500">
                No active plans available — you can still edit the date fields and amount below.
              </p>
              <p v-else class="mt-1 text-[11px] text-slate-500">
                Picking a plan will auto-fill the amount and days duration; you can still override.
              </p>
            </div>

            <div>
              <label class="label">Start date</label>
              <input :value="alterStartAnchor" type="date" class="input cursor-not-allowed bg-slate-100 text-slate-600"
                     readonly disabled />
              <p class="mt-1 text-[11px] text-slate-500">
                {{ alter.start_date ? "Locked to the current plan's start date." : 'No plan on file — defaults to today.' }}
              </p>
            </div>
            <div>
              <label class="label">Days duration</label>
              <input v-model.number="alter.days" type="number" min="0" step="1" class="input"
                     placeholder="e.g. 30" />
            </div>

            <div>
              <label class="label">End date</label>
              <input :value="alterEndDate" type="date" class="input cursor-not-allowed bg-slate-100 text-slate-600"
                     readonly disabled />
              <p class="mt-1 text-[11px] text-slate-500">Auto-filled from start date + days duration.</p>
            </div>
            <div>
              <label class="label">Amount (₱)</label>
              <input v-model.number="alter.amount" type="number" min="0" step="0.01" class="input"
                     placeholder="0.00" />
            </div>
          </div>
        </div>

        <div>
          <label class="label">Reason *</label>
          <textarea v-model="alter.reason" rows="3" class="input"
                    placeholder="e.g. Compensating for platform downtime — extended 14 days"></textarea>
          <p class="mt-1 text-[11px] text-slate-500">
            Recorded in the audit trail so future reviewers understand why this change was made.
          </p>
        </div>

        <div v-if="alter.error" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ alter.error }}
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" :disabled="alter.saving" @click="closeAlterSubscription">Cancel</button>
        <button class="btn-primary" :disabled="alter.saving" @click="submitAlterSubscription">
          {{ alter.saving ? 'Saving…' : 'Save Changes' }}
        </button>
      </template>
    </Modal>

    <!-- View details -->
    <Modal :show="details.show" title="Tenant details" size="xl" @close="closeDetails">
      <div v-if="details.tenant" class="max-h-[75vh] space-y-5 overflow-y-auto pr-1">
        <!-- Loading / error banners -->
        <div v-if="details.loading" class="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Loading…
        </div>
        <div v-if="details.error" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ details.error }}
        </div>

        <!-- Header: identity -->
        <section class="flex items-start gap-4 rounded-lg border border-slate-100 bg-slate-50 p-4">
          <div class="hidden h-16 w-16 shrink-0 overflow-hidden rounded-md bg-white sm:block">
            <img v-if="details.tenant.company_logo" :src="assetUrl(details.tenant.company_logo)" class="h-full w-full object-contain" />
            <div v-else class="flex h-full w-full items-center justify-center text-slate-300">
              <svg viewBox="0 0 24 24" class="h-8 w-8" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v10a1 1 0 001 1h14a1 1 0 001-1V9"/>
              </svg>
            </div>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <div class="text-base font-bold text-slate-800">{{ details.tenant.display_name }}</div>
              <span v-if="details.tenant.status === 'active'" class="badge-success">Active</span>
              <span v-else class="badge-danger">Inactive</span>
              <span class="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-700">
                {{ details.tenant.store_code }}
              </span>
            </div>
            <div v-if="details.tenant.legal_name" class="text-xs text-slate-500">{{ details.tenant.legal_name }}</div>
            <div v-if="details.tenant.owner_name" class="mt-1 text-xs text-slate-600">
              Owner: <b>{{ details.tenant.owner_name }}</b>
            </div>
            <div class="mt-1 text-[11px] text-slate-500">
              Created {{ formatDateTime(details.tenant.created_at) }}
              <span v-if="details.tenant.last_active_at || details.tenant.last_active || details.tenant.last_login_at">
                · Last active {{ formatDateTime(details.tenant.last_active_at || details.tenant.last_active || details.tenant.last_login_at) }}
              </span>
            </div>
          </div>
        </section>

        <!-- Contact + address -->
        <section class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div class="rounded-lg border border-slate-100 p-3">
            <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Contact</div>
            <dl class="mt-2 space-y-1 text-sm">
              <div class="flex justify-between gap-3">
                <dt class="text-slate-500">Email</dt>
                <dd class="text-slate-800 text-right break-all">{{ details.tenant.email_address || '—' }}</dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-slate-500">Phone</dt>
                <dd class="text-slate-800 text-right">{{ details.tenant.contact_number || '—' }}</dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-slate-500">Website</dt>
                <dd class="text-slate-800 text-right break-all">{{ details.tenant.website || '—' }}</dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-slate-500">Timezone</dt>
                <dd class="text-slate-800 text-right">{{ details.tenant.timezone || '—' }}</dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-slate-500">Currency</dt>
                <dd class="text-slate-800 text-right">{{ details.tenant.currency || '—' }}</dd>
              </div>
            </dl>
          </div>
          <div class="rounded-lg border border-slate-100 p-3">
            <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Address</div>
            <div class="mt-2 space-y-0.5 text-sm text-slate-800">
              <div v-if="details.tenant.address_street1">{{ details.tenant.address_street1 }}</div>
              <div v-if="details.tenant.address_street2">{{ details.tenant.address_street2 }}</div>
              <div v-if="details.tenant.city || details.tenant.province">
                {{ [details.tenant.city, details.tenant.province].filter(Boolean).join(', ') }}
              </div>
              <div v-if="details.tenant.postal_code || details.tenant.country">
                {{ [details.tenant.postal_code, details.tenant.country].filter(Boolean).join(' ') }}
              </div>
              <div v-if="!details.tenant.address_street1 && !details.tenant.city && !details.tenant.country"
                   class="text-slate-400">—</div>
            </div>
            <div class="mt-3 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
              <span v-if="details.tenant.tin_number">
                TIN: <span class="font-mono text-slate-700">{{ details.tenant.tin_number }}</span>
                <span v-if="details.tenant.is_vat_registered"> · VAT-Reg</span>
                <span v-else> · Non-VAT</span>
              </span>
              <span v-else class="text-slate-400">No TIN on file</span>
            </div>
          </div>
        </section>

        <!-- Current subscription -->
        <section>
          <div class="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">Current subscription</div>
          <div v-if="!details.tenant.current_subscription_plan_uuid"
               class="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm text-slate-500">
            No plan on file.
          </div>
          <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div class="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <div class="text-[10px] uppercase tracking-widest text-slate-500">Plan</div>
              <div class="mt-0.5 text-sm font-semibold text-slate-800">
                {{ (plans.byUuid(details.tenant.current_subscription_plan_uuid)?.name)
                   || (plans.byUuid(details.tenant.current_subscription_plan_uuid)?.code)
                   || '—' }}
              </div>
            </div>
            <div class="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <div class="text-[10px] uppercase tracking-widest text-slate-500">Amount</div>
              <div class="mt-0.5 text-sm text-slate-800">
                {{ details.tenant.current_subscription_plan_amount != null
                   ? money(details.tenant.current_subscription_plan_amount) : '—' }}
              </div>
              <div class="text-[11px] text-slate-500">
                {{ details.tenant.current_subscription_days
                   ? `${details.tenant.current_subscription_days} days` : '' }}
              </div>
            </div>
            <div class="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <div class="text-[10px] uppercase tracking-widest text-slate-500">Started</div>
              <div class="mt-0.5 text-sm text-slate-800">
                {{ formatDate(details.tenant.current_subscription_start) || '—' }}
              </div>
            </div>
            <div class="rounded-lg border p-3"
                 :class="subscriptionState(details.tenant) === 'expired' ? 'border-rose-200 bg-rose-50'
                          : subscriptionState(details.tenant) === 'expiring-soon' ? 'border-amber-200 bg-amber-50'
                          : 'border-slate-100 bg-slate-50'">
              <div class="text-[10px] uppercase tracking-widest text-slate-500">Expires</div>
              <div class="mt-0.5 text-sm text-slate-800">
                {{ formatDate(details.tenant.current_subscription_expiry) || '—' }}
              </div>
              <div v-if="subscriptionDaysRemaining(details.tenant) != null"
                   class="text-[11px]"
                   :class="subscriptionState(details.tenant) === 'expired' ? 'text-rose-700'
                            : subscriptionState(details.tenant) === 'expiring-soon' ? 'text-amber-700'
                            : 'text-slate-500'">
                <template v-if="subscriptionDaysRemaining(details.tenant) < 0">
                  Expired {{ -subscriptionDaysRemaining(details.tenant) }} day{{ subscriptionDaysRemaining(details.tenant) === -1 ? '' : 's' }} ago
                </template>
                <template v-else>
                  {{ subscriptionDaysRemaining(details.tenant) }} day{{ subscriptionDaysRemaining(details.tenant) === 1 ? '' : 's' }} remaining
                </template>
              </div>
            </div>
          </div>
        </section>

        <!-- Subscription history -->
        <section>
          <div class="mb-2 flex items-center justify-between">
            <div class="text-xs font-bold uppercase tracking-widest text-slate-500">Subscription history</div>
            <span class="text-[11px] text-slate-500">
              {{ detailsHistorySorted.length }} cycle{{ detailsHistorySorted.length === 1 ? '' : 's' }}
            </span>
          </div>
          <div v-if="!detailsHistorySorted.length && !details.loading"
               class="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm text-slate-500">
            No subscription history yet.
          </div>
          <div v-else class="overflow-x-auto">
            <table class="table">
              <thead class="bg-slate-50">
                <tr>
                  <th>Plan</th>
                  <th>Amount</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Days</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="h in detailsHistorySorted" :key="h.uuid || (h.subscription_start + h.subscription_plan_code)">
                  <td>
                    <div class="text-sm font-semibold text-slate-800">
                      {{ h.subscription_plan_name || h.subscription_plan_code || '—' }}
                    </div>
                    <div v-if="h.subscription_plan_code" class="text-[10px] font-mono text-slate-500">
                      {{ h.subscription_plan_code }}
                    </div>
                  </td>
                  <td class="text-sm text-slate-800">
                    {{ h.subscription_plan_amount != null ? money(h.subscription_plan_amount) : '—' }}
                  </td>
                  <td class="text-sm text-slate-800">{{ formatDate(h.subscription_start) || '—' }}</td>
                  <td class="text-sm text-slate-800">{{ formatDate(h.subscription_end) || '—' }}</td>
                  <td class="text-sm text-slate-800">{{ h.subscription_days ?? '—' }}</td>
                  <td>
                    <span v-if="h._state === 'current'" class="badge-success">Current</span>
                    <span v-else-if="h._state === 'upcoming'" class="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">Scheduled</span>
                    <span v-else class="badge-muted">Past</span>
                    <div v-if="h.alter_reason" class="mt-1 text-[10px] text-slate-500" :title="h.alter_reason">
                      ✎ altered
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="closeDetails">Close</button>
      </template>
    </Modal>

    <!-- Confirmations -->
    <ConfirmDialog
      :show="confirmStatus.show"
      :title="confirmStatus.next === 'active' ? 'Activate Tenant?' : 'Deactivate Tenant?'"
      :message="confirmStatus.tenant
        ? `This will ${confirmStatus.next === 'active' ? 'restore' : 'block'} sign-in access for ${confirmStatus.tenant.display_name}.`
        : ''"
      :confirm-text="confirmStatus.next === 'active' ? 'Activate' : 'Deactivate'"
      :danger="confirmStatus.next !== 'active'"
      @close="confirmStatus = { show: false, tenant: null, next: '' }"
      @confirm="doToggleStatus"
    />
    <ConfirmDialog
      :show="confirmDelete.show"
      title="Delete Tenant?"
      :message="confirmDelete.tenant
        ? `This will permanently remove ${confirmDelete.tenant.display_name} (${confirmDelete.tenant.store_code}). This cannot be undone.`
        : ''"
      confirm-text="Delete"
      @close="confirmDelete = { show: false, tenant: null }"
      @confirm="doDelete"
    />
  </div>
</template>
