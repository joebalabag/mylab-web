<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { usePatientCasesStore } from '../stores/patientCases'
import { useTestItemsStore } from '../stores/testItems'
import { useItemPackagesStore } from '../stores/itemPackages'
import { useItemCategoriesStore } from '../stores/itemCategories'
import { useDiscountsStore } from '../stores/discounts'
import { useAuthStore } from '../stores/auth'
import Modal from '../components/Modal.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import EmptyState from '../components/EmptyState.vue'
import SkeletonRows from '../components/SkeletonRows.vue'
import RowActionMenu from '../components/RowActionMenu.vue'
import MobileFilterBar from '../components/MobileFilterBar.vue'
import { money, formatDateTime } from '../utils/format'
import { CASE_TYPES, viewPatientCase } from '../api/patientCases'
import { searchPatients, listPatients, createPatient, viewPatient, PATIENT_SEXES } from '../api/patients'
import {
  listPatientRequisitions,
  createPatientRequisition,
  viewPatientRequisition,
  updatePatientRequisition,
  deletePatientRequisition,
  setPatientRequisitionStatus,
  syncPatientRequisitionItems,
  setPatientRequisitionDiscount,
} from '../api/patientRequisitions'
import { viewItemPackage } from '../api/itemPackages'

const cases      = usePatientCasesStore()
const testItems  = useTestItemsStore()
const packages   = useItemPackagesStore()
const categories = useItemCategoriesStore()
const discounts  = useDiscountsStore()
const auth       = useAuthStore()

const search       = ref('')
const typeFilter   = ref('')
const statusFilter = ref('')
const listError    = ref('')

async function loadCases() {
  listError.value = ''
  cases.setFilters({
    tenant_uuid: auth.tenantUuid || '',
    case_type: typeFilter.value || '',
    keywords: search.value.trim(),
    status: statusFilter.value ? [statusFilter.value] : []
  })
  try {
    await cases.fetch()
  } catch (e) {
    listError.value = e?.message || 'Failed to load patient cases'
  }
}
async function loadCatalogs() {
  try {
    await Promise.all([
      testItems.fetch({ page_number: 0, page_size: 500 }),
      packages.fetch({ page_number: 0, page_size: 500 }),
      categories.fetch({ page_number: 0, page_size: 500 }),
      discounts.fetch({ page_number: 0, page_size: 500 })
    ])
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Failed to preload catalogs', e)
  }
}
onMounted(async () => {
  await Promise.all([loadCases(), loadCatalogs()])
})

function onSearchEnter()  { loadCases() }
function onFilterChange() { loadCases() }

const filtered   = computed(() => cases.items)
const totalCount = computed(() => cases.total || cases.items.length)
const openCount  = computed(() => cases.items.filter(c => c.status === 'open').length)

