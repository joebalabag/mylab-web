<script setup>
import { computed, onMounted, ref } from 'vue'
import { usePatientsStore } from '../stores/patients'
import { useAuthStore } from '../stores/auth'
import Modal from '../components/Modal.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import EmptyState from '../components/EmptyState.vue'
import SkeletonRows from '../components/SkeletonRows.vue'
import RowActionMenu from '../components/RowActionMenu.vue'
import MobileFilterBar from '../components/MobileFilterBar.vue'
import PaginationBar from '../components/PaginationBar.vue'
import { formatDateTime } from '../utils/format'
import {
  PATIENT_SEXES, CIVIL_STATUSES, BLOOD_TYPES,
  searchPatients, viewPatient,
} from '../api/patients'
import { listPatientCases } from '../api/patientCases'
import { listLabReports, viewLabReport } from '../api/laboratory'
import { assetUrl } from '../api/client'

const patients = usePatientsStore()
const auth     = useAuthStore()

const search       = ref('')
const statusFilter = ref('')
const listError    = ref('')

async function loadPatients() {
  listError.value = ''
  patients.setFilters({
    tenant_uuid: auth.tenantUuid || '',
    keywords: search.value.trim(),
    status: statusFilter.value ? [statusFilter.value] : []
  })
  try {
    await patients.fetch()
  } catch (e) {
    listError.value = e?.message || 'Failed to load patients'
  }
}
onMounted(loadPatients)

function onSearchEnter()  { loadPatients() }
function onFilterChange() { loadPatients() }

const filtered    = computed(() => patients.items)
const totalCount  = computed(() => patients.total || patients.items.length)
const activeCount = computed(() =>
  patients.items.filter(p => p.status === 'active').length
)

// ─── Toast ───
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

