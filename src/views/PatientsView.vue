<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { usePatientsStore } from '../stores/patients'
import { useAuthStore } from '../stores/auth'
import { useTenantStore } from '../stores/tenant'
import QRCode from 'qrcode'
import Modal from '../components/Modal.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import EmptyState from '../components/EmptyState.vue'
import SkeletonRows from '../components/SkeletonRows.vue'
import RowActionMenu from '../components/RowActionMenu.vue'
import MobileFilterBar from '../components/MobileFilterBar.vue'
import PaginationBar from '../components/PaginationBar.vue'
import LabReportPrintable from '../components/LabReportPrintable.vue'
import { formatDateTime } from '../utils/format'
import {
  PATIENT_SEXES, CIVIL_STATUSES, BLOOD_TYPES,
  searchPatients, viewPatient,
} from '../api/patients'
import { listPatientCases } from '../api/patientCases'
import { listLabReports, viewLabReport } from '../api/laboratory'

const patients = usePatientsStore()
const auth     = useAuthStore()
const tenant   = useTenantStore()

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

// ─── Lab-report preview ─────────────────────────────────────────────────
// Renders the same LabReportPrintable component + isolated-popup print flow
// as LaboratoryView.openPrint / doPrint, so the preview and printout in the
// patient chart match what operators see under Laboratory. Kept in-file
// (rather than a shared composable) because it's the same tight coupling
// to the paper-size maps + popup HTML template already living in
// LaboratoryView and TestItemsView.
const labPreview        = ref(null)
const labPreviewLoading = ref(false)
const labPreviewError   = ref('')
const qrDataUrl         = ref('')

// Paper size the printer will actually be told to use. Starts from the
// category setting, then auto-upgrades when content wouldn't fit. Same maps
// as LaboratoryView so the print result matches.
const effectivePaperKey   = ref('letter')
const recommendedPaperKey = ref('letter')

const PAPER_LABELS = {
  full:                  'Full page (A4)',
  half:                  'Half page (A5)',
  letter:                'Letter — 8.5″ × 11″',
  legal:                 'Legal — 8.5″ × 14″',
  half_letter:           'Half Letter — 5.5″ × 8.5″',
  half_letter_crosswise: 'Half Letter — 8.5″ × 5.5″ crosswise',
  half_legal_crosswise:  'Half Legal — 8.5″ × 7″ crosswise',
}
const PAPER_UPGRADE = {
  half:                  'full',
  half_letter:           'letter',
  half_letter_crosswise: 'letter',
  half_legal_crosswise:  'legal',
  letter:                'legal',
}
const PAPER_PX = {
  full:                  { w: 794,  h: 1123 },
  half:                  { w: 559,  h: 794  },
  letter:                { w: 816,  h: 1056 },
  legal:                 { w: 816,  h: 1344 },
  half_letter:           { w: 528,  h: 816  },
  half_letter_crosswise: { w: 816,  h: 528  },
  half_legal_crosswise:  { w: 816,  h: 672  },
}