const activeTestItems = computed(() => testItems.items.filter(t => t.status === 'active'))
const activePackages  = computed(() => packages.items.filter(p => p.status === 'active'))
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
  const parts = [row.patient_first_name, row.patient_middle_name, row.patient_last_name]
  const joined = parts.filter(Boolean).join(' ')
  return row.patient_suffix ? `${joined} ${row.patient_suffix}` : joined
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
function toDateTimeInputValue(d) {
  if (!d) return ''
  const x = new Date(String(d).replace(' ', 'T'))
  if (isNaN(x.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`
}

// ═══════════════════════════════════════════════════════════════════════════
// ADD FLOW — search patient → pick or create → open case form
// ═══════════════════════════════════════════════════════════════════════════
const showPatientSearch = ref(false)
const patSearchForm = ref({ first_name: '', last_name: '', birthdate: '' })
const patSearchResults = ref([])
const patSearchLoading = ref(false)
const patSearchError = ref('')
const patSearchTouched = ref(false)

function openAddFlow() {
  patSearchForm.value = { first_name: '', last_name: '', birthdate: '' }
  patSearchResults.value = []
  patSearchTouched.value = false
  patSearchError.value = ''
  showPatientSearch.value = true
}
async function runPatientSearch() {
  patSearchError.value = ''
  const first = patSearchForm.value.first_name.trim()
  const last  = patSearchForm.value.last_name.trim()
  if (!first && !last) {
    patSearchError.value = 'Enter at least a first or last name'
    return
  }
  patSearchLoading.value = true
  patSearchTouched.value = true
  try {
    const rows = await searchPatients({
      first_name: first || undefined,
      last_name:  last  || undefined,
      birthdate:  patSearchForm.value.birthdate || undefined,
      limit: 20
    })
    patSearchResults.value = Array.isArray(rows) ? rows : []
  } catch (e) {
    patSearchError.value = e?.message || 'Search failed'
  } finally {
    patSearchLoading.value = false
  }
}
function chooseExistingPatient(p) {
  showPatientSearch.value = false
  openCaseForm(p)
}
function proceedRegisterAndCreateCase() {
  // No hit on the patient search — jump into the combined register+case
  // flow and pre-fill the patient identity fields from whatever the user
  // typed into the search so they don't type it twice.
  const prefill = {
    first_name: patSearchForm.value.first_name.trim(),
    last_name:  patSearchForm.value.last_name.trim(),
    birthdate:  patSearchForm.value.birthdate || '',
  }
  showPatientSearch.value = false
  openNewPatientCaseForm(prefill)
}

// ═══════════════════════════════════════════════════════════════════════════
// CASE FORM (add / edit)
// caseFormMode:
//   'existing' → operator picked a patient in the search modal; identity
//                is shown as a read-only chip.
//   'new'      → search found nothing; operator is registering a new patient
//                AND creating a case in one flow. Identity fields are editable.
// admission_date is server-owned in create paths (auto-populated to now on
// the backend) so we don't render it on the form; discharge_date only shows
// on Edit (a case starts open by default).
// ═══════════════════════════════════════════════════════════════════════════
const showForm = ref(false)
const editing  = ref(null)
const caseFormMode = ref('existing')
const selectedPatient = ref(null)
const emptyForm = () => ({
  case_type: 'OPD',
  admission_date: toDateTimeInputValue(new Date()),
  discharge_date: '',
  chief_complaint: '',
  attending_physician: '',
  referring_physician: '',
  notes: ''
})
const emptyNewPatient = () => ({
  first_name: '', middle_name: '', last_name: '', suffix: '',
  sex: 'M', birthdate: '',
  contact_number: '', email: '',
  address_street1: '', city: '', province: '',
})
const form = ref(emptyForm())
const newPatientForm = ref(emptyNewPatient())
const formError = ref('')
const submitting = ref(false)

function openCaseForm(patient) {
  editing.value = null
  caseFormMode.value = 'existing'
  selectedPatient.value = patient
  form.value = emptyForm()
  newPatientForm.value = emptyNewPatient()
  formError.value = ''
  showForm.value = true
}
function openNewPatientCaseForm(prefill = {}) {
  editing.value = null
  caseFormMode.value = 'new'
  selectedPatient.value = null
  form.value = emptyForm()
  newPatientForm.value = {
    ...emptyNewPatient(),
    first_name: prefill.first_name || '',
    last_name:  prefill.last_name  || '',
    birthdate:  prefill.birthdate  || '',
  }
  formError.value = ''
  showForm.value = true
}
async function openEdit(row) {
  editing.value = row
  caseFormMode.value = 'existing'
  newPatientForm.value = emptyNewPatient()
  // Seed with denormalized case-row fields so the summary renders
  // immediately, then hydrate with the full patient record so contact,
  // address, blood type, allergies, etc. can appear too.
  selectedPatient.value = {
    uuid: row.patient_uuid,
    patient_number: row.patient_number,
    first_name: row.patient_first_name,
    middle_name: row.patient_middle_name,
    last_name: row.patient_last_name,
    suffix: row.patient_suffix,
    sex: row.patient_sex,
    birthdate: row.patient_birthdate,
  }
  // Non-fatal — the summary just stays minimal if this fails.
  viewPatient(row.patient_uuid)
    .then((full) => { if (full) selectedPatient.value = full })
    .catch(() => {})
  form.value = {
    case_type: row.case_type || 'OPD',
    admission_date: toDateTimeInputValue(row.admission_date),
    discharge_date: toDateTimeInputValue(row.discharge_date),
    chief_complaint: row.chief_complaint || '',
    attending_physician: row.attending_physician || '',
    referring_physician: row.referring_physician || '',
    notes: row.notes || ''
  }
  formError.value = ''
  showForm.value = true
}

async function submitCase() {
  formError.value = ''
  if (!form.value.case_type) { formError.value = 'Case type is required'; return }

  // Existing modes need a patient already selected; new-patient mode
  // validates the inline patient form instead.
  if (caseFormMode.value === 'new') {
    const first = newPatientForm.value.first_name.trim()
    const last  = newPatientForm.value.last_name.trim()
    if (!first)                     { formError.value = 'Patient first name is required'; return }
    if (!last)                      { formError.value = 'Patient last name is required'; return }
    if (!newPatientForm.value.sex)  { formError.value = 'Patient sex is required'; return }
  } else if (!selectedPatient.value?.uuid && !editing.value) {
    formError.value = 'Patient is required'
    return
  }

  // In Edit we still respect the operator's timestamp inputs (they may need
  // to correct a back-dated admission or mark a discharge). Create paths
  // let the server auto-populate admission_date and skip discharge_date
  // (a case is opened, not closed, on registration).
  const casePayload = {
    case_type: form.value.case_type,
    chief_complaint: form.value.chief_complaint.trim() || undefined,
    attending_physician: form.value.attending_physician.trim() || undefined,
    referring_physician: form.value.referring_physician.trim() || undefined,
    notes: form.value.notes.trim() || undefined,
  }
  if (editing.value) {
    casePayload.admission_date = form.value.admission_date || undefined
    casePayload.discharge_date = form.value.discharge_date || undefined
  }

  submitting.value = true
  try {
    if (editing.value) {
      await cases.update(editing.value.uuid, casePayload)
      flash(`Updated ${editing.value.case_number}`)
      showForm.value = false
      await loadCases()
      return
    }

    // Create path — for new-patient mode, register the patient first and
    // hand its uuid to the case create. selectedPatient is cached so the
    // after-create prompt and the case row payload can show the identity.
    let patientForCase = selectedPatient.value
    if (caseFormMode.value === 'new') {
      const p = newPatientForm.value
      const createdPatient = await createPatient({
        tenant_uuid: auth.tenantUuid || undefined,
        first_name: p.first_name.trim(),
        middle_name: p.middle_name.trim() || undefined,
        last_name: p.last_name.trim(),
        suffix: p.suffix.trim() || undefined,
        sex: p.sex,
        birthdate: p.birthdate || undefined,
        contact_number: p.contact_number.trim() || undefined,
        email: p.email.trim() || undefined,
        address_street1: p.address_street1.trim() || undefined,
        city: p.city.trim() || undefined,
        province: p.province.trim() || undefined,
      })
      if (!createdPatient?.uuid) throw new Error('Failed to register patient')
      patientForCase = createdPatient
      selectedPatient.value = createdPatient
    }

    const created = await cases.create({
      tenant_uuid: auth.tenantUuid || undefined,
      patient_uuid: patientForCase.uuid,
      ...casePayload,
    })
    flash(
      caseFormMode.value === 'new'
        ? `Registered patient ${patientForCase.patient_number || ''} · created case ${created?.case_number}`
        : `Created case ${created?.case_number}`
    )
    showForm.value = false
    await loadCases()

    // Prompt: add requisition now?
    promptRequisitionAfterCreate.value = {
      show: true,
      caseRow: {
        ...created,
        patient_number: patientForCase.patient_number,
        patient_first_name: patientForCase.first_name,
        patient_middle_name: patientForCase.middle_name,
        patient_last_name: patientForCase.last_name,
        patient_suffix: patientForCase.suffix,
      }
    }
  } catch (e) {
    formError.value = e?.message || 'Failed to save case'
  } finally {
    submitting.value = false
  }
}

// ─── After-create prompt ───
const promptRequisitionAfterCreate = ref({ show: false, caseRow: null })
function skipRequisition() { promptRequisitionAfterCreate.value = { show: false, caseRow: null } }
async function proceedToRequisitionFromPrompt() {
  const row = promptRequisitionAfterCreate.value.caseRow
  promptRequisitionAfterCreate.value = { show: false, caseRow: null }
  if (row) await openCaseView(row, /* focusAddRequisition */ true)
}

// ═══════════════════════════════════════════════════════════════════════════
// CASE VIEW — read-only case + requisition list + add/edit requisition inline
// ═══════════════════════════════════════════════════════════════════════════
const showView = ref(false)
const viewing = ref(null)
const viewLoading = ref(false)
const requisitions = ref([])
const requisitionsLoading = ref(false)

async function openCaseView(row, focusAddRequisition = false) {
  viewing.value = row
  showView.value = true
  viewLoading.value = true
  requisitionsLoading.value = true
  try {
    // Case detail (uses same shape as list row; we could fetch full but the
    // list already carries everything we need for the header).
    const full = await viewPatientCase(row.uuid)
    if (full) viewing.value = { ...full, ...row, ...full }
  } catch (e) { /* non-fatal */ } finally { viewLoading.value = false }

  try {
    const res = await listPatientRequisitions({
      tenant_uuid: auth.tenantUuid || undefined,
      patient_case_uuid: row.uuid,
      page_size: 100
    })
    requisitions.value = Array.isArray(res?.results) ? res.results : []
  } catch (e) {
    requisitions.value = []
  } finally {
    requisitionsLoading.value = false
  }

  if (focusAddRequisition) await openNewRequisition()
}
function closeCaseView() {
  showView.value = false
  viewing.value = null
  requisitions.value = []
}

async function reloadRequisitions() {
  if (!viewing.value?.uuid) return
  requisitionsLoading.value = true
  try {
    const res = await listPatientRequisitions({
      tenant_uuid: auth.tenantUuid || undefined,
      patient_case_uuid: viewing.value.uuid,
      page_size: 100
    })
    requisitions.value = Array.isArray(res?.results) ? res.results : []
  } finally {
    requisitionsLoading.value = false
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// REQUISITION MODAL — add/edit a requisition against the currently-open case
//
// UI shape (new):
//   1. Case + patient context banner
//   2. Top: catalog picker with [Tests] [Packages] tabs
//        - Tests tab:    search → table → click "+ Add" to append
//        - Packages tab: search → table → each row expandable to preview its
//                        contained items; click "+ Add" to append the package
//                        as a single line
//   3. Bottom: requested-items table (editable qty / unit_price / remove)
//   4. Discount picker + live totals
// ═══════════════════════════════════════════════════════════════════════════
const showReqForm = ref(false)
const editingReq  = ref(null)
const reqForm = ref({ requisition_date: toDateTimeInputValue(new Date()), notes: '', physician: '' })
const reqLines = ref([])                // requested items (bottom table)
const reqLinesLoading = ref(false)
const reqError = ref('')
const reqSubmitting = ref(false)

// Catalog picker state (top table)
const catalogTab = ref('tests')          // 'tests' | 'packages'
const catalogSearch = ref('')
const catalogCategoryFilter = ref('')    // '' | item_category_uuid
const expandedPackageUuid = ref('')      // which package row is expanded

// Categories that have at least one active test — keeps the filter dropdown
// tight (won't list a category that has no orderable tests).
const activeCategoriesForTests = computed(() => {
  const used = new Set(activeTestItems.value.map(t => t.item_category_uuid).filter(Boolean))
  return categories.items.filter(c => c.status === 'active' && used.has(c.uuid))
})

// Discount state
const reqDiscount = ref({ discount_uuid: '', discount_open_amount: 0 })

function removeReqLine(i) {
  reqLines.value = reqLines.value.filter((_, idx) => idx !== i)
}
function clearReqLines() {
  // Prompt when the basket has more than one row — nuking a single row is
  // trivially reversible so no need to interrupt.
  if (reqLines.value.length > 1 && !confirm('Clear all requested items?')) return
  reqLines.value = []
}

// ─── Catalog picker helpers ───
// Prevent double-adding the same source. The chosen sets are used to dim the
// "+ Add" button in the top table so already-added items visually flag as
// selected without a second lookup per row.
const chosenTestUuids = computed(() => new Set(
  reqLines.value.filter(l => l.source_type === 'test_item').map(l => l.source_uuid)
))
// A package is considered "added" when any of its exploded rows are in the
// basket. Uses package_uuid — set on every row spawned by exploding a package.
const chosenPackageUuids = computed(() => new Set(
  reqLines.value.map(l => l.package_uuid).filter(Boolean)
))
// True when at least one line originated from a package. Drives the
// discount-picker disable + note (bundled discount already applied).
const hasPackageLines = computed(() => reqLines.value.some(l => !!l.package_uuid))

// If a package sneaks in, drop any requisition-level discount the operator
// had picked — the package price already reflects a bundled discount so a
// second discount would double-dip.
watch(hasPackageLines, (v) => {
  if (v) {
    reqDiscount.value.discount_uuid = ''
    reqDiscount.value.discount_open_amount = 0
  }
})

const catalogTestResults = computed(() => {
  const q = String(catalogSearch.value || '').trim().toLowerCase()
  const cat = catalogCategoryFilter.value
  let base = activeTestItems.value
  if (cat) base = base.filter(t => t.item_category_uuid === cat)
  if (!q) return base.slice(0, 50)
  return base.filter(t =>
    t.code?.toLowerCase().includes(q) ||
    t.name?.toLowerCase().includes(q) ||
    t.item_category_name?.toLowerCase().includes(q)
  ).slice(0, 50)
})
const catalogPackageResults = computed(() => {
  const q = String(catalogSearch.value || '').trim().toLowerCase()
  const base = activePackages.value
  if (!q) return base.slice(0, 50)
  return base.filter(p =>
    p.code?.toLowerCase().includes(q) ||
    p.name?.toLowerCase().includes(q)
  ).slice(0, 50)
})

function addTestToBasket(t) {
  if (chosenTestUuids.value.has(t.uuid)) return
  reqLines.value = [...reqLines.value, {
    uuid: null,
    source_type: 'test_item',
    source_uuid: t.uuid,
    _code: t.code, _name: t.name,
    quantity: 1,
    unit_price: Number(t.price ?? 0),
  }]
}
/**
 * Adding a package EXPLODES it into one test_item row per contained item.
 * Each row carries package_uuid/code/name so the UI can group them visually
 * and later result-generation can key off the individual test_item_uuid.
 * The unit_price used is the package's discounted new_price for that item.
 *
 * Idempotent: refuses if the package is already exploded into the basket
 * (chosenPackageUuids remembers "we already added this package").
 */
async function addPackageToBasket(p) {
  if (chosenPackageUuids.value.has(p.uuid)) return

  // Ensure items are loaded for this package.
  if (!packageItemsCache.value[p.uuid]) {
    packageItemsLoading.value = { ...packageItemsLoading.value, [p.uuid]: true }
    try {
      const full = await viewItemPackage(p.uuid)
      packageItemsCache.value = {
        ...packageItemsCache.value,
        [p.uuid]: Array.isArray(full?.items) ? full.items : [],
      }
    } catch (e) {
      packageItemsCache.value = { ...packageItemsCache.value, [p.uuid]: [] }
    } finally {
      packageItemsLoading.value = { ...packageItemsLoading.value, [p.uuid]: false }
    }
  }

  const items = packageItemsCache.value[p.uuid] || []
  if (!items.length) {
    // Empty package — nothing to explode. Surface a hint rather than
    // silently do nothing.
    reqError.value = `Package ${p.code} has no items configured.`
    return
  }

  // Skip tests already in the basket (whether standalone or from a prior
  // package) so we don't double-book the same test.
  const newRows = items
    .filter(it => !chosenTestUuids.value.has(it.test_item_uuid))
    .map(it => ({
      uuid: null,
      source_type: 'test_item',
      source_uuid: it.test_item_uuid,
      _code: it.test_item_code || '',
      _name: it.test_item_name || '',
      quantity: 1,
      unit_price: Number(it.new_price ?? 0),
      package_uuid: p.uuid,
      package_code: p.code,
      package_name: p.name,
    }))
  if (!newRows.length) {
    reqError.value = `All items in ${p.code} are already in the requested list.`
    return
  }
  reqLines.value = [...reqLines.value, ...newRows]
  reqError.value = ''
}

// Package expansion — fetch items on first expand, cache per uuid.
const packageItemsCache = ref({})    // { [pkg_uuid]: [items[]] }
const packageItemsLoading = ref({})  // { [pkg_uuid]: true|false }
async function togglePackageExpand(pkg) {
  if (expandedPackageUuid.value === pkg.uuid) {
    expandedPackageUuid.value = ''
    return
  }
  expandedPackageUuid.value = pkg.uuid
  if (packageItemsCache.value[pkg.uuid]) return
  packageItemsLoading.value = { ...packageItemsLoading.value, [pkg.uuid]: true }
  try {
    const full = await viewItemPackage(pkg.uuid)
    packageItemsCache.value = {
      ...packageItemsCache.value,
      [pkg.uuid]: Array.isArray(full?.items) ? full.items : [],
    }
  } catch (e) {
    packageItemsCache.value = { ...packageItemsCache.value, [pkg.uuid]: [] }
  } finally {
    packageItemsLoading.value = { ...packageItemsLoading.value, [pkg.uuid]: false }
  }
}

// Resolve display fields for a basket row. Prefer the snapshot we stashed at
// add-time; fall back to a live catalog lookup (needed on Edit where rows come
// from the API without _code/_name).
function basketRowLabel(row) {
  if (row._code || row._name) return { code: row._code || '', name: row._name || '' }
  const catalog = row.source_type === 'item_package' ? activePackages.value : activeTestItems.value
  const hit = catalog.find(x => x.uuid === row.source_uuid)
  return { code: hit?.code || '—', name: hit?.name || '' }
}

// Live subtotal from lines.
const reqSubtotal = computed(() =>
  reqLines.value.reduce((s, r) => s + (Number(r.unit_price) || 0) * (Number(r.quantity) || 0), 0)
)
// Selected discount preview — computed client-side so operator sees the number
// before Save. Backend recomputes authoritatively on save.
const selectedDiscount = computed(() =>
  activeDiscounts.value.find(d => d.uuid === reqDiscount.value.discount_uuid) || null
)
const reqDiscountAmount = computed(() => {
  const d = selectedDiscount.value
  if (!d || reqSubtotal.value <= 0) return 0
  let raw = 0
  if (d.discount_type === 'percent') raw = reqSubtotal.value * Number(d.value ?? 0) / 100
  else if (d.discount_type === 'fix') raw = Number(d.value ?? 0)
  else if (d.discount_type === 'open_amount') raw = Number(reqDiscount.value.discount_open_amount || 0)
  if (raw < 0) raw = 0
  if (raw > reqSubtotal.value) raw = reqSubtotal.value
  return Math.round(raw * 100) / 100
})
const reqTotal = computed(() => Math.max(0, Math.round((reqSubtotal.value - reqDiscountAmount.value) * 100) / 100))

function resetCatalogPickerState() {
  catalogTab.value = 'tests'
  catalogSearch.value = ''
  expandedPackageUuid.value = ''
  packageItemsCache.value = {}
  packageItemsLoading.value = {}
}

async function openNewRequisition() {
  if (!viewing.value?.uuid) return
  editingReq.value = null
  reqForm.value = { requisition_date: toDateTimeInputValue(new Date()), notes: '' }
  reqLines.value = []
  reqDiscount.value = { discount_uuid: '', discount_open_amount: 0 }
  reqError.value = ''
  resetCatalogPickerState()
  showReqForm.value = true
}
async function openEditRequisition(req) {
  editingReq.value = req
  reqForm.value = {
    requisition_date: toDateTimeInputValue(req.requisition_date),
    notes: req.notes || '',
    physician: req.physician || '',
  }
  reqLines.value = []
  reqDiscount.value = {
    discount_uuid: req.discount_uuid || '',
    discount_open_amount: req.discount_type === 'open_amount' ? Number(req.discount_amount || 0) : 0,
  }
  reqError.value = ''
  resetCatalogPickerState()
  showReqForm.value = true

  reqLinesLoading.value = true
  try {
    const full = await viewPatientRequisition(req.uuid)
    if (Array.isArray(full?.items)) {
      // Snapshot code/name from the stored item row so the basket table
      // doesn't need to hit the catalog to render (helpful when a source
      // was later renamed in the catalog — historical rows still print
      // the label they were saved with).
      reqLines.value = full.items.map((it) => ({
        uuid: it.uuid,
        source_type: it.source_type,
        source_uuid: it.source_uuid,
        _code: it.code, _name: it.name,
        quantity: Number(it.quantity ?? 1),
        unit_price: Number(it.unit_price ?? 0),
        package_uuid: it.package_uuid || null,
        package_code: it.package_code || null,
        package_name: it.package_name || null,
      }))
    }
    // Prefer live discount snapshot from full record over the list-row.
    if (full) {
      reqDiscount.value.discount_uuid = full.discount_uuid || ''
      if (full.discount_type === 'open_amount') {
        reqDiscount.value.discount_open_amount = Number(full.discount_amount || 0)
      }
    }
  } catch (e) {
    /* non-fatal */
  } finally {
    reqLinesLoading.value = false
  }
}

// ─── Create-confirmation dialog ─────────────────────────────────
// The Create path runs a small confirm step so a fat-finger on the primary
// button doesn't fire off a partial requisition. The dialog also exposes
// the second commit path — Create & Finalize — which flips status to
// 'finalized' after the sync lands so downstream systems (result entry,
// billing) can treat the order as locked. Edit mode skips the confirm
// entirely — saving an existing draft is a low-stakes action.
const showReqConfirm = ref(false)

function askSubmitRequisition() {
  if (!viewing.value?.uuid) { reqError.value = 'No case open'; return }
  reqError.value = ''

  if (!reqLines.value.length) {
    reqError.value = 'Add at least one test or package from the catalog above.'
    return
  }
  for (let i = 0; i < reqLines.value.length; i++) {
    if (Number(reqLines.value[i].quantity) < 1) {
      reqError.value = `Line #${i + 1}: quantity must be ≥ 1`
      return
    }
  }

  // Edit mode: skip the extra prompt — operator is just correcting a draft.
  if (editingReq.value) {
    submitRequisition({ finalize: false })
  } else {
    showReqConfirm.value = true
  }
}