// ─── Formatters ───
function fullName(p) {
  if (!p) return ''
  const parts = [p.first_name, p.middle_name, p.last_name]
  const joined = parts.filter(Boolean).join(' ')
  return p.suffix ? `${joined} ${p.suffix}` : joined
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
function birthdateInputValue(bd) {
  if (!bd) return ''
  const d = new Date(String(bd).replace(' ', 'T'))
  if (isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// ─── Search-first Add flow ───
// Step 1: SearchModal opens on "+ Add Patient". User types first + last name
// and optional birthdate. Server returns up to 20 matches (soft — same name
// doesn't block). User picks one ("Use this patient" → opens edit) or
// clicks "None of these — Create new" (opens the form pre-filled).
const showSearch = ref(false)
const searchForm = ref({ first_name: '', last_name: '', birthdate: '' })
const searchResults = ref([])
const searchLoading = ref(false)
const searchError = ref('')
const searchTouched = ref(false)   // true once user has run a search
function openSearchToAdd() {
  searchForm.value = { first_name: '', last_name: '', birthdate: '' }
  searchResults.value = []
  searchTouched.value = false
  searchError.value = ''
  showSearch.value = true
}
async function runSearch() {
  searchError.value = ''
  const first = searchForm.value.first_name.trim()
  const last  = searchForm.value.last_name.trim()
  if (!first && !last) {
    searchError.value = 'Enter at least a first or last name'
    return
  }
  searchLoading.value = true
  searchTouched.value = true
  try {
    const rows = await searchPatients({
      first_name: first || undefined,
      last_name:  last  || undefined,
      birthdate:  searchForm.value.birthdate || undefined,
      limit: 20
    })
    searchResults.value = Array.isArray(rows) ? rows : []
  } catch (e) {
    searchError.value = e?.message || 'Search failed'
  } finally {
    searchLoading.value = false
  }
}
function chooseFoundPatient(p) {
  showSearch.value = false
  openEdit(p)
}
function proceedToCreateNew() {
  const { first_name, last_name, birthdate } = searchForm.value
  showSearch.value = false
  openAddPrefilled({ first_name, last_name, birthdate })
}

// ─── Add / Edit form ───
const showForm = ref(false)
const editing  = ref(null)
const emptyForm = () => ({
  first_name: '', middle_name: '', last_name: '', suffix: '',
  sex: 'M', birthdate: '', civil_status: '', nationality: 'Filipino',
  contact_number: '', email: '',
  address_street1: '', address_street2: '', city: '', province: '', postal_code: '', country: 'Philippines',
  blood_type: '', allergies: '', notes: '',
  senior_citizen_number: '', pwd_number: '', national_id: '',
  emergency_contact_name: '', emergency_contact_relation: '', emergency_contact_number: '',
  philhealth_number: '', company: '', referring_physician: '', occupation: ''
})
const form = ref(emptyForm())
const formError = ref('')
const submitting = ref(false)

function openAddPrefilled({ first_name, last_name, birthdate } = {}) {
  editing.value = null
  form.value = emptyForm()
  if (first_name) form.value.first_name = first_name
  if (last_name)  form.value.last_name  = last_name
  if (birthdate)  form.value.birthdate  = birthdate
  formError.value = ''
  showForm.value = true
}
function openEdit(p) {
  editing.value = p
  form.value = {
    first_name: p.first_name || '',
    middle_name: p.middle_name || '',
    last_name: p.last_name || '',
    suffix: p.suffix || '',
    sex: p.sex || 'M',
    birthdate: birthdateInputValue(p.birthdate),
    civil_status: p.civil_status || '',
    nationality: p.nationality || 'Filipino',
    contact_number: p.contact_number || '',
    email: p.email || '',
    address_street1: p.address_street1 || '',
    address_street2: p.address_street2 || '',
    city: p.city || '',
    province: p.province || '',
    postal_code: p.postal_code || '',
    country: p.country || 'Philippines',
    blood_type: p.blood_type || '',
    allergies: p.allergies || '',
    notes: p.notes || '',
    senior_citizen_number: p.senior_citizen_number || '',
    pwd_number: p.pwd_number || '',
    national_id: p.national_id || '',
    emergency_contact_name: p.emergency_contact_name || '',
    emergency_contact_relation: p.emergency_contact_relation || '',
    emergency_contact_number: p.emergency_contact_number || '',
    philhealth_number: p.philhealth_number || '',
    company: p.company || '',
    referring_physician: p.referring_physician || '',
    occupation: p.occupation || ''
  }
  formError.value = ''
  showForm.value = true
}

async function submit() {
  formError.value = ''
  const first = form.value.first_name.trim()
  const last  = form.value.last_name.trim()
  if (!first) { formError.value = 'First name is required'; return }
  if (!last)  { formError.value = 'Last name is required';  return }
  if (!form.value.sex) { formError.value = 'Sex is required'; return }

  const payload = { ...form.value }
  // Trim strings so accidental whitespace doesn't sneak into the DB.
  for (const k of Object.keys(payload)) {
    if (typeof payload[k] === 'string') payload[k] = payload[k].trim()
  }

  submitting.value = true
  try {
    if (editing.value) {
      await patients.update(editing.value.uuid, payload)
      flash(`Updated ${fullName(editing.value)}`)
    } else {
      const created = await patients.create({
        tenant_uuid: auth.tenantUuid || undefined,
        ...payload
      })
      flash(`Registered ${created?.patient_number || ''} · ${fullName(created)}`)
    }
    showForm.value = false
    await loadPatients()
  } catch (e) {
    formError.value = e?.message || 'Failed to save patient'
  } finally {
    submitting.value = false
  }
}

// ─── View (read-only) ───
const showView = ref(false)
const viewing = ref(null)
const viewLoading = ref(false)

// Case history — server-paginated so a patient with thousands of visits
// doesn't drown the modal. Each open resets to page 1; page/size changes
// re-hit the API. Default page size 15 is small enough to fit in the modal
// without scrolling but large enough to be useful.
const caseHistory = ref([])
const caseHistoryTotal = ref(0)
const caseHistoryPage = ref(1)
const caseHistoryPageSize = ref(15)
const caseHistoryLoading = ref(false)
const caseHistoryError = ref('')

async function loadCaseHistory(patient_uuid) {
  if (!patient_uuid) return
  caseHistoryLoading.value = true
  caseHistoryError.value = ''
  try {
    const res = await listPatientCases({
      tenant_uuid:  auth.tenantUuid || undefined,
      patient_uuid,
      page_number:  caseHistoryPage.value,
      page_size:    caseHistoryPageSize.value,
    })
    caseHistory.value      = Array.isArray(res?.results) ? res.results : []
    caseHistoryTotal.value = Number(res?.total ?? caseHistory.value.length)
  } catch (e) {
    caseHistoryError.value = e?.message || 'Failed to load case history'
  } finally {
    caseHistoryLoading.value = false
  }
}
function onCaseHistoryPage(n) {
  caseHistoryPage.value = n
  if (viewing.value?.uuid) loadCaseHistory(viewing.value.uuid)
}
function onCaseHistoryPageSize(s) {
  caseHistoryPageSize.value = s
  caseHistoryPage.value = 1
  if (viewing.value?.uuid) loadCaseHistory(viewing.value.uuid)
}

async function openView(p) {
  viewing.value = p
  showView.value = true
  viewLoading.value = true
  // Reset paging state so re-opening on a different patient doesn't
  // stick us on page 47 of their neighbor's case list.
  caseHistory.value = []
  caseHistoryTotal.value = 0
  caseHistoryPage.value = 1
  caseHistoryError.value = ''
  // Reset lab history state.
  labHistory.value = []
  labHistoryError.value = ''
  labHistoryYear.value = new Date().getFullYear()
  try {
    const full = await viewPatient(p.uuid)
    if (full) viewing.value = full
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Failed to load patient detail', e)
  } finally {
    viewLoading.value = false
  }
  // Fire the case + lab history loads in parallel with the main patient fetch.
  loadCaseHistory(p.uuid)
  loadLabHistory(p.uuid)
}
function closeView() {
  showView.value = false
  viewing.value = null
  caseHistory.value = []
  caseHistoryTotal.value = 0
  labHistory.value = []
}

// ─── Lab results history (per patient, filtered by year) ────────────────
// Reuses the standard lab-report list endpoint with date_from/date_to
// clipped to the selected calendar year. Default year = current.
// Non-voided reports are shown so patient history reflects real results;
// operators can still filter void into view later if needed.
const labHistory        = ref([])
const labHistoryLoading = ref(false)
const labHistoryError   = ref('')
const labHistoryYear    = ref(new Date().getFullYear())
const labHistoryYears   = computed(() => {
  const cur = new Date().getFullYear()
  return Array.from({ length: 6 }, (_, i) => cur - i) // current + last 5 years
})
async function loadLabHistory(patientUuid) {
  if (!patientUuid) return
  labHistoryLoading.value = true
  labHistoryError.value = ''
  try {
    const yr = labHistoryYear.value
    const res = await listLabReports({
      tenant_uuid: auth.tenantUuid,
      patient_uuid: patientUuid,
      // Chart context — only signed-off results are clinically meaningful.
      // Drafts (in progress) and voided (retracted) are excluded from the
      // patient history view.
      status: ['finalized'],
      date_from: `${yr}-01-01`,
      date_to:   `${yr}-12-31`,
      page_number: 0,
      page_size:   0,
    })
    labHistory.value = Array.isArray(res?.results) ? res.results : []
  } catch (e) {
    labHistoryError.value = e?.message || 'Failed to load lab history'
  } finally {
    labHistoryLoading.value = false
  }
}
function onLabHistoryYearChange() {
  if (viewing.value?.uuid) loadLabHistory(viewing.value.uuid)
}
function labStatusBadgeClass(s) {
  switch (s) {
    case 'finalized': return 'badge-success'
    case 'voided':    return 'badge-danger'
    default:          return 'badge-info'
  }
}

// ─── Lab-report preview (read-only, no print action) ────────────────────
const labPreview        = ref(null)
const labPreviewLoading = ref(false)
const labPreviewError   = ref('')
async function openLabPreview(r) {
  labPreview.value = null
  labPreviewError.value = ''
  labPreviewLoading.value = true
  try {
    const full = await viewLabReport(r.uuid)
    labPreview.value = full || null
  } catch (e) {
    labPreviewError.value = e?.message || 'Failed to load lab report'
  } finally {
    labPreviewLoading.value = false
  }
}
function closeLabPreview() {
  labPreview.value = null
  labPreviewError.value = ''
}
// Group panel values by their optional section header — same grouping the
// lab print/editor uses so the preview reads identically to what the doctor
// signed off on. Values without a section fall into a nameless bucket.
function groupBySection(values) {
  const groups = new Map()
  for (const v of values || []) {
    const key = v.section || ''
    if (!groups.has(key)) groups.set(key, { section: key, values: [] })
    groups.get(key).values.push(v)
  }
  return Array.from(groups.values())
}
function anyUnit(item)      { return (item.values || []).some((v) => v.unit_of_measure) }
function anyReference(item) { return (item.values || []).some((v) => v.reference_range) }
// Rebuild the on-screen matrix grid from the item's snapshot config + saved
// values. Config shape is `{ rows: [...], cols: [...] }`; values carry
// matrix_row/matrix_col and value_text.
function buildMatrixGrid(item) {
  const cfg = item.matrix_config || {}
  const rows = Array.isArray(cfg.rows) ? cfg.rows : []
  const cols = Array.isArray(cfg.cols) ? cfg.cols : []
  const cells = new Map()
  for (const v of item.values || []) {
    if (v.matrix_row != null && v.matrix_col != null) {
      cells.set(`${v.matrix_row}|${v.matrix_col}`, v)
    }
  }
  return { rows, cols, cells }
}
function caseStatusBadgeClass(s) {
  switch (s) {
    case 'open':           return 'badge-success'
    case 'closed':         return 'badge-muted'
    case 'cancelled':      return 'badge-danger'
    default:               return 'badge-muted'
  }
}
function caseTypeBadgeClass(t) {
  switch (t) {
    case 'OPD': return 'bg-emerald-100 text-emerald-700'
    case 'IPD': return 'bg-brand-100 text-brand-700'
    case 'ER':  return 'bg-rose-100 text-rose-700'
    default:    return 'bg-slate-100 text-slate-700'
  }
}
function switchToEdit() {
  const p = viewing.value
  closeView()
  if (p) openEdit(p)
}

// ─── Delete ───
const confirmDelete = ref({ show: false, patient: null })
function askDelete(p) { confirmDelete.value = { show: true, patient: p } }
async function doDelete() {
  const p = confirmDelete.value.patient
  confirmDelete.value = { show: false, patient: null }
  try {
    await patients.remove(p.uuid)
    flash(`Deleted ${fullName(p)}`)
  } catch (e) {
    flashError(e, 'Failed to delete patient')
  }
}

// ─── Activate / Deactivate ───
const confirmStatus = ref({ show: false, patient: null, next: '' })
function askToggleStatus(p) {
  const next = p.status === 'active' ? 'inactive' : 'active'
  confirmStatus.value = { show: true, patient: p, next }
}
async function doToggleStatus() {
  const { patient, next } = confirmStatus.value
  confirmStatus.value = { show: false, patient: null, next: '' }
  try {
    await patients.setStatus(patient.uuid, next)
    flash(`${fullName(patient)} is now ${next}`)
  } catch (e) {
    flashError(e, 'Failed to update status')
  }
}

function actionsFor(p) {
  const isActive = p.status === 'active'
  return [
    { label: 'View patient', icon: 'eye',  onClick: () => openView(p) },
    { label: 'Edit patient', icon: 'edit', onClick: () => openEdit(p) },
    { label: isActive ? 'Deactivate' : 'Activate',
      icon:  isActive ? 'deactivate' : 'activate',
      variant: isActive ? 'danger' : 'success',
      onClick: () => askToggleStatus(p) },
    { divider: true },
    { label: 'Delete patient', icon: 'trash', variant: 'danger', onClick: () => askDelete(p) }
  ]
}
</script>

<template>
  <div class="flex h-full flex-col gap-4">
    <div class="grid grid-cols-2 gap-3 shrink-0">
      <div class="card"><div class="card-body">
        <div class="text-xs font-semibold uppercase text-slate-500">Total Patients</div>
        <div class="mt-1 text-2xl font-bold">{{ totalCount }}</div>
      </div></div>
      <div class="card"><div class="card-body">
        <div class="text-xs font-semibold uppercase text-slate-500">Active</div>
        <div class="mt-1 text-2xl font-bold text-emerald-600">{{ activeCount }}</div>
      </div></div>
    </div>

    <div class="card flex flex-1 min-h-0 flex-col overflow-hidden">
      <div class="card-header">
        <div>
          <div class="text-sm font-semibold text-slate-800">Patients</div>
          <div class="text-xs text-slate-500">
            {{ filtered.length }} shown
            <span v-if="patients.loading" class="ml-1 text-brand-600">· loading…</span>
          </div>
        </div>
        <MobileFilterBar>
          <input
            v-model="search"
            @keyup.enter="onSearchEnter"
            placeholder="Search MRN, name, contact, national ID… (Enter)"
            class="input w-full sm:w-80"
          />
          <select v-model="statusFilter" @change="onFilterChange" class="input w-full sm:w-36">
            <option value="">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <button class="btn-secondary" @click="loadPatients" :disabled="patients.loading" title="Refresh">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
          </button>
          <template #action>
            <button class="btn-primary" @click="openSearchToAdd">+ Add Patient</button>
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
        <SkeletonRows
          v-if="patients.loading && !patients.items.length"
          :rows="8"
          label="Loading patients…"
          :columns="['bar','lines','pill','bar','lines','dot']"
        />
        <table class="table" v-else-if="filtered.length">
          <thead class="sticky top-0 z-10 bg-slate-50 shadow-[inset_0_-1px_0_theme(colors.slate.100)]">
            <tr>
              <th class="w-28">MRN</th>
              <th>Name</th>
              <th>Sex / Age</th>
              <th>Contact</th>
              <th>National ID</th>
              <th>Status</th>
              <th class="hidden md:table-cell">Registered</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in filtered" :key="p.uuid" :class="p.status !== 'active' && 'bg-slate-50/50'">
              <td class="font-mono text-xs font-semibold">
                <button type="button"
                        class="text-brand-600 hover:text-brand-800 hover:underline"
                        @click="openView(p)"
                        :title="`View ${p.patient_number}`">{{ p.patient_number }}</button>
              </td>
              <td>
                <div class="font-medium text-slate-800">{{ fullName(p) }}</div>
                <div v-if="p.status !== 'active'" class="text-[10px] font-semibold uppercase tracking-wider text-rose-600">
                  Hidden
                </div>
              </td>
              <td class="text-sm text-slate-700">
                <span class="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase">{{ p.sex }}</span>
                <span v-if="ageFromBirthdate(p.birthdate) !== null" class="ml-1">
                  {{ ageFromBirthdate(p.birthdate) }} y/o
                </span>
              </td>
              <td class="text-sm text-slate-600">{{ p.contact_number || '—' }}</td>
              <td class="text-xs text-slate-500 font-mono">{{ p.national_id || '—' }}</td>
              <td>
                <span class="badge" :class="p.status === 'active' ? 'badge-success' : 'badge-danger'">
                  <span class="mr-1 inline-block h-1.5 w-1.5 rounded-full"
                        :class="p.status === 'active' ? 'bg-emerald-500' : 'bg-rose-500'"></span>
                  {{ p.status === 'active' ? 'Active' : 'Inactive' }}
                </span>
              </td>
              <td class="hidden md:table-cell text-xs text-slate-500">{{ formatDateTime(p.created_at) }}</td>
              <td class="text-right">
                <RowActionMenu :actions="actionsFor(p)" />
              </td>
            </tr>
          </tbody>
        </table>
        <EmptyState v-else-if="!patients.loading" title="No patients" message="Register your first patient to get started." />
      </div>
    </div>

    <!-- ═══ Search-first Add flow (Step 1: search) ═════════════════════════════
         Users type a name (and optionally birthdate) to check for existing
         records before proceeding to create. Soft-match — always allows
         Create New even when there are matches. -->
    <Modal :show="showSearch" title="Add Patient — search first" size="md" @close="showSearch = false">
      <div class="space-y-3">
        <p class="text-xs text-slate-600">
          Search the existing patient list before registering a new one to avoid duplicates.
        </p>
        <form id="patSearchForm" @submit.prevent="runSearch" class="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label class="label">First name</label>
            <input v-model="searchForm.first_name" class="input" placeholder="Juan" autofocus />
          </div>
          <div>
            <label class="label">Last name</label>
            <input v-model="searchForm.last_name" class="input" placeholder="Dela Cruz" />
          </div>
          <div>
            <label class="label">Birthdate <span class="text-slate-400">(optional)</span></label>
            <input type="date" v-model="searchForm.birthdate" class="input" />
          </div>
        </form>

        <div v-if="searchError" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ searchError }}
        </div>

        <div v-if="searchTouched && !searchLoading && !searchResults.length"
             class="rounded-md border border-dashed border-slate-300 bg-white p-3 text-center text-xs text-slate-500">
          No existing patient matched. Click <b>Create new</b> to register.
        </div>

        <div v-if="searchResults.length" class="overflow-hidden rounded-md border border-slate-200">
          <table class="w-full text-xs">
            <thead class="bg-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th class="px-2 py-1.5 text-left">MRN</th>
                <th class="px-2 py-1.5 text-left">Name</th>
                <th class="px-2 py-1.5 text-left">Sex / Age</th>
                <th class="px-2 py-1.5 text-left">Contact</th>
                <th class="px-2 py-1.5 text-right"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in searchResults" :key="p.uuid" class="border-t border-slate-100 align-middle">
                <td class="px-2 py-1 font-mono font-semibold text-slate-700">{{ p.patient_number }}</td>
                <td class="px-2 py-1 text-slate-800">{{ fullName(p) }}</td>
                <td class="px-2 py-1 text-slate-600">
                  <span class="rounded bg-slate-100 px-1 text-[10px] font-bold uppercase">{{ p.sex }}</span>
                  <span v-if="ageFromBirthdate(p.birthdate) !== null" class="ml-1">
                    · {{ ageFromBirthdate(p.birthdate) }} y/o
                  </span>
                </td>
                <td class="px-2 py-1 text-slate-600">{{ p.contact_number || '—' }}</td>
                <td class="px-2 py-1 text-right">
                  <button type="button" class="btn-secondary !py-0.5 !text-[11px]" @click="chooseFoundPatient(p)">
                    Use this patient
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="showSearch = false">Cancel</button>
        <button class="btn-secondary" :disabled="searchLoading" form="patSearchForm" type="submit">
          {{ searchLoading ? 'Searching…' : 'Search' }}
        </button>
        <button class="btn-primary" @click="proceedToCreateNew">
          {{ searchTouched && searchResults.length ? 'None of these — Create new' : 'Create new' }}
        </button>
      </template>
    </Modal>

    <!-- ═══ Add / Edit form ═════════════════════════════════════════════════ -->
    <Modal :show="showForm" :title="editing ? 'Edit Patient' : 'Add Patient'" size="2xl" @close="showForm = false">
      <form id="patForm" @submit.prevent="submit" class="space-y-4">
        <!-- Identity -->
        <div>
          <div class="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">Identity</div>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-6">
            <div class="sm:col-span-2">
              <label class="label">First name *</label>
              <input v-model="form.first_name" required maxlength="255" class="input" />
            </div>
            <div class="sm:col-span-2">
              <label class="label">Middle name</label>
              <input v-model="form.middle_name" maxlength="255" class="input" />
            </div>
            <div class="sm:col-span-2">
              <label class="label">Last name *</label>
              <input v-model="form.last_name" required maxlength="255" class="input" />
            </div>
            <div>
              <label class="label">Suffix</label>
              <input v-model="form.suffix" maxlength="20" placeholder="Jr, Sr, III" class="input" />
            </div>
            <div>
              <label class="label">Sex *</label>
              <select v-model="form.sex" required class="input">
                <option v-for="s in PATIENT_SEXES" :key="s" :value="s">{{ s }}</option>
              </select>
            </div>
            <div>
              <label class="label">Birthdate</label>
              <input type="date" v-model="form.birthdate" class="input" />
            </div>
            <div>
              <label class="label">Civil status</label>
              <select v-model="form.civil_status" class="input">
                <option value="">—</option>
                <option v-for="s in CIVIL_STATUSES" :key="s" :value="s">{{ s }}</option>
              </select>
            </div>
            <div>
              <label class="label">Nationality</label>
              <input v-model="form.nationality" maxlength="100" class="input" />
            </div>
          </div>
        </div>

        <!-- Contact -->
        <div>
          <div class="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">Contact</div>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-6">
            <div class="sm:col-span-3">
              <label class="label">Contact number</label>
              <input v-model="form.contact_number" maxlength="50" placeholder="+63 917 000 0000" class="input" />
            </div>
            <div class="sm:col-span-3">
              <label class="label">Email</label>
              <input type="email" v-model="form.email" maxlength="255" class="input" />
            </div>
            <div class="sm:col-span-3">
              <label class="label">Address line 1</label>
              <input v-model="form.address_street1" maxlength="500" class="input" />
            </div>
            <div class="sm:col-span-3">
              <label class="label">Address line 2</label>
              <input v-model="form.address_street2" maxlength="500" class="input" />
            </div>
            <div class="sm:col-span-2">
              <label class="label">City</label>
              <input v-model="form.city" maxlength="255" class="input" />
            </div>
            <div class="sm:col-span-2">
              <label class="label">Province</label>
              <input v-model="form.province" maxlength="255" class="input" />
            </div>
            <div>
              <label class="label">Postal</label>
              <input v-model="form.postal_code" maxlength="50" class="input" />
            </div>
            <div>
              <label class="label">Country</label>
              <input v-model="form.country" maxlength="100" class="input" />
            </div>
          </div>
        </div>

        <!-- Medical -->
        <div>
          <div class="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">Medical</div>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-6">
            <div>
              <label class="label">Blood type</label>
              <select v-model="form.blood_type" class="input">
                <option value="">—</option>
                <option v-for="b in BLOOD_TYPES" :key="b" :value="b">{{ b }}</option>
              </select>
            </div>
            <div class="sm:col-span-5">
              <label class="label">Allergies</label>
              <input v-model="form.allergies" maxlength="2000" placeholder="Penicillin, seafood…" class="input" />
            </div>
            <div class="sm:col-span-6">
              <label class="label">Notes</label>
              <textarea v-model="form.notes" rows="2" maxlength="2000" class="input"></textarea>
            </div>
          </div>
        </div>

        <!-- IDs & Emergency -->
        <div>
          <div class="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">Government IDs</div>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label class="label">National ID (PhilSys)</label>
              <input v-model="form.national_id" maxlength="50" placeholder="1234-5678-9012-3456" class="input font-mono" />
            </div>
            <div>
              <label class="label">Senior Citizen ID</label>
              <input v-model="form.senior_citizen_number" maxlength="50" class="input font-mono" />
            </div>
            <div>
              <label class="label">PWD ID</label>
              <input v-model="form.pwd_number" maxlength="50" class="input font-mono" />
            </div>
            <div>
              <label class="label">PhilHealth number</label>
              <input v-model="form.philhealth_number" maxlength="50" class="input font-mono" />
            </div>
            <div>
              <label class="label">Occupation</label>
              <input v-model="form.occupation" maxlength="255" class="input" />
            </div>
            <div>
              <label class="label">Company / HMO</label>
              <input v-model="form.company" maxlength="255" class="input" />
            </div>
          </div>
        </div>

        <div>
          <div class="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">Emergency Contact</div>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-6">
            <div class="sm:col-span-2">
              <label class="label">Name</label>
              <input v-model="form.emergency_contact_name" maxlength="255" class="input" />
            </div>
            <div class="sm:col-span-2">
              <label class="label">Relation</label>
              <input v-model="form.emergency_contact_relation" maxlength="100" placeholder="Spouse, Mother" class="input" />
            </div>
            <div class="sm:col-span-2">
              <label class="label">Contact number</label>
              <input v-model="form.emergency_contact_number" maxlength="50" class="input" />
            </div>
          </div>
        </div>

        <div>
          <div class="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">Referral</div>
          <div>
            <label class="label">Referring physician</label>
            <input v-model="form.referring_physician" maxlength="255" placeholder="Dr. Juan Dela Cruz" class="input" />
          </div>
        </div>

        <div v-if="formError" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ formError }}
        </div>
      </form>
      <template #footer>
        <button class="btn-secondary" :disabled="submitting" @click="showForm = false">Cancel</button>
        <button class="btn-primary" :disabled="submitting" form="patForm" type="submit">
          {{ submitting ? 'Saving…' : (editing ? 'Save' : 'Register') }}
        </button>
      </template>
    </Modal>

    <!-- ═══ View (read-only) ═════════════════════════════════════════════════ -->
    <Modal :show="showView" title="Patient" size="2xl" @close="closeView">
      <div v-if="viewing" class="space-y-4">
        <div class="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <div class="flex items-center gap-2">
              <span class="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-700">{{ viewing.patient_number }}</span>
              <span class="rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand-700">{{ viewing.sex }}</span>
              <span v-if="ageFromBirthdate(viewing.birthdate) !== null"
                    class="text-xs font-semibold text-slate-600">{{ ageFromBirthdate(viewing.birthdate) }} years old</span>
              <span class="badge" :class="viewing.status === 'active' ? 'badge-success' : 'badge-danger'">
                <span class="mr-1 inline-block h-1.5 w-1.5 rounded-full"
                      :class="viewing.status === 'active' ? 'bg-emerald-500' : 'bg-rose-500'"></span>
                {{ viewing.status === 'active' ? 'Active' : 'Inactive' }}
              </span>
            </div>
            <h3 class="mt-1 text-lg font-bold text-slate-800">{{ fullName(viewing) }}</h3>
            <div v-if="viewing.birthdate" class="text-xs text-slate-500">
              Born {{ birthdateInputValue(viewing.birthdate) }}
              <span v-if="viewing.civil_status"> · {{ viewing.civil_status }}</span>
              <span v-if="viewing.nationality"> · {{ viewing.nationality }}</span>
            </div>
          </div>
          <span v-if="viewLoading" class="text-[11px] text-brand-600">Loading…</span>
        </div>

        <!-- Contact -->
        <div>
          <div class="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">Contact</div>
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 text-sm text-slate-800">
            <div><span class="text-slate-500 text-xs">Phone:</span> {{ viewing.contact_number || '—' }}</div>
            <div><span class="text-slate-500 text-xs">Email:</span> {{ viewing.email || '—' }}</div>
            <div class="sm:col-span-2">
              <span class="text-slate-500 text-xs">Address:</span>
              {{ [viewing.address_street1, viewing.address_street2, viewing.city, viewing.province, viewing.postal_code, viewing.country].filter(Boolean).join(', ') || '—' }}
            </div>
          </div>
        </div>

        <!-- Medical -->
        <div>
          <div class="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">Medical</div>
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-3 text-sm text-slate-800">
            <div><span class="text-slate-500 text-xs">Blood type:</span> {{ viewing.blood_type || '—' }}</div>
            <div class="sm:col-span-2"><span class="text-slate-500 text-xs">Allergies:</span> {{ viewing.allergies || '—' }}</div>
            <div v-if="viewing.notes" class="sm:col-span-3">
              <span class="text-slate-500 text-xs">Notes:</span>
              <p class="mt-0.5 whitespace-pre-line">{{ viewing.notes }}</p>
            </div>
          </div>
        </div>

        <!-- IDs -->
        <div>
          <div class="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">Government IDs</div>
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 text-sm">
            <div><span class="text-slate-500 text-xs">National ID:</span> <span class="font-mono">{{ viewing.national_id || '—' }}</span></div>
            <div><span class="text-slate-500 text-xs">PhilHealth:</span> <span class="font-mono">{{ viewing.philhealth_number || '—' }}</span></div>
            <div><span class="text-slate-500 text-xs">Senior Citizen:</span> <span class="font-mono">{{ viewing.senior_citizen_number || '—' }}</span></div>
            <div><span class="text-slate-500 text-xs">PWD:</span> <span class="font-mono">{{ viewing.pwd_number || '—' }}</span></div>
            <div><span class="text-slate-500 text-xs">Occupation:</span> {{ viewing.occupation || '—' }}</div>
            <div><span class="text-slate-500 text-xs">Company / HMO:</span> {{ viewing.company || '—' }}</div>
          </div>
        </div>

        <!-- Emergency -->
        <div>
          <div class="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">Emergency Contact</div>
          <div class="text-sm text-slate-800">
            <template v-if="viewing.emergency_contact_name">
              {{ viewing.emergency_contact_name }}
              <span v-if="viewing.emergency_contact_relation" class="text-slate-500 text-xs">({{ viewing.emergency_contact_relation }})</span>
              — {{ viewing.emergency_contact_number || 'no number' }}
            </template>
            <template v-else>—</template>
          </div>
        </div>

        <!-- Referral -->
        <div v-if="viewing.referring_physician">
          <div class="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">Referring Physician</div>
          <div class="text-sm text-slate-800">{{ viewing.referring_physician }}</div>
        </div>

        <!-- Case history — server-paginated. Keeps the modal usable even
             when the patient has thousands of visits over the years. -->
        <div class="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
          <div class="mb-2 flex items-center justify-between">
            <div class="text-xs font-bold uppercase tracking-widest text-slate-500">
              Patient Cases
              <span v-if="caseHistoryTotal > 0" class="text-slate-400 normal-case font-medium">
                · {{ caseHistoryTotal }} total
              </span>
              <span v-if="caseHistoryLoading" class="ml-1 text-brand-600">· loading…</span>
            </div>
          </div>

          <div v-if="caseHistoryError"
               class="mb-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] text-rose-700">
            {{ caseHistoryError }}
          </div>

          <div class="overflow-hidden rounded-md border border-slate-200 bg-white">
            <div v-if="!caseHistoryLoading && !caseHistory.length"
                 class="p-3 text-center text-xs text-slate-500">
              No cases registered for this patient yet.
            </div>
            <table v-else class="w-full text-xs">
              <thead class="bg-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th class="px-2 py-1.5 text-left">Case #</th>
                  <th class="w-16 px-2 py-1.5 text-left">Type</th>
                  <th class="px-2 py-1.5 text-left">Admission</th>
                  <th class="px-2 py-1.5 text-left">Chief complaint</th>
                  <th class="w-24 px-2 py-1.5 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="c in caseHistory" :key="c.uuid" class="border-t border-slate-100 align-top">
                  <td class="px-2 py-1 font-mono font-semibold text-slate-700">{{ c.case_number }}</td>
                  <td class="px-2 py-1">
                    <span class="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                          :class="caseTypeBadgeClass(c.case_type)">{{ c.case_type }}</span>
                  </td>
                  <td class="px-2 py-1 text-slate-600">{{ formatDateTime(c.admission_date) }}</td>
                  <td class="px-2 py-1 text-slate-700 truncate max-w-xs" :title="c.chief_complaint || ''">
                    {{ c.chief_complaint || '—' }}
                  </td>
                  <td class="px-2 py-1">
                    <span class="badge" :class="caseStatusBadgeClass(c.status)">
                      <span class="mr-1 inline-block h-1.5 w-1.5 rounded-full"
                            :class="c.status === 'open' ? 'bg-emerald-500'
                                    : c.status === 'cancelled' ? 'bg-rose-500' : 'bg-slate-400'"></span>
                      {{ c.status }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
            <PaginationBar
              v-if="caseHistoryTotal > 0"
              :page="caseHistoryPage"
              :pageSize="caseHistoryPageSize"
              :total="caseHistoryTotal"
              :sizes="[15, 30, 50, 100]"
              @update:page="onCaseHistoryPage"
              @update:pageSize="onCaseHistoryPageSize"
            />
          </div>
        </div>

        <!-- Lab Results — filtered by calendar year (default current). Each
             row previews in a read-only modal; printing is intentionally
             disabled here (patient view is a chart context, not a lab
             worklist). -->
        <div class="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
          <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div class="text-xs font-bold uppercase tracking-widest text-slate-500">
              Lab Results
              <span v-if="labHistory.length" class="text-slate-400 normal-case font-medium">
                · {{ labHistory.length }} report{{ labHistory.length === 1 ? '' : 's' }}
              </span>
              <span v-if="labHistoryLoading" class="ml-1 text-brand-600">· loading…</span>
            </div>
            <div class="flex items-center gap-1">
              <label class="text-[11px] text-slate-500">Year</label>
              <select v-model.number="labHistoryYear" class="input !py-0.5 !text-xs"
                      @change="onLabHistoryYearChange">
                <option v-for="y in labHistoryYears" :key="y" :value="y">{{ y }}</option>
              </select>
            </div>
          </div>

          <div v-if="labHistoryError"
               class="mb-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] text-rose-700">
            {{ labHistoryError }}
          </div>

          <div class="overflow-hidden rounded-md border border-slate-200 bg-white">
            <div v-if="!labHistoryLoading && !labHistory.length"
                 class="p-3 text-center text-xs text-slate-500">
              No lab results in {{ labHistoryYear }}.
            </div>
            <table v-else class="w-full text-xs">
              <thead class="bg-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th class="px-2 py-1.5 text-left">Lab #</th>
                  <th class="px-2 py-1.5 text-left">Category</th>
                  <th class="px-2 py-1.5 text-left">Tests</th>
                  <th class="w-32 px-2 py-1.5 text-left">Date</th>
                  <th class="w-24 px-2 py-1.5 text-left">Status</th>
                  <th class="w-20 px-2 py-1.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in labHistory" :key="r.uuid" class="border-t border-slate-100 align-top">
                  <td class="px-2 py-1 font-mono font-semibold text-slate-700">{{ r.lab_number }}</td>
                  <td class="px-2 py-1 text-slate-600">{{ r.item_category_name || '—' }}</td>
                  <td class="px-2 py-1 text-slate-700 truncate max-w-xs" :title="r.test_items_summary || ''">
                    {{ r.test_items_summary || '—' }}
                  </td>
                  <td class="px-2 py-1 text-slate-600">{{ formatDateTime(r.finalized_at || r.created_at) }}</td>
                  <td class="px-2 py-1">
                    <span class="badge" :class="labStatusBadgeClass(r.status)">{{ r.status }}</span>
                  </td>
                  <td class="px-2 py-1 text-right">
                    <button class="text-[11px] font-semibold text-brand-700 hover:underline"
                            @click="openLabPreview(r)">
                      Preview
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="border-t border-slate-100 pt-2 text-[11px] text-slate-500">
          Registered {{ formatDateTime(viewing.created_at) }}
          <span v-if="viewing.created_by">by {{ viewing.created_by }}</span>
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="closeView">Close</button>
        <button class="btn-primary" @click="switchToEdit">Edit</button>
      </template>
    </Modal>

    <!-- ═══ Lab report preview (read-only, no print button) ══════════════════ -->
    <Modal :show="!!labPreview || labPreviewLoading || !!labPreviewError"
           :title="`Lab Report ${labPreview?.lab_number || ''}`" size="2xl"
           @close="closeLabPreview">
      <div v-if="labPreviewLoading" class="p-6 text-center text-sm text-slate-500">Loading…</div>
      <div v-else-if="labPreviewError"
           class="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
        {{ labPreviewError }}
      </div>
      <div v-else-if="labPreview" class="space-y-3">
        <!-- Compact header: patient + status + dates. No QR / letterhead —
             this is an in-chart preview, not a printable clinical document. -->
        <div class="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 pb-2 text-xs">
          <div>
            <div class="font-semibold text-slate-800">
              {{ [labPreview.patient_first_name, labPreview.patient_last_name].filter(Boolean).join(' ') || '—' }}
            </div>
            <div class="text-slate-500">
              <span class="font-mono">{{ labPreview.patient_number || '' }}</span>
              <span v-if="labPreview.item_category_name" class="ml-2">· {{ labPreview.item_category_name }}</span>
            </div>
          </div>
          <div class="text-right">
            <div class="font-mono font-semibold text-slate-800">{{ labPreview.lab_number }}</div>
            <div>
              <span class="badge" :class="labStatusBadgeClass(labPreview.status)">{{ labPreview.status }}</span>
              <span v-if="labPreview.finalized_at" class="ml-1 text-slate-500">
                {{ formatDateTime(labPreview.finalized_at) }}
              </span>
            </div>
          </div>
        </div>

        <div v-if="labPreview.item_category_print_title || labPreview.item_category_name"
             class="rounded border-l-4 border-slate-400 bg-slate-100 px-3 py-1 text-sm font-bold tracking-wide text-slate-800 uppercase [word-spacing:0.4em]">
          {{ labPreview.item_category_print_title || labPreview.item_category_name }}
        </div>

        <div v-for="it in (labPreview.items || [])" :key="it.uuid" class="text-xs">
          <div class="mb-0.5 border-b border-slate-200 pb-0.5">
            <div class="flex flex-wrap items-baseline gap-2">
              <div class="text-sm font-semibold text-slate-800">{{ it.test_name }}</div>
              <div class="font-mono text-[10px] text-slate-500">{{ it.test_code }}</div>
              <div v-if="it.specimen" class="text-[10px] text-slate-500">· specimen: {{ it.specimen }}</div>
            </div>
            <div v-if="it.method" class="text-[10px] italic text-slate-600">Method: {{ it.method }}</div>
          </div>
          <div v-if="it.result_type === 'single' || it.result_type === 'panel'">
            <table class="w-full text-xs leading-tight">
              <thead class="text-[10px] uppercase text-slate-500">
                <tr>
                  <th class="w-1/3 text-left font-semibold">Analyte</th>
                  <th class="text-left font-semibold">Result</th>
                  <th v-if="anyUnit(it)" class="w-16 text-left font-semibold">Unit</th>
                  <th v-if="anyReference(it)" class="w-40 text-left font-semibold">Reference</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="grp in groupBySection(it.values)" :key="grp.section || 'none'">
                  <tr v-if="grp.section">
                    <td colspan="4" class="pt-0.5 pb-0 text-[10px] font-bold uppercase tracking-wider text-slate-700 [word-spacing:0.35em]">
                      {{ grp.section }}
                    </td>
                  </tr>
                  <tr v-for="v in grp.values" :key="v.uuid" class="border-b border-slate-100">
                    <td class="py-px">{{ v.component_name }}</td>
                    <td class="py-px">{{ v.value_text || '' }}</td>
                    <td v-if="anyUnit(it)" class="py-px text-slate-500">{{ v.unit_of_measure || '' }}</td>
                    <td v-if="anyReference(it)" class="py-px text-slate-500">{{ v.reference_range || '' }}</td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
          <div v-else-if="it.result_type === 'matrix'">
            <table class="w-full text-xs leading-tight border-collapse">
              <thead class="text-[10px] uppercase text-slate-500">
                <tr>
                  <th class="text-left font-semibold border-b border-slate-200"></th>
                  <th v-for="c in buildMatrixGrid(it).cols" :key="c"
                      class="text-left font-semibold border-b border-slate-200 px-2">{{ c }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in buildMatrixGrid(it).rows" :key="row" class="border-b border-slate-100">
                  <td class="py-px pr-3 font-medium text-slate-700">{{ row }}</td>
                  <td v-for="c in buildMatrixGrid(it).cols" :key="c" class="py-px px-2">
                    {{ (buildMatrixGrid(it).cells.get(row+'|'+c) || {}).value_text || '' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="whitespace-pre-wrap text-xs leading-tight">{{ it.narrative_text || '—' }}</div>
        </div>

        <div v-if="labPreview.remarks" class="border-t border-slate-200 pt-1 text-xs">
          <span class="font-semibold">Remarks:</span> {{ labPreview.remarks }}
        </div>

        <div class="mt-3 grid grid-cols-2 gap-6 border-t border-slate-200 pt-3 text-xs">
          <div>
            <div class="font-semibold">{{ labPreview.medtech_name || '—' }}</div>
            <div v-if="labPreview.medtech_license" class="text-[10px] text-slate-500">Lic. No. {{ labPreview.medtech_license }}</div>
            <div class="text-slate-500">{{ labPreview.item_group_tester_role || 'Medical Technologist' }}</div>
          </div>
          <div>
            <div class="font-semibold">{{ labPreview.pathologist_name || '—' }}</div>
            <div v-if="labPreview.pathologist_license" class="text-[10px] text-slate-500">Lic. No. {{ labPreview.pathologist_license }}</div>
            <div class="text-slate-500">Pathologist</div>
          </div>
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="closeLabPreview">Close</button>
      </template>
    </Modal>

    <ConfirmDialog
      :show="confirmStatus.show"
      :title="confirmStatus.next === 'active' ? 'Activate patient' : 'Deactivate patient'"
      :message="confirmStatus.next === 'active'
        ? `Make ${fullName(confirmStatus.patient)} active again?`
        : `${fullName(confirmStatus.patient)} will be hidden from routine lookups. Continue?`"
      :confirm-text="confirmStatus.next === 'active' ? 'Activate' : 'Deactivate'"
      :danger="confirmStatus.next !== 'active'"
      @close="confirmStatus = { show: false, patient: null, next: '' }"
      @confirm="doToggleStatus"
    />

    <ConfirmDialog
      :show="confirmDelete.show"
      title="Delete patient"
      :message="confirmDelete.patient
        ? `This will permanently delete ${fullName(confirmDelete.patient)} (${confirmDelete.patient.patient_number}). This cannot be undone.`
        : ''"
      confirm-text="Delete"
      @close="confirmDelete = { show: false, patient: null }"
      @confirm="doDelete"
    />
  </div>
</template>