function publicLabUrl(token) {
  if (!token) return ''
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/lab/view?t=${encodeURIComponent(token)}`
}

async function openLabPreview(r) {
  labPreview.value = null
  labPreviewError.value = ''
  qrDataUrl.value = ''
  labPreviewLoading.value = true
  try {
    const full = await viewLabReport(r.uuid)
    labPreview.value = full || null
    const url = publicLabUrl(labPreview.value?.public_token)
    if (url) {
      qrDataUrl.value = await QRCode.toDataURL(url, {
        margin: 0,
        width: 128,
        errorCorrectionLevel: 'M',
      })
    }
  } catch (e) {
    labPreviewError.value = e?.message || 'Failed to load lab report'
  } finally {
    labPreviewLoading.value = false
  }
  // Preview DOM only mounts once labPreviewLoading flips to false; measure
  // and predict paper size after images settle so the scale wrapper
  // captures a real content height (mirrors LaboratoryView.openPrint).
  await nextTick()
  await new Promise((r) => requestAnimationFrame(r))
  await waitForImages(document.getElementById('lab-print-area'))
  computeEffectivePaper()
  remeasurePreview()
}
function closeLabPreview() {
  labPreview.value = null
  labPreviewError.value = ''
  qrDataUrl.value = ''
}

// ─── Scaled on-screen preview ─────────────────────────────────────────
const previewFrameWidth    = ref(0)
const previewContentHeight = ref(0)
let previewWidthObs  = null
let previewHeightObs = null
let previewFrameEl   = null
let previewContentEl = null
function setPreviewFrame(el) {
  if (previewWidthObs) { previewWidthObs.disconnect(); previewWidthObs = null }
  previewFrameEl = el || null
  if (!el) { previewFrameWidth.value = 0; return }
  previewFrameWidth.value = el.clientWidth
  if (typeof ResizeObserver !== 'undefined') {
    previewWidthObs = new ResizeObserver((entries) => {
      for (const e of entries) previewFrameWidth.value = e.contentRect.width
    })
    previewWidthObs.observe(el)
  }
}
function setPreviewContent(el) {
  if (previewHeightObs) { previewHeightObs.disconnect(); previewHeightObs = null }
  previewContentEl = el || null
  if (!el) { previewContentHeight.value = 0; return }
  previewContentHeight.value = el.offsetHeight
  if (typeof ResizeObserver !== 'undefined') {
    previewHeightObs = new ResizeObserver((entries) => {
      for (const e of entries) previewContentHeight.value = e.contentRect.height
    })
    previewHeightObs.observe(el)
  }
}
function remeasurePreview() {
  if (previewFrameEl)   previewFrameWidth.value    = previewFrameEl.clientWidth
  if (previewContentEl) previewContentHeight.value = previewContentEl.offsetHeight
}
onBeforeUnmount(() => {
  if (previewWidthObs)  previewWidthObs.disconnect()
  if (previewHeightObs) previewHeightObs.disconnect()
})
const previewPaperPx = computed(() => PAPER_PX[effectivePaperKey.value] || PAPER_PX.letter)
const previewScale = computed(() => {
  const w = previewFrameWidth.value
  if (!w) return 1
  return Math.min(1, w / previewPaperPx.value.w)
})
const previewFrameWidthPx = computed(() => Math.ceil(previewPaperPx.value.w * previewScale.value))
const previewFrameHeightPx = computed(() => {
  const contentH = previewContentHeight.value || previewPaperPx.value.h
  return Math.ceil(contentH * previewScale.value)
})

const effectivePaperLabel   = computed(() => PAPER_LABELS[effectivePaperKey.value]   || PAPER_LABELS.letter)
const recommendedPaperLabel = computed(() => PAPER_LABELS[recommendedPaperKey.value] || PAPER_LABELS.letter)
const configuredPaperKey    = computed(() => labPreview.value?.item_category_print_paper_size || 'letter')
const configuredPaperLabel  = computed(() => PAPER_LABELS[configuredPaperKey.value]  || PAPER_LABELS.letter)
const paperWasUpgraded      = computed(() => recommendedPaperKey.value !== configuredPaperKey.value)

function waitForImages(root) {
  if (!root) return Promise.resolve()
  const imgs = Array.from(root.querySelectorAll('img'))
  if (!imgs.length) return Promise.resolve()
  return Promise.all(
    imgs.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise((res) => {
            img.addEventListener('load', res, { once: true })
            img.addEventListener('error', res, { once: true })
          }),
    ),
  )
}

function buildMatrixGrid(item) {
  const cfg = item?.matrix_config || {}
  const rows = Array.isArray(cfg.rows) ? cfg.rows : []
  const cols = Array.isArray(cfg.cols) ? cfg.cols : []
  const cells = new Map()
  for (const v of (item?.values || [])) {
    cells.set(v.component_code, v)
  }
  return { rows, cols, cells }
}

function computeEffectivePaper() {
  const report = labPreview.value
  const configured = report?.item_category_print_paper_size || 'letter'
  effectivePaperKey.value   = configured
  recommendedPaperKey.value = configured
  if (!report) return

  const OVERHEAD = 130 + 28 + 130 + 22
  const ITEM_HEADER    = 42
  const ROW_HEIGHT     = 17
  const SECTION_ROW    = 22
  const NARRATIVE_LINE = 15
  const NARRATIVE_CPL  = 90

  let estimated = OVERHEAD
  const items = report.items || []
  for (const it of items) {
    estimated += ITEM_HEADER
    if (it.result_type === 'single' || it.result_type === 'panel') {
      const values = it.values || []
      const sections = new Set(values.map((v) => v.section).filter(Boolean))
      estimated += sections.size * SECTION_ROW
      estimated += values.length * ROW_HEIGHT
      if (values.length === 0) estimated += ROW_HEIGHT
    } else if (it.result_type === 'matrix') {
      const grid = buildMatrixGrid(it)
      estimated += ROW_HEIGHT + grid.rows.length * ROW_HEIGHT
    } else {
      const text = String(it.narrative_text || '—')
      const lines = Math.max(1, Math.ceil(text.length / NARRATIVE_CPL))
      estimated += lines * NARRATIVE_LINE
    }
  }
  if (report.remarks) {
    const lines = Math.max(1, Math.ceil(String(report.remarks).length / NARRATIVE_CPL))
    estimated += 12 + lines * NARRATIVE_LINE
  }

  const USABLE_PAD = 45 + 15
  const SAFETY_PX  = 30
  const fits = (key) => {
    const paper = PAPER_PX[key] || PAPER_PX.letter
    return estimated + SAFETY_PX <= paper.h - USABLE_PAD
  }

  let key = configured
  const seen = new Set()
  for (let i = 0; i < 5 && !seen.has(key); i++) {
    seen.add(key)
    if (fits(key)) break
    const next = PAPER_UPGRADE[key]
    if (!next) break
    key = next
  }
  recommendedPaperKey.value = key
  effectivePaperKey.value   = key
}

// Same isolated-popup print pattern used by LaboratoryView and TestItemsView.
// Copies stylesheets so Tailwind classes stay intact, wraps the report in a
// <thead>-repeating table for multi-page prints, and pins signatures to the
// bottom of the last page.
function doPrint() {
  const src = document.getElementById('lab-print-area')
  if (!src) { window.print(); return }

  const _paperMap = {
    'A4':          { w: 794,  h: 1123 },
    'A5':          { w: 559,  h: 794  },
    'letter':      { w: 816,  h: 1056 },
    '8.5in 14in':  { w: 816,  h: 1344 },
    '5.5in 8.5in': { w: 528,  h: 816  },
    '8.5in 5.5in': { w: 816,  h: 528  },
    '8.5in 7in':   { w: 816,  h: 672  },
  }
  const _winPaper = _paperMap[
    ({ full:'A4', half:'A5', letter:'letter', legal:'8.5in 14in', half_letter:'5.5in 8.5in',
       half_letter_crosswise:'8.5in 5.5in', half_legal_crosswise:'8.5in 7in' })[
      effectivePaperKey.value || 'letter'
    ]
  ] || { w: 816, h: 1056 }
  const winW = _winPaper.w + 20
  const winH = Math.min(_winPaper.h + 40, screen.availHeight - 40)

  const win = window.open('', '_blank', `width=${winW},height=${winH}`)
  if (!win) { window.print(); return }

  const styleTags = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((n) => n.outerHTML)
    .join('\n')

  const title = `Lab Report ${labPreview.value?.lab_number || ''}`

  const paperSpec = ({
    full:                   { size: 'A4',           orientation: 'portrait'  },
    half:                   { size: 'A5',           orientation: 'portrait'  },
    letter:                 { size: 'letter',       orientation: 'portrait'  },
    legal:                  { size: '8.5in 14in',   orientation: 'portrait'  },
    half_letter:            { size: '5.5in 8.5in',  orientation: 'portrait'  },
    half_letter_crosswise:  { size: '8.5in 5.5in',  orientation: 'landscape' },
    half_legal_crosswise:   { size: '8.5in 7in',    orientation: 'landscape' },
  })[effectivePaperKey.value || 'letter'] || { size: 'letter', orientation: 'portrait' }

  const clone = src.cloneNode(true)
  const headerEl = clone.querySelector('#lab-print-header')
  const bodyEl   = clone.querySelector('#lab-print-body')
  let printMarkup = clone.outerHTML

  const paperPxMap = {
    'A4':          { w: 794,  h: 1123 },
    'A5':          { w: 559,  h: 794  },
    'letter':      { w: 816,  h: 1056 },
    '8.5in 14in':  { w: 816,  h: 1344 },
    '5.5in 8.5in': { w: 528,  h: 816  },
    '8.5in 5.5in': { w: 816,  h: 528  },
    '8.5in 7in':   { w: 816,  h: 672  },
  }
  const paperPx = paperPxMap[paperSpec.size] || paperPxMap['letter']

  if (headerEl && bodyEl) {
    printMarkup = `
      <div id="lab-print-area" class="relative bg-white dark:bg-slate-900 p-6 text-sm text-slate-900 dark:text-slate-100" style="padding: 0 12mm 12mm; margin: 0 auto; width: ${paperPx.w}px; box-sizing: border-box;">
        ${clone.querySelector('.pointer-events-none.absolute')?.outerHTML || ''}
        <table class="lab-print-table" style="width:100%; border-collapse: collapse;">
          <thead class="lab-print-thead">
            <tr><td class="lab-print-cell">${headerEl.innerHTML}</td></tr>
          </thead>
          <tbody class="lab-print-tbody">
            <tr><td class="lab-print-cell">${bodyEl.innerHTML}</td></tr>
          </tbody>
        </table>
      </div>`
  }

  const closeScript = '<' + '/scr' + 'ipt>'
  const css = `
    html, body { background: #fff; margin: 0; padding: 0; }
    #lab-print-area { padding: 0 12mm 12mm; margin: 0; }
    @page { size: ${paperSpec.size} ${paperSpec.orientation}; margin: 0; }

    #lab-print-area, #lab-print-area * {
      overflow: visible !important;
      word-break: break-word;
      overflow-wrap: anywhere;
    }
    #lab-print-area .line-clamp-1,
    #lab-print-area .line-clamp-2,
    #lab-print-area .line-clamp-3,
    #lab-print-area .truncate {
      -webkit-line-clamp: unset !important;
      display: block !important;
      white-space: normal !important;
      text-overflow: clip !important;
    }
    .lab-print-thead { display: table-header-group; }
    .lab-print-cell  { padding: 0; }
    .lab-print-thead .lab-print-cell { padding-top: 0.2in; }

    html, body { height: 100%; }
    #lab-print-area {
      min-height: 100vh;
      box-sizing: border-box;
    }
    .lab-print-table { height: 100%; }
    .lab-print-tbody, .lab-print-tbody tr, .lab-print-tbody .lab-print-cell {
      height: 100%;
      vertical-align: top;
    }
    #lab-print-body {
      display: flex;
      flex-direction: column;
      min-height: 100%;
    }
    .lab-signature-block { margin-top: auto; }
  `

  win.document.open()
  win.document.write(
    `<!doctype html><html><head><meta charset="utf-8" /><title>${title}</title>${styleTags}<style>${css}</style><script>${closeScript}</head><body>${printMarkup}</body></html>`
  )
  win.document.close()

  async function waitForPopupReady(w) {
    const doc = w.document
    const perResourceTimeout = 3000
    const withTimeout = (p) => Promise.race([
      p, new Promise((res) => setTimeout(res, perResourceTimeout)),
    ])
    const linkWaits = Array.from(doc.querySelectorAll('link[rel="stylesheet"]')).map((l) => {
      if (l.sheet) return Promise.resolve()
      return withTimeout(new Promise((res) => {
        l.addEventListener('load',  res, { once: true })
        l.addEventListener('error', res, { once: true })
      }))
    })
    const imgWaits = Array.from(doc.images).map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve()
      if (typeof img.decode === 'function') return withTimeout(img.decode().catch(() => {}))
      return withTimeout(new Promise((res) => {
        img.addEventListener('load',  res, { once: true })
        img.addEventListener('error', res, { once: true })
      }))
    })
    await Promise.all([...linkWaits, ...imgWaits])
    if (doc.fonts && typeof doc.fonts.ready?.then === 'function') {
      await withTimeout(doc.fonts.ready)
    }
    await new Promise((r) => w.requestAnimationFrame(() => w.requestAnimationFrame(r)))
  }

  const trigger = async () => {
    await waitForPopupReady(win)
    const cleanup = () => { try { win.close() } catch (_) { /* already closed */ } }
    win.addEventListener('afterprint', cleanup, { once: true })
    setTimeout(cleanup, 15000)
    win.focus()
    win.print()
  }
  if (win.document.readyState === 'complete') trigger()
  else win.addEventListener('load', trigger, { once: true })
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
    default:    return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
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
        <div class="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Total Patients</div>
        <div class="mt-1 text-2xl font-bold">{{ totalCount }}</div>
      </div></div>
      <div class="card"><div class="card-body">
        <div class="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Active</div>
        <div class="mt-1 text-2xl font-bold text-emerald-600">{{ activeCount }}</div>
      </div></div>
    </div>

    <div class="card flex flex-1 min-h-0 flex-col overflow-hidden">
      <div class="card-header">
        <div>
          <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">Patients</div>
          <div class="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
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
          <thead class="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800 shadow-[inset_0_-1px_0_theme(colors.slate.100)]">
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
            <tr v-for="p in filtered" :key="p.uuid" :class="p.status !== 'active' && 'bg-slate-50/50 dark:bg-slate-800/50'">
              <td class="font-mono text-xs font-semibold">
                <button type="button"
                        class="text-brand-600 hover:text-brand-800 hover:underline"
                        @click="openView(p)"
                        :title="`View ${p.patient_number}`">{{ p.patient_number }}</button>
              </td>
              <td>
                <div class="font-medium text-slate-800 dark:text-slate-100">{{ fullName(p) }}</div>
                <div v-if="p.status !== 'active'" class="text-[10px] font-semibold uppercase tracking-wider text-rose-600">
                  Hidden
                </div>
              </td>
              <td class="text-sm text-slate-700 dark:text-slate-200">
                <span class="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold uppercase">{{ p.sex }}</span>
                <span v-if="ageFromBirthdate(p.birthdate) !== null" class="ml-1">
                  {{ ageFromBirthdate(p.birthdate) }} y/o
                </span>
              </td>
              <td class="text-sm text-slate-600 dark:text-slate-300">{{ p.contact_number || '—' }}</td>
              <td class="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 font-mono">{{ p.national_id || '—' }}</td>
              <td>
                <span class="badge" :class="p.status === 'active' ? 'badge-success' : 'badge-danger'">
                  <span class="mr-1 inline-block h-1.5 w-1.5 rounded-full"
                        :class="p.status === 'active' ? 'bg-emerald-500' : 'bg-rose-500'"></span>
                  {{ p.status === 'active' ? 'Active' : 'Inactive' }}
                </span>
              </td>
              <td class="hidden md:table-cell text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">{{ formatDateTime(p.created_at) }}</td>
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
        <p class="text-xs text-slate-600 dark:text-slate-300">
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
            <label class="label">Birthdate <span class="text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">(optional)</span></label>
            <input type="date" v-model="searchForm.birthdate" class="input" />
          </div>
        </form>

        <div v-if="searchError" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ searchError }}
        </div>

        <div v-if="searchTouched && !searchLoading && !searchResults.length"
             class="rounded-md border border-dashed border-slate-300 bg-white dark:bg-slate-900 p-3 text-center text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
          No existing patient matched. Click <b>Create new</b> to register.
        </div>

        <div v-if="searchResults.length" class="overflow-hidden rounded-md border border-slate-200 dark:border-slate-700">
          <table class="w-full text-xs">
            <thead class="bg-slate-100 dark:bg-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
              <tr>
                <th class="px-2 py-1.5 text-left">MRN</th>
                <th class="px-2 py-1.5 text-left">Name</th>
                <th class="px-2 py-1.5 text-left">Sex / Age</th>
                <th class="px-2 py-1.5 text-left">Contact</th>
                <th class="px-2 py-1.5 text-right"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in searchResults" :key="p.uuid" class="border-t border-slate-100 dark:border-slate-800 align-middle">
                <td class="px-2 py-1 font-mono font-semibold text-slate-700 dark:text-slate-200">{{ p.patient_number }}</td>
                <td class="px-2 py-1 text-slate-800 dark:text-slate-100">{{ fullName(p) }}</td>
                <td class="px-2 py-1 text-slate-600 dark:text-slate-300">
                  <span class="rounded bg-slate-100 dark:bg-slate-800 px-1 text-[10px] font-bold uppercase">{{ p.sex }}</span>
                  <span v-if="ageFromBirthdate(p.birthdate) !== null" class="ml-1">
                    · {{ ageFromBirthdate(p.birthdate) }} y/o
                  </span>
                </td>
                <td class="px-2 py-1 text-slate-600 dark:text-slate-300">{{ p.contact_number || '—' }}</td>
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
          <div class="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Identity</div>
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
          <div class="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Contact</div>
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
          <div class="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Medical</div>
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
          <div class="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Government IDs</div>
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
          <div class="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Emergency Contact</div>
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
          <div class="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Referral</div>
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
        <div class="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <div class="flex items-center gap-2">
              <span class="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-mono text-xs font-bold text-slate-700 dark:text-slate-200">{{ viewing.patient_number }}</span>
              <span class="rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand-700">{{ viewing.sex }}</span>
              <span v-if="ageFromBirthdate(viewing.birthdate) !== null"
                    class="text-xs font-semibold text-slate-600 dark:text-slate-300">{{ ageFromBirthdate(viewing.birthdate) }} years old</span>
              <span class="badge" :class="viewing.status === 'active' ? 'badge-success' : 'badge-danger'">
                <span class="mr-1 inline-block h-1.5 w-1.5 rounded-full"
                      :class="viewing.status === 'active' ? 'bg-emerald-500' : 'bg-rose-500'"></span>
                {{ viewing.status === 'active' ? 'Active' : 'Inactive' }}
              </span>
            </div>
            <h3 class="mt-1 text-lg font-bold text-slate-800 dark:text-slate-100">{{ fullName(viewing) }}</h3>
            <div v-if="viewing.birthdate" class="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
              Born {{ birthdateInputValue(viewing.birthdate) }}
              <span v-if="viewing.civil_status"> · {{ viewing.civil_status }}</span>
              <span v-if="viewing.nationality"> · {{ viewing.nationality }}</span>
            </div>
          </div>
          <span v-if="viewLoading" class="text-[11px] text-brand-600">Loading…</span>
        </div>

        <!-- Contact -->
        <div>
          <div class="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Contact</div>
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 text-sm text-slate-800 dark:text-slate-100">
            <div><span class="text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 text-xs">Phone:</span> {{ viewing.contact_number || '—' }}</div>
            <div><span class="text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 text-xs">Email:</span> {{ viewing.email || '—' }}</div>
            <div class="sm:col-span-2">
              <span class="text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 text-xs">Address:</span>
              {{ [viewing.address_street1, viewing.address_street2, viewing.city, viewing.province, viewing.postal_code, viewing.country].filter(Boolean).join(', ') || '—' }}
            </div>
          </div>
        </div>

        <!-- Medical -->
        <div>
          <div class="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Medical</div>
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-3 text-sm text-slate-800 dark:text-slate-100">
            <div><span class="text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 text-xs">Blood type:</span> {{ viewing.blood_type || '—' }}</div>
            <div class="sm:col-span-2"><span class="text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 text-xs">Allergies:</span> {{ viewing.allergies || '—' }}</div>
            <div v-if="viewing.notes" class="sm:col-span-3">
              <span class="text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 text-xs">Notes:</span>
              <p class="mt-0.5 whitespace-pre-line">{{ viewing.notes }}</p>
            </div>
          </div>
        </div>

        <!-- IDs -->
        <div>
          <div class="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Government IDs</div>
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 text-sm">
            <div><span class="text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 text-xs">National ID:</span> <span class="font-mono">{{ viewing.national_id || '—' }}</span></div>
            <div><span class="text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 text-xs">PhilHealth:</span> <span class="font-mono">{{ viewing.philhealth_number || '—' }}</span></div>
            <div><span class="text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 text-xs">Senior Citizen:</span> <span class="font-mono">{{ viewing.senior_citizen_number || '—' }}</span></div>
            <div><span class="text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 text-xs">PWD:</span> <span class="font-mono">{{ viewing.pwd_number || '—' }}</span></div>
            <div><span class="text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 text-xs">Occupation:</span> {{ viewing.occupation || '—' }}</div>
            <div><span class="text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 text-xs">Company / HMO:</span> {{ viewing.company || '—' }}</div>
          </div>
        </div>

        <!-- Emergency -->
        <div>
          <div class="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Emergency Contact</div>
          <div class="text-sm text-slate-800 dark:text-slate-100">
            <template v-if="viewing.emergency_contact_name">
              {{ viewing.emergency_contact_name }}
              <span v-if="viewing.emergency_contact_relation" class="text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 text-xs">({{ viewing.emergency_contact_relation }})</span>
              — {{ viewing.emergency_contact_number || 'no number' }}
            </template>
            <template v-else>—</template>
          </div>
        </div>

        <!-- Referral -->
        <div v-if="viewing.referring_physician">
          <div class="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Referring Physician</div>
          <div class="text-sm text-slate-800 dark:text-slate-100">{{ viewing.referring_physician }}</div>
        </div>

        <!-- Case history — server-paginated. Keeps the modal usable even
             when the patient has thousands of visits over the years. -->
        <div class="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/70 p-3">
          <div class="mb-2 flex items-center justify-between">
            <div class="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
              Patient Cases
              <span v-if="caseHistoryTotal > 0" class="text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 normal-case font-medium">
                · {{ caseHistoryTotal }} total
              </span>
              <span v-if="caseHistoryLoading" class="ml-1 text-brand-600">· loading…</span>
            </div>
          </div>

          <div v-if="caseHistoryError"
               class="mb-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] text-rose-700">
            {{ caseHistoryError }}
          </div>

          <div class="overflow-hidden rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <div v-if="!caseHistoryLoading && !caseHistory.length"
                 class="p-3 text-center text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
              No cases registered for this patient yet.
            </div>
            <table v-else class="w-full text-xs">
              <thead class="bg-slate-100 dark:bg-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
                <tr>
                  <th class="px-2 py-1.5 text-left">Case #</th>
                  <th class="w-16 px-2 py-1.5 text-left">Type</th>
                  <th class="px-2 py-1.5 text-left">Admission</th>
                  <th class="px-2 py-1.5 text-left">Chief complaint</th>
                  <th class="w-24 px-2 py-1.5 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="c in caseHistory" :key="c.uuid" class="border-t border-slate-100 dark:border-slate-800 align-top">
                  <td class="px-2 py-1 font-mono font-semibold text-slate-700 dark:text-slate-200">{{ c.case_number }}</td>
                  <td class="px-2 py-1">
                    <span class="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                          :class="caseTypeBadgeClass(c.case_type)">{{ c.case_type }}</span>
                  </td>
                  <td class="px-2 py-1 text-slate-600 dark:text-slate-300">{{ formatDateTime(c.admission_date) }}</td>
                  <td class="px-2 py-1 text-slate-700 dark:text-slate-200 truncate max-w-xs" :title="c.chief_complaint || ''">
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
        <div class="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/70 p-3">
          <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div class="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
              Lab Results
              <span v-if="labHistory.length" class="text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 normal-case font-medium">
                · {{ labHistory.length }} report{{ labHistory.length === 1 ? '' : 's' }}
              </span>
              <span v-if="labHistoryLoading" class="ml-1 text-brand-600">· loading…</span>
            </div>
            <div class="flex items-center gap-1">
              <label class="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Year</label>
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

          <div class="overflow-hidden rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <div v-if="!labHistoryLoading && !labHistory.length"
                 class="p-3 text-center text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
              No lab results in {{ labHistoryYear }}.
            </div>
            <table v-else class="w-full text-xs">
              <thead class="bg-slate-100 dark:bg-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
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
                <tr v-for="r in labHistory" :key="r.uuid" class="border-t border-slate-100 dark:border-slate-800 align-top">
                  <td class="px-2 py-1 font-mono font-semibold text-slate-700 dark:text-slate-200">{{ r.lab_number }}</td>
                  <td class="px-2 py-1 text-slate-600 dark:text-slate-300">{{ r.item_category_name || '—' }}</td>
                  <td class="px-2 py-1 text-slate-700 dark:text-slate-200 truncate max-w-xs" :title="r.test_items_summary || ''">
                    {{ r.test_items_summary || '—' }}
                  </td>
                  <td class="px-2 py-1 text-slate-600 dark:text-slate-300">{{ formatDateTime(r.finalized_at || r.created_at) }}</td>
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

        <div class="border-t border-slate-100 dark:border-slate-800 pt-2 text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
          Registered {{ formatDateTime(viewing.created_at) }}
          <span v-if="viewing.created_by">by {{ viewing.created_by }}</span>
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="closeView">Close</button>
        <button class="btn-primary" @click="switchToEdit">Edit</button>
      </template>
    </Modal>

    <!-- ═══ Lab report preview + print ══════════════════════════════════════
         Uses the shared LabReportPrintable component + the isolated-popup
         doPrint() flow, so the preview and printed page match what operators
         see under Laboratory (including the CHEM flat layout when the
         category is Clinical Chemistry). -->
    <Modal :show="!!labPreview || labPreviewLoading || !!labPreviewError"
           :title="`Lab Report ${labPreview?.lab_number || ''}`" size="2xl"
           @close="closeLabPreview">
      <div v-if="labPreviewLoading" class="p-6 text-center text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Loading…</div>
      <div v-else-if="labPreviewError"
           class="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
        {{ labPreviewError }}
      </div>
      <template v-else-if="labPreview">
        <!-- Paper-size note. Predictor measures content at the configured
             paper's width and recommends a larger size when it wouldn't fit. -->
        <div class="mb-3 rounded-md border px-3 py-2 text-xs"
             :class="paperWasUpgraded
                     ? 'border-amber-200 bg-amber-50 text-amber-800'
                     : 'border-brand-100 bg-brand-50/50 text-brand-800'">
          <div class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <div>
              <span class="font-semibold">Load into printer:</span>
              <span class="ml-1">{{ effectivePaperLabel }}</span>
            </div>
            <template v-if="paperWasUpgraded">
              <div class="text-[11px] italic">
                Predicted: content wouldn't fit on {{ configuredPaperLabel }} — recommend {{ recommendedPaperLabel }}.
              </div>
              <div class="ml-auto flex gap-2">
                <button type="button"
                        class="rounded px-2 py-0.5 text-[11px] font-semibold"
                        :class="effectivePaperKey === configuredPaperKey
                                ? 'bg-amber-600 text-white'
                                : 'bg-white dark:bg-slate-900 text-amber-800 border border-amber-300'"
                        @click="effectivePaperKey = configuredPaperKey">
                  Configured
                </button>
                <button type="button"
                        class="rounded px-2 py-0.5 text-[11px] font-semibold"
                        :class="effectivePaperKey === recommendedPaperKey
                                ? 'bg-amber-600 text-white'
                                : 'bg-white dark:bg-slate-900 text-amber-800 border border-amber-300'"
                        @click="effectivePaperKey = recommendedPaperKey">
                  Recommended
                </button>
              </div>
            </template>
          </div>
        </div>

        <div :ref="setPreviewFrame">
          <div class="mx-auto overflow-hidden"
               :style="`width: ${previewFrameWidthPx}px; height: ${previewFrameHeightPx}px;`">
            <div :ref="setPreviewContent"
                 :style="`width: ${previewPaperPx.w}px;
                          transform: scale(${previewScale});
                          transform-origin: top left;`">
              <LabReportPrintable :report="labPreview" :tenant="tenant.current"
                                  :qr-data-url="qrDataUrl"
                                  :paper-height="previewPaperPx.h" />
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <button class="btn-secondary" @click="closeLabPreview">Close</button>
        <button v-if="labPreview" class="btn-primary" @click="doPrint">Print</button>
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