async function submitRequisition({ finalize = false } = {}) {
  showReqConfirm.value = false
  if (!viewing.value?.uuid) { reqError.value = 'No case open'; return }

  reqSubmitting.value = true
  try {
    let targetUuid = editingReq.value?.uuid
    if (editingReq.value) {
      // Edit lets the operator back-date; Create leaves requisition_date
      // to the server (auto-set to now() at insert time).
      await updatePatientRequisition(editingReq.value.uuid, {
        requisition_date: reqForm.value.requisition_date || undefined,
        notes: reqForm.value.notes || undefined,
        physician: reqForm.value.physician || undefined,
      })
    } else {
      const created = await createPatientRequisition({
        tenant_uuid: auth.tenantUuid || undefined,
        patient_case_uuid: viewing.value.uuid,
        notes: reqForm.value.notes || undefined,
        physician: reqForm.value.physician || undefined,
      })
      targetUuid = created?.uuid
    }

    if (targetUuid) {
      const rows = reqLines.value.map((r, idx) => ({
        uuid: r.uuid || undefined,
        source_type: r.source_type,
        source_uuid: r.source_uuid,
        quantity: Number(r.quantity) || 1,
        unit_price: Number(r.unit_price) || 0,
        display_order: idx,
        package_uuid: r.package_uuid || undefined,
        package_code: r.package_code || undefined,
        package_name: r.package_name || undefined,
      }))
      await syncPatientRequisitionItems(targetUuid, rows)

      // Discount is a separate transaction so we can apply/clear it
      // regardless of the items diff. Backend recomputes total off the
      // fresh subtotal.
      if (reqDiscount.value.discount_uuid) {
        await setPatientRequisitionDiscount(targetUuid, {
          discount_uuid: reqDiscount.value.discount_uuid,
          discount_open_amount: reqDiscount.value.discount_open_amount || 0,
        })
      } else {
        // Explicit clear so removing a previously-set discount lands too.
        await setPatientRequisitionDiscount(targetUuid, { clear: true })
      }

      // Finalize the requisition once items + discount are in place. Runs
      // strictly after the sync so a bad sync doesn't leave a "finalized"
      // shell around a broken cart.
      if (finalize && !editingReq.value) {
        await setPatientRequisitionStatus(targetUuid, 'finalized')
      }
    }

    flash(
      editingReq.value
        ? 'Requisition updated'
        : (finalize ? 'Requisition created & finalized' : 'Requisition created — saved as draft'),
    )
    showReqForm.value = false
    await reloadRequisitions()
  } catch (e) {
    reqError.value = e?.message || 'Failed to save requisition'
  } finally {
    reqSubmitting.value = false
  }
}

// Requisition status changes + delete
async function reqSetStatus(req, next) {
  try {
    await setPatientRequisitionStatus(req.uuid, next)
    flash(`${req.requisition_number} is now ${next}`)
    await reloadRequisitions()
  } catch (e) { flashError(e, 'Failed to update requisition status') }
}
// Delete confirm goes through a proper modal (ConfirmDialog) instead of the
// browser prompt — matches the case-delete flow and reads better.
const confirmReqDelete = ref({ show: false, req: null })
function askReqDelete(req) { confirmReqDelete.value = { show: true, req } }
async function doReqDelete() {
  const req = confirmReqDelete.value.req
  confirmReqDelete.value = { show: false, req: null }
  if (!req) return
  try {
    await deletePatientRequisition(req.uuid)
    flash(`Deleted ${req.requisition_number}`)
    await reloadRequisitions()
  } catch (e) { flashError(e, 'Failed to delete requisition') }
}

// ─── Case status / delete ───
const confirmStatus = ref({ show: false, caseRow: null, next: '' })
function askToggleStatus(row) {
  const next = row.status === 'open' ? 'closed' : 'open'
  confirmStatus.value = { show: true, caseRow: row, next }
}
async function doToggleStatus() {
  const { caseRow, next } = confirmStatus.value
  confirmStatus.value = { show: false, caseRow: null, next: '' }
  try {
    await cases.setStatus(caseRow.uuid, next)
    flash(`${caseRow.case_number} is now ${next}`)
  } catch (e) { flashError(e, 'Failed to update case status') }
}
const confirmDelete = ref({ show: false, caseRow: null })
function askDelete(row) { confirmDelete.value = { show: true, caseRow: row } }
async function doDelete() {
  const row = confirmDelete.value.caseRow
  confirmDelete.value = { show: false, caseRow: null }
  try {
    await cases.remove(row.uuid)
    flash(`Deleted ${row.case_number}`)
  } catch (e) { flashError(e, 'Failed to delete case') }
}

function actionsFor(row) {
  const isOpen = row.status === 'open'
  return [
    { label: 'View case',           icon: 'eye',     onClick: () => openCaseView(row) },
    { label: 'Patient Requisitions', icon: 'history', onClick: () => openCaseView(row) },
    { label: 'Edit case',           icon: 'edit',    onClick: () => openEdit(row) },
    { label: isOpen ? 'Close case' : 'Reopen case',
      icon:  isOpen ? 'deactivate' : 'activate',
      variant: isOpen ? 'danger' : 'success',
      onClick: () => askToggleStatus(row) },
    { divider: true },
    { label: 'Delete case', icon: 'trash', variant: 'danger', onClick: () => askDelete(row) }
  ]
}
function caseTypeBadge(t) {
  switch (t) {
    case 'OPD': return 'bg-emerald-100 text-emerald-700'
    case 'IPD': return 'bg-brand-100 text-brand-700'
    case 'ER':  return 'bg-rose-100 text-rose-700'
    default:    return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
  }
}
function reqStatusBadge(s) {
  switch (s) {
    case 'draft':     return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
    case 'finalized': return 'bg-emerald-100 text-emerald-700'
    case 'cancelled': return 'bg-rose-100 text-rose-700'
    default:          return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
  }
}
</script>

<template>
  <div class="flex h-full flex-col gap-4">
    <div class="grid grid-cols-2 gap-3 shrink-0">
      <div class="card"><div class="card-body">
        <div class="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Total Cases</div>
        <div class="mt-1 text-2xl font-bold">{{ totalCount }}</div>
      </div></div>
      <div class="card"><div class="card-body">
        <div class="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Open</div>
        <div class="mt-1 text-2xl font-bold text-emerald-600">{{ openCount }}</div>
      </div></div>
    </div>

    <div class="card flex flex-1 min-h-0 flex-col overflow-hidden">
      <div class="card-header">
        <div>
          <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">Patient Cases</div>
          <div class="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
            {{ filtered.length }} shown
            <span v-if="cases.loading" class="ml-1 text-brand-600">· loading…</span>
          </div>
        </div>
        <MobileFilterBar>
          <input
            v-model="search"
            @keyup.enter="onSearchEnter"
            placeholder="Search case #, patient, complaint… (Enter)"
            class="input w-full sm:w-72"
          />
          <select v-model="typeFilter" @change="onFilterChange" class="input w-full sm:w-28">
            <option value="">All types</option>
            <option v-for="t in CASE_TYPES" :key="t" :value="t">{{ t }}</option>
          </select>
          <select v-model="statusFilter" @change="onFilterChange" class="input w-full sm:w-36">
            <option value="">All status</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button class="btn-secondary" @click="loadCases" :disabled="cases.loading" title="Refresh">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
          </button>
          <template #action>
            <button class="btn-primary" @click="openAddFlow">+ Add Case</button>
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
          v-if="cases.loading && !cases.items.length"
          :rows="8"
          label="Loading cases…"
          :columns="['bar','lines','pill','lines','pill','bar','dot']"
        />
        <table class="table" v-else-if="filtered.length">
          <thead class="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800 shadow-[inset_0_-1px_0_theme(colors.slate.100)]">
            <tr>
              <th class="w-32">Case #</th>
              <th>Patient</th>
              <th>Type</th>
              <th>Admission</th>
              <th>Status</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in filtered" :key="row.uuid" :class="row.status !== 'open' && 'bg-slate-50/50 dark:bg-slate-800/50'">
              <td class="font-mono text-xs font-semibold">
                <button type="button"
                        class="text-brand-600 hover:text-brand-800 hover:underline"
                        @click="openCaseView(row)"
                        :title="`View ${row.case_number}`">{{ row.case_number }}</button>
              </td>
              <td>
                <div class="font-medium text-slate-800 dark:text-slate-100">{{ fullPatientName(row) }}</div>
                <div class="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
                  <span class="font-mono">{{ row.patient_number || '—' }}</span>
                  · {{ row.patient_sex || '?' }}
                  <span v-if="ageFromBirthdate(row.patient_birthdate) !== null">
                    · {{ ageFromBirthdate(row.patient_birthdate) }} y/o
                  </span>
                </div>
              </td>
              <td>
                <span class="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                      :class="caseTypeBadge(row.case_type)">{{ row.case_type }}</span>
              </td>
              <td class="text-xs text-slate-600 dark:text-slate-300">{{ formatDateTime(row.admission_date) }}</td>
              <td>
                <span class="badge"
                      :class="row.status === 'open' ? 'badge-success' : (row.status === 'cancelled' ? 'badge-danger' : 'badge-muted')">
                  <span class="mr-1 inline-block h-1.5 w-1.5 rounded-full"
                        :class="row.status === 'open' ? 'bg-emerald-500' : (row.status === 'cancelled' ? 'bg-rose-500' : 'bg-slate-400')"></span>
                  {{ row.status }}
                </span>
              </td>
              <td class="text-right">
                <RowActionMenu :actions="actionsFor(row)" />
              </td>
            </tr>
          </tbody>
        </table>
        <EmptyState v-else-if="!cases.loading" title="No patient cases" message="Register your first case to start tracking requisitions." />
      </div>
    </div>

    <!-- ═══ Step 1: search-first patient picker ═══ -->
    <Modal :show="showPatientSearch" title="Add Case — search patient" size="xl" @close="showPatientSearch = false">
      <div class="space-y-3">
        <p class="text-xs text-slate-600 dark:text-slate-300">
          Search the existing patient list. If not found, register the patient in Patients first, then come back here.
        </p>
        <form id="patCaseSearchForm" @submit.prevent="runPatientSearch" class="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label class="label">First name</label>
            <input v-model="patSearchForm.first_name" class="input" placeholder="Juan" autofocus />
          </div>
          <div>
            <label class="label">Last name</label>
            <input v-model="patSearchForm.last_name" class="input" placeholder="Dela Cruz" />
          </div>
          <div>
            <label class="label">Birthdate <span class="text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">(optional)</span></label>
            <input type="date" v-model="patSearchForm.birthdate" class="input" />
          </div>
        </form>

        <div v-if="patSearchError" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ patSearchError }}
        </div>

        <div v-if="patSearchTouched && !patSearchLoading && !patSearchResults.length"
             class="rounded-md border border-dashed border-slate-300 bg-white dark:bg-slate-900 p-3 text-center text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
          No existing patient matched. Register them in <b>Patients</b> first.
        </div>

        <div v-if="patSearchResults.length" class="overflow-hidden rounded-md border border-slate-200 dark:border-slate-700">
          <table class="w-full table-fixed text-xs">
            <thead class="bg-slate-100 dark:bg-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
              <tr>
                <th class="w-28 px-2 py-1.5 text-left">MRN</th>
                <th class="px-2 py-1.5 text-left">Name</th>
                <th class="w-32 px-2 py-1.5 text-left">Sex / Age</th>
                <th class="w-32 px-2 py-1.5 text-right"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in patSearchResults" :key="p.uuid" class="border-t border-slate-100 dark:border-slate-800 align-top">
                <td class="px-2 py-1 font-mono font-semibold text-slate-700 dark:text-slate-200 break-all">{{ p.patient_number }}</td>
                <td class="px-2 py-1 font-medium text-slate-800 dark:text-slate-100 break-words">
                  {{ [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(' ') }}<span v-if="p.suffix"> {{ p.suffix }}</span>
                </td>
                <td class="px-2 py-1 text-slate-600 dark:text-slate-300">
                  <span class="rounded bg-slate-100 dark:bg-slate-800 px-1 text-[10px] font-bold uppercase">{{ p.sex }}</span>
                  <span v-if="ageFromBirthdate(p.birthdate) !== null" class="ml-1">
                    · {{ ageFromBirthdate(p.birthdate) }} y/o
                  </span>
                </td>
                <td class="px-2 py-1 text-right">
                  <button type="button" class="btn-primary !py-0.5 !text-[11px]" @click="chooseExistingPatient(p)">
                    Use for new case
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="showPatientSearch = false">Cancel</button>
        <button class="btn-secondary" :disabled="patSearchLoading" form="patCaseSearchForm" type="submit">
          {{ patSearchLoading ? 'Searching…' : 'Search' }}
        </button>
        <button class="btn-primary" @click="proceedRegisterAndCreateCase">
          Register new patient →
        </button>
      </template>
    </Modal>

    <!-- ═══ Step 2: case form ═══
         Three shapes:
           editing existing case              → readonly patient chip + full case fields (with discharge)
           search-picked patient + new case   → readonly patient chip + slim case fields (no discharge)
           new patient (no match on search)   → editable patient identity block + slim case fields
    -->
    <Modal :show="showForm"
           :title="editing ? 'Edit Patient Case' : (caseFormMode === 'new' ? 'Register Patient & Create Case' : 'Add Patient Case')"
           size="2xl"
           @close="showForm = false">
      <form id="caseForm" @submit.prevent="submitCase" class="space-y-4">
        <!-- Existing patient summary card — shown when the operator picked from
             search or is editing a case. Renders whatever the record carries;
             empty fields collapse to '—'. Address concatenates the pieces that
             are present so we don't print a lonely comma or a bare province. -->
        <div v-if="caseFormMode === 'existing' && selectedPatient"
             class="rounded-lg border border-brand-100 bg-brand-50/50 p-3">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="text-[10px] font-bold uppercase tracking-widest text-brand-700">Patient</div>
              <div class="mt-1 flex flex-wrap items-center gap-2">
                <span class="rounded bg-white dark:bg-slate-900 px-2 py-0.5 font-mono text-xs font-bold text-slate-700 dark:text-slate-200 border border-brand-100">
                  {{ selectedPatient.patient_number || '—' }}
                </span>
                <span class="text-base font-bold text-slate-800 dark:text-slate-100">
                  {{ [selectedPatient.first_name, selectedPatient.middle_name, selectedPatient.last_name].filter(Boolean).join(' ') }}
                  <span v-if="selectedPatient.suffix"> {{ selectedPatient.suffix }}</span>
                </span>
                <span class="rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand-700">
                  {{ selectedPatient.sex || '?' }}
                </span>
                <span v-if="ageFromBirthdate(selectedPatient.birthdate) !== null"
                      class="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {{ ageFromBirthdate(selectedPatient.birthdate) }} y/o
                </span>
              </div>
            </div>
          </div>

          <div class="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
            <div>
              <span class="text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Birthdate:</span>
              <span class="ml-1 text-slate-800 dark:text-slate-100">
                {{ selectedPatient.birthdate ? formatDateTime(selectedPatient.birthdate).split(',')[0] : '—' }}
              </span>
            </div>
            <div>
              <span class="text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Civil status:</span>
              <span class="ml-1 text-slate-800 dark:text-slate-100">{{ selectedPatient.civil_status || '—' }}</span>
            </div>
            <div>
              <span class="text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Contact:</span>
              <span class="ml-1 text-slate-800 dark:text-slate-100">{{ selectedPatient.contact_number || '—' }}</span>
            </div>
            <div>
              <span class="text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Email:</span>
              <span class="ml-1 text-slate-800 dark:text-slate-100">{{ selectedPatient.email || '—' }}</span>
            </div>
            <div class="sm:col-span-2">
              <span class="text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Address:</span>
              <span class="ml-1 text-slate-800 dark:text-slate-100">
                {{ [selectedPatient.address_street1, selectedPatient.address_street2,
                     selectedPatient.city, selectedPatient.province,
                     selectedPatient.postal_code, selectedPatient.country]
                     .filter(Boolean).join(', ') || '—' }}
              </span>
            </div>
            <div>
              <span class="text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Blood type:</span>
              <span class="ml-1 text-slate-800 dark:text-slate-100">{{ selectedPatient.blood_type || '—' }}</span>
            </div>
            <div>
              <span class="text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Occupation:</span>
              <span class="ml-1 text-slate-800 dark:text-slate-100">{{ selectedPatient.occupation || '—' }}</span>
            </div>
            <div v-if="selectedPatient.allergies" class="sm:col-span-2">
              <span class="text-[10px] font-bold uppercase tracking-widest text-rose-700">Allergies:</span>
              <span class="ml-1 text-slate-800 dark:text-slate-100">{{ selectedPatient.allergies }}</span>
            </div>
            <div v-if="selectedPatient.emergency_contact_name" class="sm:col-span-2">
              <span class="text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Emergency:</span>
              <span class="ml-1 text-slate-800 dark:text-slate-100">
                {{ selectedPatient.emergency_contact_name }}
                <span v-if="selectedPatient.emergency_contact_relation" class="text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">({{ selectedPatient.emergency_contact_relation }})</span>
                <span v-if="selectedPatient.emergency_contact_number"> — {{ selectedPatient.emergency_contact_number }}</span>
              </span>
            </div>
            <div v-if="selectedPatient.philhealth_number || selectedPatient.senior_citizen_number || selectedPatient.pwd_number || selectedPatient.national_id"
                 class="sm:col-span-2 flex flex-wrap gap-x-3 gap-y-1 pt-1">
              <span v-if="selectedPatient.national_id" class="text-[11px]">
                <span class="text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">PhilSys:</span> <span class="font-mono text-slate-700 dark:text-slate-200">{{ selectedPatient.national_id }}</span>
              </span>
              <span v-if="selectedPatient.philhealth_number" class="text-[11px]">
                <span class="text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">PhilHealth:</span> <span class="font-mono text-slate-700 dark:text-slate-200">{{ selectedPatient.philhealth_number }}</span>
              </span>
              <span v-if="selectedPatient.senior_citizen_number" class="text-[11px]">
                <span class="text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Senior:</span> <span class="font-mono text-slate-700 dark:text-slate-200">{{ selectedPatient.senior_citizen_number }}</span>
              </span>
              <span v-if="selectedPatient.pwd_number" class="text-[11px]">
                <span class="text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">PWD:</span> <span class="font-mono text-slate-700 dark:text-slate-200">{{ selectedPatient.pwd_number }}</span>
              </span>
            </div>
          </div>
        </div>

        <!-- New patient block — appears when the search had no hits. Fields are
             pre-filled from what the operator typed into the search. The full
             patient profile (address, IDs, emergency contact, etc.) can be
             completed later from the Patients page. -->
        <div v-else-if="caseFormMode === 'new'" class="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 space-y-3">
          <div class="flex items-center justify-between">
            <div class="text-[10px] font-bold uppercase tracking-widest text-emerald-700">New Patient</div>
            <span class="text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">MRN auto-assigned on save</span>
          </div>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-6">
            <div class="sm:col-span-2">
              <label class="label">First name *</label>
              <input v-model="newPatientForm.first_name" required maxlength="255" class="input" />
            </div>
            <div class="sm:col-span-2">
              <label class="label">Middle name</label>
              <input v-model="newPatientForm.middle_name" maxlength="255" class="input" />
            </div>
            <div class="sm:col-span-2">
              <label class="label">Last name *</label>
              <input v-model="newPatientForm.last_name" required maxlength="255" class="input" />
            </div>
            <div>
              <label class="label">Suffix</label>
              <input v-model="newPatientForm.suffix" maxlength="20" placeholder="Jr, Sr, III" class="input" />
            </div>
            <div>
              <label class="label">Sex *</label>
              <select v-model="newPatientForm.sex" required class="input">
                <option v-for="s in PATIENT_SEXES" :key="s" :value="s">{{ s }}</option>
              </select>
            </div>
            <div>
              <label class="label">Birthdate</label>
              <input type="date" v-model="newPatientForm.birthdate" class="input" />
            </div>
            <div class="sm:col-span-3">
              <label class="label">Contact number</label>
              <input v-model="newPatientForm.contact_number" maxlength="50" placeholder="+63 917 000 0000" class="input" />
            </div>
            <div class="sm:col-span-3">
              <label class="label">Email</label>
              <input type="email" v-model="newPatientForm.email" maxlength="255" class="input" />
            </div>
            <div class="sm:col-span-3">
              <label class="label">Address</label>
              <input v-model="newPatientForm.address_street1" maxlength="500" class="input" />
            </div>
            <div>
              <label class="label">City</label>
              <input v-model="newPatientForm.city" maxlength="255" class="input" />
            </div>
            <div class="sm:col-span-2">
              <label class="label">Province</label>
              <input v-model="newPatientForm.province" maxlength="255" class="input" />
            </div>
          </div>
          <p class="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
            Full patient profile (IDs, emergency contact, medical history) can be filled in later from Patients.
          </p>
        </div>

        <!-- Case details -->
        <div class="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60 p-3">
          <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-2">Case Details</div>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label class="label">Case type *</label>
              <select v-model="form.case_type" required class="input">
                <option v-for="t in CASE_TYPES" :key="t" :value="t">{{ t }}</option>
              </select>
              <p class="mt-1 text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Default OPD.</p>
            </div>
            <!-- Admission date only editable on Edit; on Create it's auto-set
                 by the server to registration time. -->
            <template v-if="editing">
              <div>
                <label class="label">Admission date</label>
                <input type="datetime-local" v-model="form.admission_date" class="input" />
              </div>
              <div>
                <label class="label">Discharge date</label>
                <input type="datetime-local" v-model="form.discharge_date" class="input" />
              </div>
            </template>
            <template v-else>
              <div class="sm:col-span-2 flex items-end">
                <div class="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
                  <b class="text-slate-700 dark:text-slate-200">Admission date</b> is auto-set on save (registration time).
                  Discharge is recorded later when the case is closed.
                </div>
              </div>
            </template>
            <div class="sm:col-span-3">
              <label class="label">Chief complaint / reason for visit</label>
              <textarea v-model="form.chief_complaint" rows="2" maxlength="2000" class="input"></textarea>
            </div>
            <div>
              <label class="label">Attending physician</label>
              <input v-model="form.attending_physician" maxlength="255" class="input" />
            </div>
            <div>
              <label class="label">Referring physician</label>
              <input v-model="form.referring_physician" maxlength="255" class="input" />
            </div>
            <div class="sm:col-span-3">
              <label class="label">Notes</label>
              <textarea v-model="form.notes" rows="2" maxlength="2000" class="input"></textarea>
            </div>
          </div>
        </div>

        <div v-if="formError" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ formError }}
        </div>
      </form>
      <template #footer>
        <button class="btn-secondary" :disabled="submitting" @click="showForm = false">Cancel</button>
        <button class="btn-primary" :disabled="submitting" form="caseForm" type="submit">
          {{ submitting
              ? 'Saving…'
              : (editing
                  ? 'Save'
                  : (caseFormMode === 'new' ? 'Register & Create Case' : 'Create case')) }}
        </button>
      </template>
    </Modal>

    <!-- ═══ After-create prompt: add requisition now? ═══ -->
    <Modal :show="promptRequisitionAfterCreate.show"
           title="Case created — add a requisition now?"
           size="sm"
           @close="skipRequisition">
      <div class="space-y-2 text-sm text-slate-700 dark:text-slate-200">
        <p>
          <b>{{ promptRequisitionAfterCreate.caseRow?.case_number }}</b> was created for
          {{ [promptRequisitionAfterCreate.caseRow?.patient_first_name,
              promptRequisitionAfterCreate.caseRow?.patient_middle_name,
              promptRequisitionAfterCreate.caseRow?.patient_last_name].filter(Boolean).join(' ') }}.
        </p>
        <p class="text-slate-600 dark:text-slate-300">
          You can order test items and packages now, or come back later from the case's View.
        </p>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="skipRequisition">Not now</button>
        <button class="btn-primary" @click="proceedToRequisitionFromPrompt">Add requisition</button>
      </template>
    </Modal>

    <!-- ═══ Case View: read-only header + requisitions list + inline requisition modal ═══ -->
    <Modal :show="showView" :title="viewing?.case_number || 'Patient case'" size="xl" @close="closeCaseView">
      <div v-if="viewing" class="space-y-4">
        <!-- Case header -->
        <div class="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <span class="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-mono text-xs font-bold text-slate-700 dark:text-slate-200">{{ viewing.case_number }}</span>
              <span class="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                    :class="caseTypeBadge(viewing.case_type)">{{ viewing.case_type }}</span>
              <span class="badge"
                    :class="viewing.status === 'open' ? 'badge-success' : (viewing.status === 'cancelled' ? 'badge-danger' : 'badge-muted')">
                <span class="mr-1 inline-block h-1.5 w-1.5 rounded-full"
                      :class="viewing.status === 'open' ? 'bg-emerald-500' : (viewing.status === 'cancelled' ? 'bg-rose-500' : 'bg-slate-400')"></span>
                {{ viewing.status }}
              </span>
            </div>
            <div class="mt-1">
              <span class="font-mono text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 mr-2">{{ viewing.patient_number }}</span>
              <span class="font-semibold text-slate-800 dark:text-slate-100">{{ fullPatientName(viewing) }}</span>
            </div>
            <div v-if="viewing.chief_complaint" class="mt-1 text-xs text-slate-600 dark:text-slate-300 italic">
              "{{ viewing.chief_complaint }}"
            </div>
          </div>
          <div class="text-right text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
            <div>Admitted <b class="text-slate-700 dark:text-slate-200">{{ formatDateTime(viewing.admission_date) }}</b></div>
            <div v-if="viewing.discharge_date">Discharged {{ formatDateTime(viewing.discharge_date) }}</div>
            <div v-if="viewing.attending_physician">Attending: {{ viewing.attending_physician }}</div>
            <div v-if="viewing.referring_physician">Referred by: {{ viewing.referring_physician }}</div>
          </div>
        </div>

        <!-- Requisitions -->
        <div class="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/70 p-3">
          <div class="mb-2 flex items-center justify-between">
            <div class="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
              Requisitions ({{ requisitions.length }})
              <span v-if="requisitionsLoading" class="ml-1 text-brand-600">· loading…</span>
            </div>
            <button type="button" class="btn-primary !py-1 !text-[11px]" @click="openNewRequisition">
              + Add requisition
            </button>
          </div>

          <div v-if="!requisitionsLoading && !requisitions.length"
               class="rounded-md border border-dashed border-slate-300 bg-white dark:bg-slate-900 p-3 text-center text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
            No requisitions yet. Add one to order test items / packages against this case.
          </div>

          <div v-else-if="requisitions.length" class="overflow-hidden rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <table class="w-full text-xs">
              <thead class="bg-slate-100 dark:bg-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
                <tr>
                  <th class="px-2 py-1.5 text-left">Req #</th>
                  <th class="px-2 py-1.5 text-left">Date</th>
                  <th class="px-2 py-1.5 text-right">Items</th>
                  <th class="px-2 py-1.5 text-right">Subtotal</th>
                  <th class="px-2 py-1.5 text-right">Discount</th>
                  <th class="px-2 py-1.5 text-right">Total</th>
                  <th class="px-2 py-1.5 text-left">Status</th>
                  <th class="px-2 py-1.5 text-right"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in requisitions" :key="r.uuid" class="border-t border-slate-100 dark:border-slate-800">
                  <td class="px-2 py-1 font-mono font-semibold text-slate-700 dark:text-slate-200">{{ r.requisition_number }}</td>
                  <td class="px-2 py-1 text-slate-600 dark:text-slate-300">{{ formatDateTime(r.requisition_date) }}</td>
                  <td class="px-2 py-1 text-right">{{ r.item_count || 0 }}</td>
                  <td class="px-2 py-1 text-right">{{ money(r.subtotal) }}</td>
                  <td class="px-2 py-1 text-right">
                    <span v-if="Number(r.discount_amount) > 0" class="text-emerald-700 font-semibold">
                      − {{ money(r.discount_amount) }}
                      <span v-if="r.discount_code" class="ml-1 text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">({{ r.discount_code }})</span>
                    </span>
                    <span v-else class="text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">—</span>
                  </td>
                  <td class="px-2 py-1 text-right font-bold text-brand-700">{{ money(r.total) }}</td>
                  <td class="px-2 py-1">
                    <span class="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                          :class="reqStatusBadge(r.status)">{{ r.status }}</span>
                  </td>
                  <td class="px-2 py-1 text-right whitespace-nowrap">
                    <!-- Lock policy for the Edit + Delete actions:
                         - draft            → both actions open (operator is still authoring)
                         - finalized        → Edit disabled, hint "Reopen to edit"
                                              Delete open (finalized-but-unbilled cancels are common)
                         - partially_paid   → both disabled, hint "Void payment first"
                         - paid             → both disabled, hint "Void payment first"
                         - cancelled        → row unreachable via this action set -->
                    <button type="button"
                            class="text-[11px] mr-2"
                            :class="(r.status === 'finalized' || r.status === 'paid' || r.status === 'partially_paid')
                                    ? 'text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 cursor-not-allowed'
                                    : 'text-brand-600 hover:underline'"
                            :disabled="r.status === 'finalized' || r.status === 'paid' || r.status === 'partially_paid'"
                            :title="r.status === 'paid' || r.status === 'partially_paid'
                                      ? 'Void payment first'
                                      : (r.status === 'finalized' ? 'Reopen to edit' : '')"
                            @click="(r.status === 'draft') && openEditRequisition(r)">Edit</button>
                    <button v-if="r.status === 'draft'" type="button" class="text-[11px] text-emerald-600 hover:underline mr-2"
                            @click="reqSetStatus(r, 'finalized')">Finalize</button>
                    <button v-if="r.status === 'finalized'" type="button" class="text-[11px] text-amber-600 hover:underline mr-2"
                            @click="reqSetStatus(r, 'draft')">Reopen</button>
                    <!-- Delete stays offered for draft + finalized (unbilled),
                         locked for paid / partially_paid. Cancelled rows drop
                         out (v-if). -->
                    <button v-if="r.status !== 'cancelled'"
                            type="button"
                            class="text-[11px]"
                            :class="(r.status === 'paid' || r.status === 'partially_paid')
                                    ? 'text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 cursor-not-allowed'
                                    : 'text-rose-600 hover:underline'"
                            :disabled="r.status === 'paid' || r.status === 'partially_paid'"
                            :title="r.status === 'paid' || r.status === 'partially_paid'
                                      ? 'Void payment first'
                                      : ''"
                            @click="(r.status !== 'paid' && r.status !== 'partially_paid') && askReqDelete(r)">Delete</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="border-t border-slate-100 dark:border-slate-800 pt-2 text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
          Created {{ formatDateTime(viewing.created_at) }}
          <span v-if="viewing.created_by">by {{ viewing.created_by }}</span>
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="closeCaseView">Close</button>
        <button class="btn-primary" @click="() => { const r = viewing; closeCaseView(); if (r) openEdit(r) }">Edit case</button>
      </template>
    </Modal>

    <!-- ═══ Requisition Add/Edit (inline within the case) ═══
         New layout:
           1. Case + patient context banner (who is this for?)
           2. Metadata row — notes (+ requisition date on Edit)
           3. Catalog picker (top table) with [Tests] [Packages] tabs
           4. Requested items (bottom table)
           5. Discount + totals
    -->
    <Modal :show="showReqForm"
           :title="editingReq ? 'Edit Requisition' : 'Add Requisition'"
           size="xl"
           @close="showReqForm = false">
      <form id="reqForm" @submit.prevent="askSubmitRequisition" class="space-y-4">
        <!-- Context banner: case + patient identity so the operator can
             confirm at a glance what they're ordering for. -->
        <div v-if="viewing"
             class="rounded-lg border border-brand-100 bg-brand-50/50 p-3">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div class="flex items-center gap-2">
                <span class="rounded bg-white dark:bg-slate-900 border border-brand-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-700 dark:text-slate-200">
                  {{ viewing.case_number }}
                </span>
                <span class="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                      :class="caseTypeBadge(viewing.case_type)">{{ viewing.case_type }}</span>
                <span class="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                  {{ viewing.patient_number }}
                </span>
              </div>
              <div class="mt-1 text-base font-bold text-slate-800 dark:text-slate-100">
                {{ fullPatientName(viewing) }}
                <span class="ml-1 rounded bg-brand-100 px-1 text-[10px] font-bold uppercase text-brand-700">{{ viewing.patient_sex || '?' }}</span>
                <span v-if="ageFromBirthdate(viewing.patient_birthdate) !== null"
                      class="ml-1 text-xs text-slate-600 dark:text-slate-300">
                  · {{ ageFromBirthdate(viewing.patient_birthdate) }} y/o
                </span>
              </div>
              <div v-if="viewing.chief_complaint" class="mt-0.5 text-xs italic text-slate-600 dark:text-slate-300">
                "{{ viewing.chief_complaint }}"
              </div>
              <div v-if="viewing.attending_physician" class="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
                Attending: {{ viewing.attending_physician }}
              </div>
            </div>
            <div class="text-right text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
              Admitted <b class="text-slate-700 dark:text-slate-200">{{ formatDateTime(viewing.admission_date) }}</b>
            </div>
          </div>
        </div>

        <!-- Metadata row — requisition date only editable on Edit -->
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div v-if="editingReq">
            <label class="label">Requisition date</label>
            <input type="datetime-local" v-model="reqForm.requisition_date" class="input" />
          </div>
          <div>
            <label class="label">Physician</label>
            <input v-model="reqForm.physician" maxlength="255" placeholder="Referring physician — prints on the report" class="input" />
          </div>
          <div :class="editingReq ? '' : 'sm:col-span-2'">
            <label class="label">Notes</label>
            <input v-model="reqForm.notes" maxlength="2000" placeholder="Optional — instructions or reason" class="input" />
            <p v-if="!editingReq" class="mt-1 text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
              Requisition date auto-sets to registration time.
            </p>
          </div>
        </div>

        <!-- ═══ TOP: catalog picker ═══ -->
        <div class="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/70 p-3">
          <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-1">
              <button type="button"
                      class="rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider"
                      :class="catalogTab === 'tests'
                                ? 'bg-brand-600 text-white'
                                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700'"
                      @click="catalogTab = 'tests'">
                Tests
              </button>
              <button type="button"
                      class="rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider"
                      :class="catalogTab === 'packages'
                                ? 'bg-brand-600 text-white'
                                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700'"
                      @click="catalogTab = 'packages'">
                Packages
              </button>
            </div>
            <div class="flex items-center gap-2">
              <!-- Category filter — only makes sense on the Tests tab -->
              <select v-if="catalogTab === 'tests'"
                      v-model="catalogCategoryFilter"
                      class="input !py-1 !text-xs w-48">
                <option value="">All categories</option>
                <option v-for="c in activeCategoriesForTests" :key="c.uuid" :value="c.uuid">
                  {{ c.code }} · {{ c.name }}
                </option>
              </select>
              <input v-model="catalogSearch"
                     :placeholder="catalogTab === 'packages' ? 'Search packages…' : 'Search tests…'"
                     class="input !py-1 !text-xs w-56" />
            </div>
          </div>

          <!-- Tests catalog table -->
          <div v-if="catalogTab === 'tests'"
               class="h-64 overflow-auto rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <table class="w-full text-xs">
              <thead class="sticky top-0 bg-slate-100 dark:bg-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
                <tr>
                  <th class="w-20 px-2 py-1.5 text-left">Code</th>
                  <th class="px-2 py-1.5 text-left">Name</th>
                  <th class="w-40 px-2 py-1.5 text-left">Category</th>
                  <th class="w-24 px-2 py-1.5 text-right">Price</th>
                  <th class="w-20 px-2 py-1.5 text-right"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="t in catalogTestResults" :key="t.uuid"
                    class="border-t border-slate-100 dark:border-slate-800"
                    :class="chosenTestUuids.has(t.uuid) && 'bg-slate-50 dark:bg-slate-800'">
                  <td class="px-2 py-1 font-mono font-semibold text-slate-700 dark:text-slate-200">{{ t.code }}</td>
                  <td class="px-2 py-1 text-slate-800 dark:text-slate-100">{{ t.name }}</td>
                  <td class="px-2 py-1 text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 text-[11px]">{{ t.item_category_name || '—' }}</td>
                  <td class="px-2 py-1 text-right font-semibold">{{ money(t.price) }}</td>
                  <td class="px-2 py-1 text-right">
                    <button type="button"
                            class="rounded px-2 py-0.5 text-[11px] font-semibold"
                            :class="chosenTestUuids.has(t.uuid)
                                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 cursor-default'
                                    : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'"
                            :disabled="chosenTestUuids.has(t.uuid)"
                            @click="addTestToBasket(t)">
                      {{ chosenTestUuids.has(t.uuid) ? '✓ Added' : '+ Add' }}
                    </button>
                  </td>
                </tr>
                <tr v-if="!catalogTestResults.length">
                  <td colspan="5" class="px-2 py-3 text-center text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
                    {{ catalogSearch ? 'No tests match your search.' : 'No active tests.' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Packages catalog table (rows expandable to preview items) -->
          <div v-else class="h-64 overflow-auto rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <table class="w-full text-xs">
              <thead class="sticky top-0 bg-slate-100 dark:bg-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
                <tr>
                  <th class="w-6 px-2 py-1.5"></th>
                  <th class="w-20 px-2 py-1.5 text-left">Code</th>
                  <th class="px-2 py-1.5 text-left">Name</th>
                  <th class="w-16 px-2 py-1.5 text-right">Items</th>
                  <th class="w-24 px-2 py-1.5 text-right">Price</th>
                  <th class="w-20 px-2 py-1.5 text-right"></th>
                </tr>
              </thead>
              <tbody>
                <template v-for="p in catalogPackageResults" :key="p.uuid">
                  <tr class="border-t border-slate-100 dark:border-slate-800"
                      :class="chosenPackageUuids.has(p.uuid) && 'bg-slate-50 dark:bg-slate-800'">
                    <td class="px-2 py-1 text-center">
                      <button type="button"
                              class="rounded p-0.5 text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200"
                              @click="togglePackageExpand(p)"
                              :title="expandedPackageUuid === p.uuid ? 'Hide items' : 'Show items'">
                        <svg viewBox="0 0 24 24" class="h-3 w-3 transition-transform"
                             :class="expandedPackageUuid === p.uuid && 'rotate-90'"
                             fill="none" stroke="currentColor" stroke-width="2.5"
                             stroke-linecap="round" stroke-linejoin="round">
                          <polyline points="9 6 15 12 9 18"/>
                        </svg>
                      </button>
                    </td>
                    <td class="px-2 py-1 font-mono font-semibold text-slate-700 dark:text-slate-200">{{ p.code }}</td>
                    <td class="px-2 py-1 text-slate-800 dark:text-slate-100">{{ p.name }}</td>
                    <td class="px-2 py-1 text-right text-slate-600 dark:text-slate-300">{{ p.item_count || 0 }}</td>
                    <td class="px-2 py-1 text-right font-semibold">{{ money(p.package_price) }}</td>
                    <td class="px-2 py-1 text-right">
                      <button type="button"
                              class="rounded px-2 py-0.5 text-[11px] font-semibold"
                              :class="chosenPackageUuids.has(p.uuid)
                                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 cursor-default'
                                      : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'"
                              :disabled="chosenPackageUuids.has(p.uuid)"
                              @click="addPackageToBasket(p)">
                        {{ chosenPackageUuids.has(p.uuid) ? '✓ Added' : '+ Add' }}
                      </button>
                    </td>
                  </tr>
                  <!-- Expanded package contents -->
                  <tr v-if="expandedPackageUuid === p.uuid" class="border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/60">
                    <td></td>
                    <td colspan="5" class="px-2 py-1.5">
                      <div v-if="packageItemsLoading[p.uuid]" class="text-[11px] text-brand-600">Loading items…</div>
                      <div v-else-if="!packageItemsCache[p.uuid]?.length"
                           class="text-[11px] italic text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">No items configured.</div>
                      <div v-else class="space-y-0.5">
                        <div v-for="it in packageItemsCache[p.uuid]" :key="it.uuid"
                             class="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300">
                          <span>
                            <span class="font-mono font-semibold text-slate-700 dark:text-slate-200">{{ it.test_item_code || '—' }}</span>
                            <span class="ml-1">{{ it.test_item_name || '' }}</span>
                          </span>
                          <span class="text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
                            <span class="line-through">{{ money(it.current_price) }}</span>
                            <span class="ml-1 font-semibold text-slate-700 dark:text-slate-200">{{ money(it.new_price) }}</span>
                          </span>
                        </div>
                      </div>
                    </td>
                  </tr>
                </template>
                <tr v-if="!catalogPackageResults.length">
                  <td colspan="6" class="px-2 py-3 text-center text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
                    {{ catalogSearch ? 'No packages match your search.' : 'No active packages.' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p class="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
            Click <b>+ Add</b> to move items to the requested list below. Adding a package expands into its individual tests (each priced at the package's discounted rate) so lab results can be recorded per test.
          </p>
        </div>

        <!-- ═══ BOTTOM: requested items ═══ -->
        <div class="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/70 p-3">
          <div class="mb-2 flex items-center justify-between">
            <div class="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
              Requested Items ({{ reqLines.length }})
            </div>
            <div class="flex items-center gap-2">
              <span v-if="reqLinesLoading" class="text-[11px] text-brand-600">Loading…</span>
              <button v-if="reqLines.length"
                      type="button"
                      class="rounded px-2 py-0.5 text-[11px] font-semibold text-rose-600 hover:bg-rose-50"
                      @click="clearReqLines">
                Clear items
              </button>
            </div>
          </div>

          <!-- Fixed-height wrapper — keeps the modal from bouncing when the
               operator adds or removes lines. Scrolls internally past the fit. -->
          <div class="h-56 overflow-auto rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <div v-if="!reqLinesLoading && !reqLines.length"
                 class="flex h-full items-center justify-center border-dashed p-3 text-center text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
              No items yet. Pick tests or packages from the catalog above.
            </div>

            <table v-else-if="reqLines.length" class="w-full text-xs">
              <thead class="bg-slate-100 dark:bg-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
                <tr>
                  <th class="w-8 px-2 py-1.5 text-left">#</th>
                  <th class="w-20 px-2 py-1.5 text-left">Type</th>
                  <th class="px-2 py-1.5 text-left">Item</th>
                  <th class="w-20 px-2 py-1.5 text-right">Qty</th>
                  <th class="w-28 px-2 py-1.5 text-right">Unit Price</th>
                  <th class="w-28 px-2 py-1.5 text-right">Line Total</th>
                  <th class="w-10 px-2 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                <template v-for="(r, i) in reqLines" :key="r.uuid || `new-${r.source_type}-${r.source_uuid}-${i}`">
                  <!-- Package group header: renders once per package on the
                       first exploded row so grouped items read as a bundle. -->
                  <tr v-if="r.package_uuid && (i === 0 || reqLines[i - 1].package_uuid !== r.package_uuid)"
                      class="border-t border-slate-200 dark:border-slate-700 bg-amber-50/60">
                    <td colspan="7" class="px-2 py-1">
                      <span class="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">Package</span>
                      <span class="ml-2 font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">{{ r.package_code || '—' }}</span>
                      <span class="ml-1 text-xs text-slate-700 dark:text-slate-200">{{ r.package_name || '' }}</span>
                    </td>
                  </tr>
                  <tr class="border-t border-slate-100 dark:border-slate-800 align-middle"
                      :class="r.package_uuid && 'bg-amber-50/20'">
                  <td class="px-2 py-1 text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">{{ i + 1 }}</td>
                  <td class="px-2 py-1">
                    <span class="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-sky-100 text-sky-700">
                      Test
                    </span>
                  </td>
                  <td class="px-2 py-1" :class="r.package_uuid && 'pl-6'">
                    <span class="font-mono font-semibold text-slate-700 dark:text-slate-200">{{ basketRowLabel(r).code }}</span>
                    <span class="ml-1 text-slate-800 dark:text-slate-100">{{ basketRowLabel(r).name }}</span>
                  </td>
                  <td class="px-1 py-1">
                    <input type="number" min="1" step="1" v-model.number="r.quantity"
                           class="input !py-1 !text-xs text-right" />
                  </td>
                  <!-- Unit price is a snapshot from the catalog and locked in
                       the requisition modal — special pricing goes through
                       the catalog (item_package new_price / test_item price)
                       so bills stay auditable. -->
                  <td class="px-2 py-1 text-right font-mono text-slate-700 dark:text-slate-200">
                    {{ money(r.unit_price) }}
                  </td>
                  <td class="px-2 py-1 text-right font-semibold">
                    {{ money((Number(r.unit_price) || 0) * (Number(r.quantity) || 0)) }}
                  </td>
                  <td class="px-1 py-1 text-right">
                    <button type="button"
                            class="rounded p-1 text-rose-500 hover:bg-rose-50 hover:text-rose-700"
                            @click="removeReqLine(i)" title="Remove">
                      <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2"
                           stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                        <path d="M10 11v6M14 11v6"/>
                      </svg>
                    </button>
                  </td>
                </tr>
                </template>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Discount + totals -->
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div class="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/70 p-3">
            <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-2">Discount</div>
            <div class="grid grid-cols-1 gap-2">
              <select v-model="reqDiscount.discount_uuid"
                      :disabled="hasPackageLines"
                      class="input !py-1 !text-xs disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:cursor-not-allowed">
                <option value="">No discount</option>
                <option v-for="d in activeDiscounts" :key="d.uuid" :value="d.uuid">
                  {{ d.code }} · {{ d.name }}
                  <template v-if="d.discount_type === 'percent'"> ({{ Number(d.value) }}%)</template>
                  <template v-else-if="d.discount_type === 'fix'"> ({{ money(d.value) }})</template>
                  <template v-else-if="d.discount_type === 'open_amount'"> (open)</template>
                </option>
              </select>
              <div v-if="selectedDiscount && selectedDiscount.discount_type === 'open_amount' && !hasPackageLines">
                <label class="label">Discount amount</label>
                <input type="number" min="0" step="0.01"
                       v-model.number="reqDiscount.discount_open_amount"
                       class="input !py-1 !text-xs text-right" />
                <p class="mt-1 text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Capped at subtotal on save.</p>
              </div>
              <!-- Explain the disable so the operator isn't left guessing. -->
              <div v-if="hasPackageLines"
                   class="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
                <b>Discount disabled.</b> This requisition already includes a package — the package price
                reflects its bundled discount, so a requisition-level discount would double-dip.
              </div>
            </div>
          </div>

          <div class="rounded-lg border border-brand-100 bg-brand-50/40 p-3">
            <div class="space-y-1 text-sm">
              <div class="flex items-center justify-between">
                <span class="text-slate-600 dark:text-slate-300">Subtotal</span>
                <span class="font-semibold">{{ money(reqSubtotal) }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-slate-600 dark:text-slate-300">Discount</span>
                <span class="font-semibold text-emerald-700">− {{ money(reqDiscountAmount) }}</span>
              </div>
              <div class="flex items-center justify-between border-t border-brand-100 pt-1">
                <span class="font-bold text-brand-700 uppercase text-xs tracking-widest">Total</span>
                <span class="text-xl font-bold text-brand-700">{{ money(reqTotal) }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="reqError" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ reqError }}
        </div>
      </form>
      <template #footer>
        <button class="btn-secondary" :disabled="reqSubmitting" @click="showReqForm = false">Cancel</button>
        <button class="btn-primary" :disabled="reqSubmitting" form="reqForm" type="submit">
          {{ reqSubmitting ? 'Saving…' : (editingReq ? 'Save' : 'Create requisition') }}
        </button>
      </template>
    </Modal>

    <!-- Create-requisition confirmation. Two commit paths so the operator
         can either park a draft (still editable) or finalize immediately
         (locks the order for downstream systems). -->
    <Modal :show="showReqConfirm" title="Create requisition?" size="sm" @close="showReqConfirm = false">
      <div class="space-y-2 text-sm text-slate-700 dark:text-slate-200">
        <p>
          You're about to create a requisition against
          <b>{{ viewing?.case_number }}</b> for
          <b>{{ fullPatientName(viewing) }}</b>.
        </p>
        <div class="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2 text-xs">
          <div class="flex items-center justify-between">
            <span class="text-slate-600 dark:text-slate-300">Items</span>
            <span class="font-semibold">{{ reqLines.length }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-slate-600 dark:text-slate-300">Subtotal</span>
            <span class="font-semibold">{{ money(reqSubtotal) }}</span>
          </div>
          <div v-if="reqDiscountAmount > 0" class="flex items-center justify-between">
            <span class="text-slate-600 dark:text-slate-300">Discount</span>
            <span class="font-semibold text-emerald-700">− {{ money(reqDiscountAmount) }}</span>
          </div>
          <div class="mt-1 flex items-center justify-between border-t border-slate-200 dark:border-slate-700 pt-1">
            <span class="font-bold text-brand-700 uppercase tracking-widest text-[11px]">Total</span>
            <span class="text-base font-bold text-brand-700">{{ money(reqTotal) }}</span>
          </div>
        </div>
        <p class="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
          <b>Save as Draft</b> keeps this editable. <b>Create &amp; Finalize</b> locks the order — use this when the tests are ready to be ordered / billed.
        </p>
      </div>
      <template #footer>
        <button class="btn-secondary" :disabled="reqSubmitting" @click="showReqConfirm = false">Cancel</button>
        <button class="btn-secondary" :disabled="reqSubmitting" @click="submitRequisition({ finalize: false })">
          Save as Draft
        </button>
        <button class="btn-primary" :disabled="reqSubmitting" @click="submitRequisition({ finalize: true })">
          Create &amp; Finalize
        </button>
      </template>
    </Modal>

    <!-- Delete requisition — modal, not the browser prompt. -->
    <ConfirmDialog
      :show="confirmReqDelete.show"
      title="Delete requisition"
      :message="confirmReqDelete.req
        ? `This will permanently delete ${confirmReqDelete.req.requisition_number} and all its items. This cannot be undone.`
        : ''"
      confirm-text="Delete"
      @close="confirmReqDelete = { show: false, req: null }"
      @confirm="doReqDelete"
    />

    <ConfirmDialog
      :show="confirmStatus.show"
      :title="confirmStatus.next === 'open' ? 'Reopen case' : 'Close case'"
      :message="confirmStatus.next === 'open'
        ? `Reopen ${confirmStatus.caseRow?.case_number}?`
        : `Close ${confirmStatus.caseRow?.case_number}? Existing requisitions stay accessible.`"
      :confirm-text="confirmStatus.next === 'open' ? 'Reopen' : 'Close'"
      :danger="confirmStatus.next !== 'open'"
      @close="confirmStatus = { show: false, caseRow: null, next: '' }"
      @confirm="doToggleStatus"
    />

    <ConfirmDialog
      :show="confirmDelete.show"
      title="Delete patient case"
      :message="confirmDelete.caseRow
        ? `This will permanently delete ${confirmDelete.caseRow.case_number} and all its requisitions.`
        : ''"
      confirm-text="Delete"
      @close="confirmDelete = { show: false, caseRow: null }"
      @confirm="doDelete"
    />
  </div>
</template>
