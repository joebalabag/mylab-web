<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useLaboratoryStore } from '../stores/laboratory'
import { useItemCategoriesStore } from '../stores/itemCategories'
import { useItemGroupsStore } from '../stores/itemGroups'
import { useDoctorsStore } from '../stores/doctors'
import { useTenantStore } from '../stores/tenant'
import { useAuthStore } from '../stores/auth'
import * as labApi from '../api/laboratory'
import { verifyCredentials } from '../api/users'
import { assetUrl } from '../api/client'
import QRCode from 'qrcode'
import Modal from '../components/Modal.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import EmptyState from '../components/EmptyState.vue'
import SkeletonRows from '../components/SkeletonRows.vue'
import RowActionMenu from '../components/RowActionMenu.vue'
import MobileFilterBar from '../components/MobileFilterBar.vue'
import LabReportPrintable from '../components/LabReportPrintable.vue'
import { daysAgoISO, formatDate, formatDateTime, todayISO } from '../utils/format'

const lab        = useLaboratoryStore()
const categories = useItemCategoriesStore()
const groups     = useItemGroupsStore()
const doctors    = useDoctorsStore()
const tenant     = useTenantStore()
const auth       = useAuthStore()

// ─── Dashboard filters ───
// Initialize from the persisted Pinia store so navigating away and back
// restores the last-applied filter set. First visit (empty store) falls back
// to the defaults defined below.
const persisted = lab.filters || {}
const hadPersisted = !!(persisted.item_group_uuid || persisted.item_category_uuid
  || persisted.keywords || (persisted.status && persisted.status.length)
  || persisted.date_from || persisted.date_to)
const search         = ref(persisted.keywords || '')
const statusFilter   = ref((persisted.status && persisted.status[0]) || '')  // '' | 'draft' | 'finalized' | 'voided'
const groupFilter    = ref(persisted.item_group_uuid || '')                  // '' | item_group_uuid — narrows the category dropdown too
const categoryFilter = ref(persisted.item_category_uuid || '')               // '' | item_category_uuid
// Dates default to a 2-day window ending today ONLY when there's no
// persisted filter set yet — otherwise honor whatever the user last
// selected (including empty). Special-case for date_to: if a persisted
// upper bound has fallen behind today's date (e.g. user opened the page
// yesterday and left the filter pinned to yesterday), slide the window
// forward to today on load so newly created reports show up without the
// operator having to touch the filter. When we slide date_to we also
// slide date_from to keep the 2-day window intact. An explicitly-cleared
// upper bound (empty string) is left alone — that means "no ceiling"
// and is a valid choice we shouldn't override.
const _todayStr      = todayISO()
const _twoDaysAgo    = daysAgoISO(2)
const _persistedTo   = persisted.date_to || ''
const _shouldSlide   = hadPersisted && _persistedTo && _persistedTo < _todayStr
const dateFrom       = ref(hadPersisted
  ? (_shouldSlide ? _twoDaysAgo : (persisted.date_from || ''))
  : _twoDaysAgo)
const dateTo         = ref(hadPersisted
  ? (_shouldSlide ? _todayStr : _persistedTo)
  : _todayStr)
const listError      = ref('')

async function loadReports() {
  listError.value = ''
  lab.setFilters({
    tenant_uuid:        auth.tenantUuid || '',
    item_group_uuid:    groupFilter.value || '',
    item_category_uuid: categoryFilter.value || '',
    keywords:           search.value.trim(),
    status:             statusFilter.value ? [statusFilter.value] : [],
    date_from:          dateFrom.value || '',
    date_to:            dateTo.value || ''
  })
  try {
    await lab.fetch()
  } catch (e) {
    listError.value = e?.message || 'Failed to load lab reports'
  }
}

async function loadCategories() {
  try {
    await categories.fetch({ page_number: 0, page_size: 500 })
  } catch (_) { /* non-fatal — filter dropdown just stays empty */ }
}
async function loadGroups() {
  try {
    await groups.fetch({ page_number: 0, page_size: 500 })
  } catch (_) { /* non-fatal */ }
}
async function loadDoctors() {
  try {
    await doctors.fetch({ page_number: 0, page_size: 500 })
  } catch (_) { /* non-fatal — signatory picker just stays sparse */ }
}
const activeDoctors = computed(() => doctors.items.filter((d) => d.status === 'active'))

onMounted(async () => {
  await Promise.all([loadCategories(), loadGroups(), loadDoctors()])
  // Group must always be selected. Honor the persisted value if it's still a
  // valid active group; otherwise fall back to the first active group.
  const activeList = groups.items.filter((g) => g.status === 'active')
  const stillValid = groupFilter.value && activeList.some((g) => g.uuid === groupFilter.value)
  if (!stillValid) {
    groupFilter.value = activeList[0]?.uuid || ''
  }
  await loadReports()
})

const activeGroups     = computed(() => groups.items.filter((g) => g.status === 'active'))
// Categories narrow to the selected group so the Category dropdown doesn't
// offer options that would produce an empty result.
const activeCategories = computed(() => {
  const list = categories.items.filter((c) => c.status === 'active')
  if (!groupFilter.value) return list
  return list.filter((c) => c.item_group_uuid === groupFilter.value)
})

function onSearchEnter()  { loadReports() }
function onFilterChange() { loadReports() }
function onGroupChange() {
  // Clear the Category selection if it's no longer inside the chosen group.
  if (categoryFilter.value) {
    const c = categories.items.find((x) => x.uuid === categoryFilter.value)
    if (c && groupFilter.value && c.item_group_uuid !== groupFilter.value) {
      categoryFilter.value = ''
    }
  }
  loadReports()
}
function clearFilters() {
  search.value = ''
  statusFilter.value = ''
  categoryFilter.value = ''
  // Group is required — reset to the first active group instead of clearing.
  const firstGroup = groups.items.find((g) => g.status === 'active')
  if (firstGroup) groupFilter.value = firstGroup.uuid
  dateFrom.value = daysAgoISO(2)
  dateTo.value   = todayISO()
  loadReports()
}

const draftCount     = computed(() => lab.items.filter(r => r.status === 'draft').length)
const finalizedCount = computed(() => lab.items.filter(r => r.status === 'finalized').length)

// ─── Toast ───
const toast = ref('')
const toastTone = ref('emerald')
let toastTimer = null
function flash(m, tone = 'emerald') {
  toast.value = m
  toastTone.value = tone
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 2800)
}
function flashError(e, fallback) {
  flash(e?.message || fallback || 'Something went wrong', 'rose')
}

// ─── Add Laboratory (two-step modal) ───
const showAdd     = ref(false)
const addStep     = ref(1)          // 1 = pick requisition, 2 = grouping tree
const addLoading  = ref(false)
const addError    = ref('')

const eligibleQuery       = ref('')
const eligibleList        = ref([])
const eligibleLoading     = ref(false)
const selectedRequisition = ref(null)
const uncoveredItems      = ref([])            // raw uncovered items for the requisition
const uncoveredGroups     = ref([])            // grouped by category — mutable checkbox tree
const submitting          = ref(false)

function openAdd() {
  addStep.value = 1
  addError.value = ''
  eligibleQuery.value = ''
  selectedRequisition.value = null
  uncoveredItems.value = []
  uncoveredGroups.value = []
  showAdd.value = true
  loadEligible()
}

async function loadEligible() {
  eligibleLoading.value = true
  try {
    // Carry the dashboard's Item Group filter into the Add modal so only
    // requisitions with uncovered items in that group show up here.
    const rows = await lab.listEligibleRequisitions(
      eligibleQuery.value.trim() || undefined,
      { item_group_uuid: groupFilter.value || undefined },
    )
    eligibleList.value = Array.isArray(rows) ? rows : []
  } catch (e) {
    addError.value = e?.message || 'Failed to load eligible requisitions'
  } finally {
    eligibleLoading.value = false
  }
}

async function pickRequisition(req) {
  selectedRequisition.value = req
  addError.value = ''
  addLoading.value = true
  try {
    const res = await lab.listUncoveredItems(req.patient_requisition_uuid)
    let items = Array.isArray(res?.items) ? res.items : []
    // Honor the dashboard's Item Group filter — hide test lines whose
    // category doesn't belong to the selected group.
    if (groupFilter.value) {
      const catsInGroup = new Set(
        categories.items
          .filter((c) => c.item_group_uuid === groupFilter.value)
          .map((c) => c.uuid),
      )
      items = items.filter((it) => it.item_category_uuid && catsInGroup.has(it.item_category_uuid))
    }
    uncoveredItems.value = items
    uncoveredGroups.value = buildDefaultGroups(uncoveredItems.value)
    addStep.value = 2
  } catch (e) {
    addError.value = e?.message || 'Failed to load requisition items'
  } finally {
    addLoading.value = false
  }
}

/**
 * Default grouping rule: for each uncovered item, if its category has
 * combine_printout=true, group under key `cat:<uuid>`. Otherwise each item
 * becomes its own group under key `test:<pri_uuid>` (single-item group). We
 * expose the raw category metadata on the group so the operator can override.
 */
function buildDefaultGroups(items) {
  const map = new Map()
  for (const it of items) {
    const combine = it.combine_printout !== false
    const key = combine && it.item_category_uuid
      ? `cat:${it.item_category_uuid}`
      : `test:${it.uuid}`
    if (!map.has(key)) {
      map.set(key, {
        key,
        item_category_uuid: it.item_category_uuid || null,
        item_category_code: it.item_category_code || null,
        item_category_name: it.item_category_name || null,
        combine,
        items: [],
        selected: new Set()   // uncovered_item.uuid values included in this lab_report
      })
    }
    const g = map.get(key)
    g.items.push(it)
    g.selected.add(it.uuid)  // default: all items in the group are selected
  }
  return Array.from(map.values())
}

function toggleItem(group, itemUuid) {
  if (group.selected.has(itemUuid)) group.selected.delete(itemUuid)
  else group.selected.add(itemUuid)
  // Vue can't track Set mutation reactively — swap the ref for a new Set.
  group.selected = new Set(group.selected)
}
function toggleGroup(group) {
  if (group.items.every((i) => group.selected.has(i.uuid))) {
    group.selected = new Set()
  } else {
    group.selected = new Set(group.items.map((i) => i.uuid))
  }
}
function isGroupAllSelected(group) {
  return group.items.length && group.items.every(i => group.selected.has(i.uuid))
}
function isGroupPartiallySelected(group) {
  const n = group.items.filter(i => group.selected.has(i.uuid)).length
  return n > 0 && n < group.items.length
}
function groupSelectedCount(group) {
  return group.items.filter(i => group.selected.has(i.uuid)).length
}

const finalGroups = computed(() =>
  uncoveredGroups.value
    .map((g) => ({
      item_category_uuid: g.item_category_uuid,
      item_category_name: g.item_category_name,
      requisition_item_uuids: g.items.filter(i => g.selected.has(i.uuid)).map(i => i.uuid)
    }))
    .filter((g) => g.requisition_item_uuids.length > 0)
)

async function confirmAdd() {
  if (!selectedRequisition.value || !finalGroups.value.length) return
  submitting.value = true
  addError.value = ''
  try {
    const created = await lab.createBatch({
      tenant_uuid: auth.tenantUuid || undefined,
      patient_requisition_uuid: selectedRequisition.value.patient_requisition_uuid,
      groups: finalGroups.value.map((g) => ({
        item_category_uuid: g.item_category_uuid || undefined,
        requisition_item_uuids: g.requisition_item_uuids
      }))
    })
    flash(`Created ${created.length} lab report${created.length === 1 ? '' : 's'}`)
    showAdd.value = false
    await loadReports()
    if (created.length === 1) openEditor(created[0].uuid)
  } catch (e) {
    addError.value = e?.message || 'Failed to create lab reports'
  } finally {
    submitting.value = false
  }
}

// ─── Editor (result entry) ───
const showEditor = ref(false)
const editorLoading = ref(false)
const editorError   = ref('')
const editorReport  = ref(null)    // deep copy of the report for local editing
const savingResults = ref(false)

async function openEditor(uuid) {
  editorLoading.value = true
  editorError.value = ''
  editorReport.value = null
  showEditor.value = true
  try {
    const row = await lab.fetchOne(uuid)
    // Deep clone so edits don't mutate the store copy until save succeeds.
    editorReport.value = JSON.parse(JSON.stringify(row))
    // Populate a local ISO-datetime-local string for the <input type=datetime-local>.
    // Prefill "now" when a draft has no saved value yet — operator can still
    // change it before saving; finalized/voided reports keep an empty field
    // if the value is missing (the input is disabled in that state anyway).
    editorReport.value.specimen_collected_at_local =
      toDatetimeLocal(editorReport.value.specimen_collected_at)
      || (editorReport.value.status === 'draft' ? toDatetimeLocal(new Date()) : '')
    if (editorReport.value?.items) {
      for (const it of editorReport.value.items) {
        if (it.values) {
          for (const v of it.values) {
            v.value_text = v.value_text ?? ''
            v.value_numeric = v.value_numeric ?? ''
            v.flag = v.flag ?? ''
          }
        }
        it.narrative_text = it.narrative_text ?? ''
      }
    }
  } catch (e) {
    editorError.value = e?.message || 'Failed to load lab report'
  } finally {
    editorLoading.value = false
  }
}

async function saveResults(silent = false) {
  if (!editorReport.value) return false
  savingResults.value = true
  editorError.value = ''
  try {
    const payload = {
      remarks: editorReport.value.remarks ?? '',
      specimen_collected_at: fromDatetimeLocal(editorReport.value.specimen_collected_at_local) ?? null,
      items: editorReport.value.items.map((it) => {
        if (it.result_type === 'narrative' || it.result_type === 'culture') {
          return {
            lab_report_item_uuid: it.uuid,
            narrative_text: it.narrative_text || ''
          }
        }
        return {
          lab_report_item_uuid: it.uuid,
          values: (it.values || []).map((v) => ({
            uuid: v.uuid,
            value_text: v.value_text === '' ? undefined : v.value_text,
            value_numeric: v.value_numeric === '' || v.value_numeric == null
              ? undefined
              : Number(v.value_numeric),
            flag: v.flag || undefined
          }))
        }
      })
    }
    await lab.saveResults(editorReport.value.uuid, payload)
    if (!silent) flash('Results saved')
    // Refresh the local copy from the store's current so we pick up server
    // timestamps and normalized values.
    if (lab.current) {
      editorReport.value = JSON.parse(JSON.stringify(lab.current))
      editorReport.value.specimen_collected_at_local =
        toDatetimeLocal(editorReport.value.specimen_collected_at)
        || (editorReport.value.status === 'draft' ? toDatetimeLocal(new Date()) : '')
      for (const it of (editorReport.value.items || [])) {
        it.narrative_text = it.narrative_text ?? ''
        if (it.values) for (const v of it.values) {
          v.value_text = v.value_text ?? ''
          v.value_numeric = v.value_numeric ?? ''
          v.flag = v.flag ?? ''
        }
      }
    }
    await loadReports()
    return true
  } catch (e) {
    editorError.value = e?.message || 'Failed to save results'
    return false
  } finally {
    savingResults.value = false
  }
}

// Called by the Tag-as-Final button inside the editor. Persists any pending
// edits first so the finalized report reflects what's on screen; the plain
// Save button doesn't flash a toast when this path runs it.
async function saveAndAskFinal() {
  if (!editorReport.value) return
  const ok = await saveResults(true)
  if (!ok) return
  askSetFinal(editorReport.value)
}

// ─── Set final ───
// `signatoryUsername` / `signatoryPassword` are populated only when the
// tenant runs with tester_signatory_count = 2 — the finalize modal shows
// a credential prompt that the server verifies to fill medtech2_*. Same
// user as slot 1 → collapses to a single printed signature (not an error).
const confirmFinal = ref({
  show: false,
  report: null,
  pathologist: '',
  doctorUuid: '',      // '' = manual name entry, otherwise a doctor uuid
  defaultDoctor: null, // the item_group's default signatory doctor (may be null)
  loadingDoctor: false,
  signatoryUsername: '',
  signatoryPassword: '',
  authError: '',
  submitting: false,
})
function resetConfirmFinal() {
  confirmFinal.value = {
    show: false, report: null, pathologist: '', doctorUuid: '',
    defaultDoctor: null, loadingDoctor: false,
    signatoryUsername: '', signatoryPassword: '', authError: '', submitting: false,
  }
}
// True when the tenant is configured for two tester signatories — drives
// the credential prompt inside the Tag-as-Final modal.
const twoTesterSignatories = computed(() =>
  Number(tenant.current?.testerSignatoryCount) === 2
)
async function askSetFinal(r) {
  confirmFinal.value = {
    show: true,
    report: r,
    pathologist: r.pathologist_name || auth.user?.name || '',
    doctorUuid: '',
    defaultDoctor: null,
    loadingDoctor: true,
    signatoryUsername: '',
    signatoryPassword: '',
    authError: '',
    submitting: false,
  }
  // Preload the item group's default signatory doctor so we can pre-select
  // it on open. If the group has one configured, it becomes the default
  // choice; user can override with the picker.
  try {
    const doc = await labApi.getLabReportDefaultSignatory(r.uuid)
    if (doc?.uuid && confirmFinal.value.show && confirmFinal.value.report?.uuid === r.uuid) {
      confirmFinal.value.defaultDoctor = doc
      confirmFinal.value.doctorUuid    = doc.uuid
      confirmFinal.value.pathologist   = doc.name
    }
  } catch (_) { /* non-fatal — fall back to manual */ }
  finally { confirmFinal.value.loadingDoctor = false }
}
async function doSetFinal() {
  const state = confirmFinal.value
  const { report, pathologist, doctorUuid, signatoryUsername, signatoryPassword } = state
  if (twoTesterSignatories.value && (!signatoryUsername || !signatoryPassword)) {
    state.authError = 'Second signatory credentials are required to finalize this report.'
    return
  }
  state.authError = ''
  state.submitting = true
  try {
    await lab.setFinal(report.uuid, {
      pathologist_name: pathologist.trim() || undefined,
      pathologist_doctor_uuid: doctorUuid || undefined,
      // Sent only when count = 2. Backend ignores them for count = 1
      // tenants — but suppressing them client-side keeps the payload tidy.
      signatory_username: twoTesterSignatories.value ? signatoryUsername.trim() : undefined,
      signatory_password: twoTesterSignatories.value ? signatoryPassword       : undefined,
    })
    resetConfirmFinal()
    flash(`Report ${report.lab_number} finalized`)
    if (showEditor.value && editorReport.value?.uuid === report.uuid) {
      await openEditor(report.uuid)
    }
    await loadReports()
    // Jump straight to Print Preview so the operator can print the newly
    // finalized report without hunting for the row-action menu.
    await openPrint(report)
  } catch (e) {
    // 401 / 400 messages from the server surface inline so the operator
    // can re-enter credentials without losing the rest of the modal state.
    state.submitting = false
    state.authError = e?.message || 'Failed to finalize lab report'
  }
}

// ─── Void ───
// Void requires a supervisor credential re-check (admin/manager) to prevent
// a cashier session from silently discarding finalized/draft reports. The
// current signed-in supervisor can approve their own action by re-typing
// their password.
const confirmVoid = ref({
  show: false, report: null, reason: '',
  username: '', password: '', authError: '', verifying: false,
})
function askVoid(r) {
  confirmVoid.value = {
    show: true, report: r, reason: '',
    username: auth.user?.username || '', password: '', authError: '', verifying: false,
  }
}
async function doVoid() {
  const state = confirmVoid.value
  if (!state.reason.trim())     { state.authError = 'Reason is required.'; return }
  if (!state.username.trim())   { state.authError = 'Username is required.'; return }
  if (!state.password)          { state.authError = 'Password is required.'; return }
  state.verifying = true
  state.authError = ''
  try {
    const check = await verifyCredentials(state.username.trim(), state.password)
    if (!check?.verified) {
      state.authError = check?.message || 'Credentials rejected.'
      state.verifying = false
      return
    }
  } catch (e) {
    state.authError = e?.message || 'Credential check failed.'
    state.verifying = false
    return
  }
  const { report, reason } = state
  confirmVoid.value = { show: false, report: null, reason: '', username: '', password: '', authError: '', verifying: false }
  try {
    await lab.voidReport(report.uuid, reason.trim())
    flash(`Report ${report.lab_number} voided`)
    await loadReports()
  } catch (e) {
    flashError(e, 'Failed to void lab report')
  }
}

// ─── Print preview ───
const showPrint = ref(false)
const printLoading = ref(false)
const printReport  = ref(null)
// Data-URL of the generated QR code — regenerated per report open so the
// image is embedded in the DOM (no extra fetch, prints reliably).
const qrDataUrl = ref('')

// Paper size the printer will actually be told to use. Starts from the
// category setting on the report, then automatically upgrades to the next
// size up when the content wouldn't fit on the configured paper. The Print
// Preview modal displays this so the operator knows what to load.
const effectivePaperKey   = ref('letter')
// The size the predictor thinks actually fits the content, computed once
// when Print Preview opens. May differ from the configured size — the
// modal exposes both and the user can flip between them.
const recommendedPaperKey = ref('letter')

// Human-friendly label + upgrade paths for the paper sizes.
const PAPER_LABELS = {
  full:                  'Full page (A4)',
  half:                  'Half page (A5)',
  letter:                'Letter — 8.5″ × 11″',
  legal:                 'Legal — 8.5″ × 14″',
  half_letter:           'Half Letter — 5.5″ × 8.5″',
  half_letter_crosswise: 'Half Letter — 8.5″ × 5.5″ crosswise',
  half_legal_crosswise:  'Half Legal — 8.5″ × 7″ crosswise',
}
// Upgrade path used by the predictor — walks up from the configured size
// until content fits or we run out of larger options.
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

// ─── Scaled on-screen preview ─────────────────────────────────────────
// The preview renders LabReportPrintable at true paper width (e.g. 816px
// for letter) so it matches the printed layout exactly. On narrow modal
// widths (phones) we shrink it with CSS transform: scale() so the whole
// page is visible without horizontal scrolling — and, crucially, without
// letting the responsive flex/grid classes reflow into a mobile layout.
// Two ResizeObservers: one for the outer frame width (drives scale),
// one for the inner content height (drives the frame's scaled height so
// multi-page reports don't get clipped and the modal still scrolls
// naturally).
const previewFrameWidth   = ref(0)
const previewContentHeight = ref(0)
let previewWidthObs  = null
let previewHeightObs = null
// Element handles kept around so we can force a re-measure after images
// finish loading — the initial ref-callback measurement runs before the
// tenant logo / QR code have contributed their real height, and if a
// stale/small height leaks into previewFrameHeightPx the outer
// `overflow-hidden` wrapper clips the preview to a blank strip that only
// unwedges after a browser refresh.
let previewFrameEl   = null
let previewContentEl = null
function setPreviewFrame(el) {
  if (previewWidthObs) { previewWidthObs.disconnect(); previewWidthObs = null }
  previewFrameEl = el || null
  if (!el) { previewFrameWidth.value = 0; return }
  // clientWidth is a layout measurement (unaffected by any parent transform),
  // so it's safe to read synchronously here.
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
  // NOTE: this element carries `transform: scale(previewScale)`, so
  // getBoundingClientRect() would return the POST-transform (scaled)
  // height and understate the natural content size when the modal is
  // narrower than the paper. `offsetHeight` returns the layout size
  // pre-transform — that's the value we want.
  previewContentHeight.value = el.offsetHeight
  if (typeof ResizeObserver !== 'undefined') {
    previewHeightObs = new ResizeObserver((entries) => {
      for (const e of entries) previewContentHeight.value = e.contentRect.height
    })
    previewHeightObs.observe(el)
  }
}
// Force a fresh, direct read of the preview's layout dims. Called after
// nextTick + rAF + waitForImages so the DOM has fully settled — the ref
// callbacks fire during initial mount when the QR data-URL is still
// loading, and if their captured height sticks the preview stays blank
// until the user refreshes.
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
const previewFrameHeightPx = computed(() => {
  const contentH = previewContentHeight.value || previewPaperPx.value.h
  return Math.ceil(contentH * previewScale.value)
})
// Width of the visible scaled sheet — used to size the centering wrapper
// so the paper sits in the middle of the modal instead of top-left with
// dead space to the right on wide screens.
const previewFrameWidthPx = computed(() => Math.ceil(previewPaperPx.value.w * previewScale.value))
// The signature block is always pinned to the bottom of the last page —
// short reports get a clean signature-at-page-bottom layout instead of
// signatures floating awkwardly in the middle of the paper, and multi-page
// reports still land signatures at the physical bottom of the final page.
const pinSignatureToBottom = computed(() => !!printReport.value)
const effectivePaperLabel   = computed(() => PAPER_LABELS[effectivePaperKey.value]   || PAPER_LABELS.letter)
const recommendedPaperLabel = computed(() => PAPER_LABELS[recommendedPaperKey.value] || PAPER_LABELS.letter)
const configuredPaperKey    = computed(() => printReport.value?.item_category_print_paper_size || 'full')
const configuredPaperLabel  = computed(() => PAPER_LABELS[configuredPaperKey.value]  || PAPER_LABELS.letter)
// True when the predictor recommends a different (larger) size than the
// category's configured setting.
const paperWasUpgraded      = computed(() => recommendedPaperKey.value !== configuredPaperKey.value)

// Build the public URL that the QR code encodes. window.location.origin gives
// us the tenant's app hostname; the /lab/view route mounts PublicLabReportView.
function publicLabUrl(token) {
  if (!token) return ''
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/lab/view?t=${encodeURIComponent(token)}`
}

async function openPrint(r) {
  showPrint.value = true
  printReport.value = null
  qrDataUrl.value = ''
  printLoading.value = true
  try {
    printReport.value = await lab.fetchOne(r.uuid)
    const url = publicLabUrl(printReport.value?.public_token)
    if (url) {
      qrDataUrl.value = await QRCode.toDataURL(url, {
        margin: 0,
        width: 128,
        errorCorrectionLevel: 'M',
      })
    }
  } catch (e) {
    flashError(e, 'Failed to load lab report')
    return
  } finally {
    printLoading.value = false
  }
  // Preview DOM is only mounted once `printLoading` flips to false, so all
  // measurement / image-settling work has to happen AFTER the finally block.
  // Doing it inside the try (as before) meant #lab-print-area didn't exist
  // yet, waitForImages was a no-op, and the initial ref-callback measurement
  // captured a pre-image layout — occasionally leaving the preview stuck at
  // a too-small height that read as a blank white panel until refresh.
  await nextTick()
  await new Promise((r) => requestAnimationFrame(r))
  await waitForImages(document.getElementById('lab-print-area'))
  computeEffectivePaper()
  remeasurePreview()
}

// Wait until every <img> inside `root` has either loaded or errored. Prevents
// the measurement below from running before the tenant logo / QR code have
// contributed their actual height to the layout.
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

// Predict the smallest paper size the report fits on using a content-volume
// heuristic. Off-screen DOM measurement was unreliable (layout in a hidden
// container drifted from the print popup by 30-100 px in either direction),
// so we sum the pixel budget from the actual report shape: header + per-item
// overhead + per-value row + section headers + narrative lines + matrix
// cells + signature block + footer, then compare against the paper's usable
// content height with a small safety margin.
function computeEffectivePaper() {
  const report = printReport.value
  const configured = report?.item_category_print_paper_size || 'full'
  effectivePaperKey.value   = configured
  recommendedPaperKey.value = configured
  if (!report) return

  // Fixed chrome — every printed page has this baseline regardless of items.
  //   header block  = QR + logo/text + 3 rows of patient info    ~= 130 px
  //   category band = colored banner                              ~=  28 px
  //   signature    = mt-16 (64) + line + 3 rows of centered text ~= 130 px
  //   footer       = printed-at timestamp                        ~=  22 px
  const OVERHEAD = 130 + 28 + 130 + 22

  // Per test-item costs.
  const ITEM_HEADER   = 42   // title + code + method line + border-b
  const ROW_HEIGHT    = 17   // one <tr> in the panel/matrix tables
  const SECTION_ROW   = 22   // "SECTION NAME" divider row
  const NARRATIVE_LINE = 15  // one wrapped line of narrative text
  const NARRATIVE_CPL  = 90  // rough chars-per-line at the print width

  let estimated = OVERHEAD
  const items = report.items || []
  for (const it of items) {
    estimated += ITEM_HEADER
    if (it.result_type === 'single' || it.result_type === 'panel') {
      const values = it.values || []
      // Count distinct sections for the section-header rows.
      const sections = new Set(values.map((v) => v.section).filter(Boolean))
      estimated += sections.size * SECTION_ROW
      estimated += values.length * ROW_HEIGHT
      if (values.length === 0) estimated += ROW_HEIGHT  // empty state
    } else if (it.result_type === 'matrix') {
      // Matrix table = header row + one row per matrix row config.
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

  // Usable content height per paper = physical height − 12mm bottom padding
  // (≈ 45 px) − ~15 px unprintable margin common to office printers.
  const USABLE_PAD = 45 + 15
  const SAFETY_PX  = 30

  const fits = (key) => {
    const paper = PAPER_PX[key] || PAPER_PX.letter
    return estimated + SAFETY_PX <= paper.h - USABLE_PAD
  }

  let key = configured
  const seen = new Set()
  const trace = []
  for (let i = 0; i < 5 && !seen.has(key); i++) {
    seen.add(key)
    const paper = PAPER_PX[key] || PAPER_PX.letter
    const cap = paper.h - USABLE_PAD
    const ok  = fits(key)
    trace.push({ key, estimated, cap, fits: ok })
    if (ok) break
    const next = PAPER_UPGRADE[key]
    if (!next) break
    key = next
  }
  // Dev console breadcrumb — check here if the predicted size looks off.
  // eslint-disable-next-line no-console
  console.debug('[lab-print] paper prediction', { configured, picked: key, trace })
  recommendedPaperKey.value = key
  effectivePaperKey.value   = key
}
function doPrint() {
  // Open the report in a fresh, isolated print window. Copying the app's
  // stylesheets keeps every Tailwind class intact, and the popup only holds
  // the report markup — so the printed page is just the lab report with no
  // sidebar, modal chrome, or ancestor scroll containers to clip it.
  const src = document.getElementById('lab-print-area')
  if (!src) { window.print(); return }

  // Size the popup to match the paper width so the body's on-screen layout
  // paginates the same way the printer will. Without this, scrollHeight is
  // measured at ~900 px and the "continued" marker page-count math is off.
  // paperPx is defined a few lines below; peek at it early via the same map.
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
      effectivePaperKey.value || 'full'
    ]
  ] || { w: 816, h: 1056 }
  const winW = _winPaper.w + 20   // + scrollbar slack
  const winH = Math.min(_winPaper.h + 40, screen.availHeight - 40)

  const win = window.open('', '_blank', `width=${winW},height=${winH}`)
  if (!win) {
    // Popup blocked — fall back to same-window print (may include chrome).
    window.print()
    return
  }

  // Pull every <link rel=stylesheet> and <style> from the current document so
  // the popup renders with the same styles as the on-screen preview.
  const styleTags = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((n) => n.outerHTML)
    .join('\n')

  const title = `Lab Report ${printReport.value?.lab_number || ''}`

  // Map the category's configured paper size to a CSS @page size declaration.
  const paperSpec = ({
    full:                   { size: 'A4',           orientation: 'portrait'  },
    half:                   { size: 'A5',           orientation: 'portrait'  },
    letter:                 { size: 'letter',       orientation: 'portrait'  },
    legal:                  { size: '8.5in 14in',   orientation: 'portrait'  },
    half_letter:            { size: '5.5in 8.5in',  orientation: 'portrait'  },
    half_letter_crosswise:  { size: '8.5in 5.5in',  orientation: 'landscape' },
    half_legal_crosswise:   { size: '8.5in 7in',    orientation: 'landscape' },
  })[effectivePaperKey.value || 'full'] || { size: 'A4', orientation: 'portrait' }

  // Extract the two split zones (header + body) so we can rebuild them into
  // a real <table> — <thead> auto-repeats on every printed page.
  const clone = src.cloneNode(true)
  const headerEl = clone.querySelector('#lab-print-header')
  const bodyEl   = clone.querySelector('#lab-print-body')
  let printMarkup = clone.outerHTML
  if (headerEl && bodyEl) {
    // Explicit width matching the paper size — this pins the on-screen
    // popup layout to the same width the printer will render at, so
    // scrollHeight paginates identically. Without it the JS below can't
    // reliably know where physical page breaks land.
    printMarkup = `
      <div id="lab-print-area" class="relative bg-white dark:bg-slate-900 p-6 text-sm text-slate-900 dark:text-slate-100" style="padding: 0 12mm 12mm; margin: 0 auto; width: {{PAPER_W}}px; box-sizing: border-box;">
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

  // Pixel dimensions (@ 96 CSS DPI) the popup uses to compute page breaks.
  // JS then inserts absolutely-positioned "continued" markers at each page
  // boundary EXCEPT the last one — that's the only reliable cross-browser
  // way to keep the last page marker-free without paged-media polyfills.
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
  // Substitute the placeholder now that we know the paper width.
  printMarkup = printMarkup.replace('{{PAPER_W}}', String(paperPx.w))

  // Split the closing script tag across a concatenation so the Vue template
  // parser doesn't confuse this string literal for an actual close-tag.
  const closeScript = '<' + '/scr' + 'ipt>'
  const css = `
    html, body { background: #fff; margin: 0; padding: 0; }
    #lab-print-area { padding: 0 12mm 12mm; margin: 0; }
    @page { size: ${paperSpec.size} ${paperSpec.orientation}; margin: 0; }

    /* Header repeats on every printed page — browsers honor <thead> inside a
       table with display: table-header-group by default. Explicit for safety. */
    /* Defensive: nothing in the print area should ever clip its content.
       Some inherited/utility classes (line-clamp, truncate, overflow-hidden)
       can quietly cut off titles like "Peripheral Blood Smear" when the
       browser reflows for print. Force everything visible + wrappable. */
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
    /* Small breathing room above the repeating header so it isn't flush
       against the paper edge on every page. */
    .lab-print-thead .lab-print-cell { padding-top: 0.2in; }

    /* Pin the signature block to the bottom of the last page.
       For this to work through the table wrapper (used for repeating
       header) we need a full height chain: html → body → print-area
       (min-height: 100vh) → table (height: 100%) → tbody/tr/td (height:
       100%) → #lab-print-body (min-height: 100%; display:flex column).
       .lab-signature-block gets margin-top:auto so flex pushes it to the
       physical bottom. On multi-page reports the flex container grows to
       actual content height, so signature still lands at the bottom of
       the final page. */
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
  const inlineScript = ''

  win.document.open()
  win.document.write(
    `<!doctype html><html><head><meta charset="utf-8" /><title>${title}</title>${styleTags}<style>${css}</style><script>${inlineScript}${closeScript}</head><body>${printMarkup}</body></html>`
  )
  win.document.close()

  // Wait for the copied stylesheets AND images (tenant logo, QR code) to
  // finish loading before triggering print. The old code guessed a 100ms
  // delay after the `load` event which sometimes fired before external
  // <link rel=stylesheet> hrefs had actually resolved — the popup then
  // printed a blank / partially-styled page. This awaits each resource
  // explicitly with a per-resource timeout so a single stuck asset can't
  // block the whole print flow.
  async function waitForPopupReady(w) {
    const doc = w.document
    const perResourceTimeout = 3000
    const withTimeout = (p) => Promise.race([
      p, new Promise((res) => setTimeout(res, perResourceTimeout)),
    ])
    // Stylesheets — l.sheet is populated once the sheet is parsed.
    const linkWaits = Array.from(doc.querySelectorAll('link[rel="stylesheet"]')).map((l) => {
      if (l.sheet) return Promise.resolve()
      return withTimeout(new Promise((res) => {
        l.addEventListener('load',  res, { once: true })
        l.addEventListener('error', res, { once: true })
      }))
    })
    // Images — logo, QR, e-signatures. `.decode()` awaits both fetch AND
    // pixel decoding. Broken images resolve too (catch) so they don't hang.
    const imgWaits = Array.from(doc.images).map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve()
      if (typeof img.decode === 'function') return withTimeout(img.decode().catch(() => {}))
      return withTimeout(new Promise((res) => {
        img.addEventListener('load',  res, { once: true })
        img.addEventListener('error', res, { once: true })
      }))
    })
    await Promise.all([...linkWaits, ...imgWaits])
    // Fonts — @font-face files referenced by the copied stylesheets load on
    // the popup's own document, independent of the parent. Until they finish,
    // text using them is rendered with invisible glyphs (font-display: block
    // is Chrome's default when no override is set), which is the primary
    // cause of "print preview came out white." document.fonts.ready resolves
    // once every pending face is either loaded or errored. Guarded with a
    // timeout so a single stuck font can't stall the whole print flow.
    if (doc.fonts && typeof doc.fonts.ready?.then === 'function') {
      await withTimeout(doc.fonts.ready)
    }
    // One more frame so layout settles after the last resource lands —
    // otherwise Chrome can capture a mid-relayout snapshot for the print
    // rasterizer and blank out the page.
    await new Promise((r) => w.requestAnimationFrame(() => w.requestAnimationFrame(r)))
  }

  const trigger = async () => {
    await waitForPopupReady(win)
    // Close the popup once the user dismisses the print dialog (printed or
    // canceled). Fallback to a 15s guard in case the browser skips the
    // event. Setting the close on a timeout right after print() (the old
    // behaviour) killed the popup mid-preview and left the user staring at
    // a white page — that was the second reproduction of the "blank" bug.
    const cleanup = () => { try { win.close() } catch (_) { /* already closed */ } }
    win.addEventListener('afterprint', cleanup, { once: true })
    setTimeout(cleanup, 15000)
    win.focus()
    win.print()
  }
  if (win.document.readyState === 'complete') trigger()
  else win.addEventListener('load', trigger, { once: true })
}

// ─── Fine-grained access checks ──────────────────────────────────────
// The coarse `laboratory / all-access` grant was retired in favor of the
// per-action rows 220-226. Each mutating action is gated by its specific
// sub_navigation. Void isn't a separate sub-nav in the current template
// set — it piggybacks on `edit` since voiding is a state-write only draft
// managers should have.
const canLabAdd      = computed(() => auth.canDo('laboratory', 'add'))
const canLabEdit     = computed(() => auth.canDo('laboratory', 'edit'))
const canLabView     = computed(() => auth.canDo('laboratory', 'view'))
const canLabFinal    = computed(() => auth.canDo('laboratory', 'tag as final'))
const canLabUnfinal  = computed(() => auth.canDo('laboratory', 'untag as final'))
const canLabPrint    = computed(() => auth.canDo('laboratory', 'print preview'))

// ─── Row menu ───
function actionsFor(r) {
  const isDraft = r.status === 'draft'
  const isFinal = r.status === 'finalized'
  const isVoid  = r.status === 'voided'
  const acts = []
  // View / Edit shares a single row — pick the label based on what the
  // user is actually allowed to do. Hide entirely if they have neither.
  if (canLabEdit.value) {
    acts.push({ label: 'View / Edit', icon: 'edit', onClick: () => openEditor(r.uuid) })
  } else if (canLabView.value) {
    acts.push({ label: 'View', icon: 'eye', onClick: () => openEditor(r.uuid) })
  }
  if (isDraft && canLabFinal.value) {
    acts.push({
      label: 'Tag as Final', icon: 'activate', variant: 'success', onClick: () => askSetFinal(r)
    })
  }
  if (isFinal && canLabUnfinal.value) {
    // Move back to draft so the operator can amend results, then re-finalize.
    acts.push({
      label: 'Untag as Final', icon: 'edit', variant: 'warning', onClick: () => askUnsetFinal(r)
    })
  }
  // Print preview is meaningless for voided reports — the record is retained
  // for audit but shouldn't produce a printable clinical document.
  if (!isVoid && canLabPrint.value) {
    acts.push({ label: 'Print preview', icon: 'edit', onClick: () => openPrint(r) })
  }
  // Void permission piggybacks on `edit` — voiding is a mutation of report
  // state and shouldn't be available to view-only accounts.
  if (!isVoid && canLabEdit.value) {
    acts.push({ divider: true })
    acts.push({
      label: 'Void', icon: 'trash', variant: 'danger', onClick: () => askVoid(r)
    })
  }
  return acts
}

// ─── Untag as Final (reopen a finalized report back to draft) ───
// Same supervisor gate as Void — untagging discards the signature/lock and
// re-opens the results for edit, which is materially close to voiding.
const confirmUnsetFinal = ref({
  show: false, report: null,
  username: '', password: '', authError: '', verifying: false,
})
function askUnsetFinal(r) {
  confirmUnsetFinal.value = {
    show: true, report: r,
    username: auth.user?.username || '', password: '', authError: '', verifying: false,
  }
}
async function doUnsetFinal() {
  const state = confirmUnsetFinal.value
  if (!state.username.trim()) { state.authError = 'Username is required.'; return }
  if (!state.password)        { state.authError = 'Password is required.'; return }
  state.verifying = true
  state.authError = ''
  try {
    const check = await verifyCredentials(state.username.trim(), state.password)
    if (!check?.verified) {
      state.authError = check?.message || 'Credentials rejected.'
      state.verifying = false
      return
    }
  } catch (e) {
    state.authError = e?.message || 'Credential check failed.'
    state.verifying = false
    return
  }
  const { report } = state
  confirmUnsetFinal.value = { show: false, report: null, username: '', password: '', authError: '', verifying: false }
  try {
    await lab.unsetFinal(report.uuid)
    flash(`Report ${report.lab_number} reopened for editing`)
    if (showEditor.value && editorReport.value?.uuid === report.uuid) {
      await openEditor(report.uuid)
    }
    await loadReports()
  } catch (e) {
    flashError(e, 'Failed to reopen lab report')
  }
}

// Parse the snapshotted lookup_values string ("Positive,Negative") into a
// list of trimmed option strings. Empty / whitespace-only → [] so the editor
// falls back to a free-text input.
// Convert a server datetime string ("YYYY-MM-DD HH:mm:ss+08:00") to the
// value shape expected by <input type=datetime-local> ("YYYY-MM-DDTHH:mm").
function toDatetimeLocal(v) {
  if (!v) return ''
  const d = v instanceof Date ? v : new Date(v)
  if (isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
// Inverse: convert the datetime-local input value back to an ISO string with
// the browser's timezone offset so the server stores the exact instant the
// operator entered (not shifted by UTC conversion).
function fromDatetimeLocal(s) {
  if (!s) return null
  const d = new Date(s)   // Interpreted in the browser's local TZ.
  if (isNaN(d.getTime())) return null
  return d.toISOString()
}

function lookupOptions(v) {
  const raw = String(v?.lookup_values || '').trim()
  if (!raw) return []
  return raw.split(',').map((s) => s.trim()).filter(Boolean)
}

// Column-visibility helpers for the per-test result tables: skip Unit or
// Reference columns entirely when every row for the test has that field blank
// (keeps compact prints for tests that don't need those attributes).
function anyUnit(it)      { return (it.values || []).some((v) => !!(v.unit_of_measure && String(v.unit_of_measure).trim())) }
function anyReference(it) { return (it.values || []).some((v) => !!(v.reference_range && String(v.reference_range).trim())) }

// Group a panel item's values by their `section` snapshot into an ordered
// list of { section, values[] }. Values with no section fall under a "" key
// (rendered without a heading). Preserves the original display_order.
function groupValuesBySection(values) {
  if (!Array.isArray(values) || !values.length) return []
  const map = new Map()
  const order = []
  for (const v of values) {
    const key = v.section || ''
    if (!map.has(key)) { map.set(key, []); order.push(key) }
    map.get(key).push(v)
  }
  return order.map((k) => ({ section: k, values: map.get(k) }))
}

// Parse "row|col" (component_code shape for matrix cells) back into a 2D map
// so the editor + print can render as a proper grid.
function buildMatrixGrid(it) {
  const cfg = it?.matrix_config || {}
  const rows = Array.isArray(cfg.rows) ? cfg.rows : []
  const cols = Array.isArray(cfg.cols) ? cfg.cols : []
  const cells = new Map()
  for (const v of (it.values || [])) {
    cells.set(v.component_code, v)
  }
  return { rows, cols, cells }
}

// Split the tenant's lab header text into a "company name" (first non-blank
// line, printed larger) and the remaining lines (printed smaller).
const headerCompanyName = computed(() => {
  const raw = String(tenant.current.labHeaderText || '').split(/\r?\n/).map((s) => s.trim())
  const first = raw.find((l) => l.length > 0) || ''
  return first || tenant.current.name || ''
})
const headerRestLines = computed(() => {
  const raw = String(tenant.current.labHeaderText || '')
  const lines = raw.split(/\r?\n/)
  // Drop the first non-blank line (the "company name"); keep everything after.
  let dropped = false
  const out = []
  for (const l of lines) {
    if (!dropped && l.trim().length > 0) { dropped = true; continue }
    if (dropped) out.push(l)
  }
  return out.join('\n').trim()
})

// Build the category header band's inline style. Uses rgba() with a fixed
// alpha rather than concatenating "+15" onto the hex — that older form
// produced 8-char hex like "#ef444415" which some older browsers reject and
// which is easy to break if the stored color isn't 6-char hex.
function categoryHeaderStyle(report) {
  const raw = String(report?.item_category_color || '#64748b').trim()
  const m = /^#([0-9a-f]{6})$/i.exec(raw)
  let fill = 'rgba(100, 116, 139, 0.08)'
  if (m) {
    const r = parseInt(m[1].slice(0, 2), 16)
    const g = parseInt(m[1].slice(2, 4), 16)
    const b = parseInt(m[1].slice(4, 6), 16)
    fill = `rgba(${r}, ${g}, ${b}, 0.08)`
  }
  return { borderColor: raw, backgroundColor: fill }
}

function statusBadge(s) {
  if (s === 'draft')     return { text: 'Draft',     cls: 'badge bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200', dot: 'bg-slate-400' }
  if (s === 'finalized') return { text: 'Final',     cls: 'badge badge-success',               dot: 'bg-emerald-500' }
  if (s === 'voided')    return { text: 'Voided',    cls: 'badge badge-danger',                dot: 'bg-rose-500' }
  return { text: s || '—', cls: 'badge', dot: 'bg-slate-300' }
}

// Whole-year age from a birthdate (Date, ISO string, or "YYYY-MM-DD"). Returns
// an empty string when the birthdate is missing/unparseable so the caller can
// conditionally render "— y/o".
function ageFromBirthdate(v) {
  if (!v) return ''
  const bd = v instanceof Date ? v : new Date(v)
  if (isNaN(bd.getTime())) return ''
  const now = new Date()
  let age = now.getFullYear() - bd.getFullYear()
  const m = now.getMonth() - bd.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < bd.getDate())) age--
  return age >= 0 ? age : ''
}

function patientDisplay(r) {
  const parts = []
  if (r.patient_number)  parts.push(r.patient_number)
  const name = [r.patient_first_name, r.patient_last_name].filter(Boolean).join(' ')
  if (name) parts.push(name)
  return parts.join(' · ') || '—'
}
</script>

<template>
  <div class="flex h-full flex-col gap-4">
    <div class="grid grid-cols-3 gap-3 shrink-0 print:hidden">
      <div class="card"><div class="card-body">
        <div class="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Total</div>
        <div class="mt-1 text-2xl font-bold">{{ lab.total || lab.items.length }}</div>
      </div></div>
      <div class="card"><div class="card-body">
        <div class="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Drafts</div>
        <div class="mt-1 text-2xl font-bold text-amber-600">{{ draftCount }}</div>
      </div></div>
      <div class="card"><div class="card-body">
        <div class="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Finalized</div>
        <div class="mt-1 text-2xl font-bold text-emerald-600">{{ finalizedCount }}</div>
      </div></div>
    </div>

    <div class="card flex flex-1 min-h-0 flex-col overflow-hidden print:hidden">
      <div class="card-header">
        <div>
          <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">Laboratory</div>
          <div class="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
            {{ lab.items.length }} shown
            <span v-if="lab.loading" class="ml-1 text-brand-600">· loading…</span>
          </div>
        </div>
        <MobileFilterBar>
          <input
            v-model="search"
            @keyup.enter="onSearchEnter"
            placeholder="Search lab #, requisition, patient… (Enter)"
            class="input w-full sm:w-64"
          />
          <select v-model="groupFilter" @change="onGroupChange" class="input w-full sm:w-44">
            <option v-for="g in activeGroups" :key="g.uuid" :value="g.uuid">
              {{ g.name }}
            </option>
          </select>
          <select v-model="categoryFilter" @change="onFilterChange" class="input w-full sm:w-48">
            <option value="">All categories</option>
            <option v-for="c in activeCategories" :key="c.uuid" :value="c.uuid">
              {{ c.code }} · {{ c.name }}
            </option>
          </select>
          <select v-model="statusFilter" @change="onFilterChange" class="input w-full sm:w-36">
            <option value="">All status</option>
            <option value="draft">Draft</option>
            <option value="finalized">Finalized</option>
            <option value="voided">Voided</option>
          </select>
          <div class="flex items-center gap-1">
            <input v-model="dateFrom" type="date" @change="onFilterChange"
                   class="input w-full sm:w-36" :max="dateTo || undefined" title="From" />
            <span class="text-xs text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">–</span>
            <input v-model="dateTo" type="date" @change="onFilterChange"
                   class="input w-full sm:w-36" :min="dateFrom || undefined" title="To" />
          </div>
          <button class="btn-secondary" @click="clearFilters" :disabled="lab.loading" title="Reset filters">
            Reset
          </button>
          <button class="btn-secondary" @click="loadReports" :disabled="lab.loading" title="Refresh">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
          </button>
          <template #action>
            <button v-if="canLabAdd" class="btn-primary" @click="openAdd">+ Add Laboratory</button>
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
          v-if="lab.loading && !lab.items.length"
          :rows="6"
          label="Loading lab reports…"
          :columns="['bar','lines','lines','pill','pill','dot']"
        />
        <table class="table" v-else-if="lab.items.length">
          <thead class="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800 shadow-[inset_0_-1px_0_theme(colors.slate.100)]">
            <tr>
              <th class="w-40">Lab # / Req #</th>
              <th>Patient</th>
              <th>Category</th>
              <th>Tests</th>
              <th class="hidden lg:table-cell">Medtech / Pathologist</th>
              <th class="hidden md:table-cell">Created / Finalized</th>
              <th>Status</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in lab.items" :key="r.uuid" :class="r.status === 'voided' && 'bg-slate-50/50 dark:bg-slate-800/50'">
              <td>
                <button type="button"
                        class="font-mono text-xs font-semibold text-brand-700 hover:text-brand-900 hover:underline"
                        :title="r.status === 'draft' ? 'Open editor' : 'Open viewer'"
                        @click="openEditor(r.uuid)">
                  {{ r.lab_number }}
                </button>
                <div class="font-mono text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">{{ r.requisition_number || '—' }}</div>
              </td>
              <td class="text-sm text-slate-700 dark:text-slate-200">
                <div class="font-medium">
                  {{ [r.patient_first_name, r.patient_last_name].filter(Boolean).join(' ') || '—' }}
                  <span v-if="ageFromBirthdate(r.patient_birthdate) !== '' || r.patient_sex"
                        class="text-[11px] font-normal text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
                    · {{ ageFromBirthdate(r.patient_birthdate) !== '' ? `${ageFromBirthdate(r.patient_birthdate)} y/o` : '' }}<span
                      v-if="r.patient_sex" class="capitalize">{{ ageFromBirthdate(r.patient_birthdate) !== '' ? ' ' : '' }}{{ r.patient_sex }}</span>
                  </span>
                </div>
                <div v-if="r.patient_number" class="font-mono text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">{{ r.patient_number }}</div>
              </td>
              <td class="text-sm text-slate-600 dark:text-slate-300">{{ r.item_category_name || '—' }}</td>
              <td class="max-w-xs text-xs text-slate-600 dark:text-slate-300" :title="r.test_items_summary || ''">
                <div class="line-clamp-2">{{ r.test_items_summary || '—' }}</div>
                <div class="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">{{ r.item_count ?? 0 }} item(s)</div>
              </td>
              <td class="hidden lg:table-cell text-xs">
                <div class="text-slate-700 dark:text-slate-200">
                  <span class="text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">MT:</span> {{ r.medtech_name || '—' }}
                </div>
                <div class="text-slate-700 dark:text-slate-200">
                  <span class="text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Path:</span> {{ r.pathologist_name || '—' }}
                </div>
              </td>
              <td class="hidden md:table-cell text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
                <div>
                  <span class="text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Created:</span>
                  {{ formatDate(r.created_at) }}
                  <span v-if="r.created_by" class="text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500"> · {{ r.created_by }}</span>
                </div>
                <div>
                  <span class="text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Final:</span>
                  <template v-if="r.finalized_at">
                    {{ formatDate(r.finalized_at) }}
                    <span v-if="r.pathologist_name" class="text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500"> · {{ r.pathologist_name }}</span>
                  </template>
                  <template v-else>—</template>
                </div>
              </td>
              <td>
                <span :class="statusBadge(r.status).cls">
                  <span class="mr-1 inline-block h-1.5 w-1.5 rounded-full" :class="statusBadge(r.status).dot"></span>
                  {{ statusBadge(r.status).text }}
                </span>
              </td>
              <td class="text-right">
                <RowActionMenu :actions="actionsFor(r)" />
              </td>
            </tr>
          </tbody>
        </table>
        <EmptyState v-else-if="!lab.loading" title="No lab reports yet"
          message="Click Add Laboratory to create a report from a paid requisition." />
      </div>
    </div>

    <!-- ─── Add Laboratory modal ─── -->
    <Modal :show="showAdd" :title="addStep === 1 ? 'Add Laboratory — Choose Requisition' : 'Add Laboratory — Confirm Groupings'"
           size="xl" @close="showAdd = false">
      <div v-if="addStep === 1" class="space-y-3">
        <div class="flex gap-2">
          <input v-model="eligibleQuery" @keyup.enter="loadEligible"
                 placeholder="Search requisition #, patient name, patient #…" class="input flex-1" />
          <button class="btn-secondary" :disabled="eligibleLoading" @click="loadEligible">Search</button>
        </div>
        <div v-if="addError" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ addError }}
        </div>
        <div v-if="eligibleLoading" class="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Loading…</div>
        <div v-else-if="!eligibleList.length" class="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
          No paid requisitions with uncovered tests were found.
        </div>
        <div v-else class="overflow-hidden rounded-md border border-slate-200 dark:border-slate-700">
          <table class="table">
            <thead class="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th class="w-44">Requisition / Date</th>
                <th>Patient</th>
                <th class="hidden md:table-cell">Case</th>
                <th>Categories</th>
                <th>Items</th>
                <th class="hidden lg:table-cell">Requested by</th>
                <th class="text-center">Uncovered</th>
                <th class="text-right"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="req in eligibleList" :key="req.patient_requisition_uuid" class="hover:bg-brand-50/40">
                <td>
                  <div class="font-mono text-xs font-semibold text-slate-800 dark:text-slate-100">{{ req.requisition_number }}</div>
                  <div class="text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">{{ formatDateTime(req.requisition_date) }}</div>
                </td>
                <td class="text-sm">
                  <div class="text-slate-800 dark:text-slate-100">{{ [req.patient_first_name, req.patient_last_name].filter(Boolean).join(' ') || '—' }}</div>
                  <div class="text-[11px] font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">{{ req.patient_number || '' }}</div>
                </td>
                <td class="hidden md:table-cell text-sm text-slate-600 dark:text-slate-300">{{ req.patient_case_number || '—' }}</td>
                <td class="max-w-[16rem] text-xs text-slate-600 dark:text-slate-300" :title="req.uncovered_categories || ''">
                  <div class="line-clamp-2">{{ req.uncovered_categories || '—' }}</div>
                </td>
                <td class="max-w-[20rem] text-xs text-slate-600 dark:text-slate-300" :title="req.uncovered_items || ''">
                  <div class="line-clamp-2">{{ req.uncovered_items || '—' }}</div>
                </td>
                <td class="hidden lg:table-cell text-xs text-slate-600 dark:text-slate-300">{{ req.requested_by || '—' }}</td>
                <td class="text-center text-sm">{{ req.uncovered_count }}</td>
                <td class="text-right">
                  <button class="btn-primary py-1 text-xs" :disabled="addLoading" @click="pickRequisition(req)">Proceed →</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-else class="space-y-4">
        <div v-if="selectedRequisition" class="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 text-sm">
          <div class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <div><span class="text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Requisition:</span>
              <span class="ml-1 font-mono font-semibold">{{ selectedRequisition.requisition_number }}</span></div>
            <div><span class="text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Patient:</span>
              <span class="ml-1 font-medium">{{ [selectedRequisition.patient_first_name, selectedRequisition.patient_last_name].filter(Boolean).join(' ') || '—' }}</span>
              <span class="ml-1 text-[11px] font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">{{ selectedRequisition.patient_number }}</span></div>
            <div><span class="text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Case:</span>
              <span class="ml-1">{{ selectedRequisition.patient_case_number || '—' }}</span></div>
          </div>
        </div>
        <div v-if="addError" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ addError }}
        </div>

        <div class="rounded-md border border-brand-100 bg-brand-50/40 px-3 py-2 text-xs text-brand-800">
          Each group below becomes one lab report with its own Lab number. The default groupings follow each item category's <b>Combine in one print-out</b> setting — untick a test to move it into its own report, or uncheck all tests in a group to skip it.
        </div>

        <div v-if="!uncoveredGroups.length" class="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
          No uncovered tests on this requisition.
        </div>

        <div v-for="group in uncoveredGroups" :key="group.key"
             class="rounded-md border border-slate-200 dark:border-slate-700">
          <div class="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-3 py-2">
            <input type="checkbox"
                   :checked="isGroupAllSelected(group)"
                   :indeterminate="isGroupPartiallySelected(group)"
                   @change="toggleGroup(group)" />
            <div class="min-w-0 flex-1">
              <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {{ group.item_category_name || 'Uncategorized' }}
                <span v-if="group.combine" class="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">Combined</span>
                <span v-else class="ml-1 rounded bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-700 dark:text-slate-200">Individual</span>
              </div>
              <div class="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
                {{ groupSelectedCount(group) }} of {{ group.items.length }} selected
              </div>
            </div>
          </div>
          <div>
            <label v-for="it in group.items" :key="it.uuid"
                   class="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 px-3 py-2 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-800">
              <input type="checkbox" :checked="group.selected.has(it.uuid)" @change="toggleItem(group, it.uuid)" />
              <div class="min-w-0 flex-1">
                <div class="text-sm text-slate-800 dark:text-slate-100">{{ it.test_name }}</div>
                <div class="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
                  <span class="font-mono">{{ it.test_code }}</span>
                  <span v-if="it.result_type" class="ml-2 uppercase">· {{ it.result_type }}</span>
                </div>
              </div>
            </label>
          </div>
        </div>

        <div class="text-xs text-slate-600 dark:text-slate-300">
          Will create <b>{{ finalGroups.length }}</b> lab report{{ finalGroups.length === 1 ? '' : 's' }}.
        </div>
      </div>

      <template #footer>
        <button class="btn-secondary" :disabled="submitting" @click="showAdd = false">Cancel</button>
        <button v-if="addStep === 2" class="btn-secondary" :disabled="submitting" @click="addStep = 1">← Back</button>
        <button v-if="addStep === 2"
                class="btn-primary" :disabled="submitting || !finalGroups.length"
                @click="confirmAdd">
          {{ submitting ? 'Creating…' : `Create ${finalGroups.length} report${finalGroups.length === 1 ? '' : 's'}` }}
        </button>
      </template>
    </Modal>

    <!-- ─── Editor modal (result entry) ─── -->
    <Modal :show="showEditor" :title="`Lab Report ${editorReport?.lab_number || ''}`" size="2xl" @close="showEditor = false">
      <div v-if="editorLoading" class="p-6 text-center text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Loading…</div>
      <div v-else-if="editorError" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
        {{ editorError }}
      </div>
      <div v-else-if="editorReport" class="space-y-5">
        <div class="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 text-xs sm:text-sm">
          <div class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <div><span class="text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Patient:</span>
              <span class="ml-1 font-medium">{{ [editorReport.patient_first_name, editorReport.patient_last_name].filter(Boolean).join(' ') || '—' }}</span>
              <span class="ml-1 text-[11px] font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">{{ editorReport.patient_number }}</span>
              <span v-if="ageFromBirthdate(editorReport.patient_birthdate) !== '' || editorReport.patient_sex"
                    class="ml-2 text-slate-600 dark:text-slate-300">
                · {{ ageFromBirthdate(editorReport.patient_birthdate) !== '' ? `${ageFromBirthdate(editorReport.patient_birthdate)} y/o` : '' }}
                <span v-if="editorReport.patient_sex" class="capitalize">{{ ageFromBirthdate(editorReport.patient_birthdate) !== '' ? '· ' : '' }}{{ editorReport.patient_sex }}</span>
              </span>
            </div>
            <div><span class="text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Requisition:</span>
              <span class="ml-1 font-mono">{{ editorReport.requisition_number || '—' }}</span></div>
            <div><span class="text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Category:</span>
              <span class="ml-1">{{ editorReport.item_category_name || '—' }}</span></div>
            <div><span class="text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Status:</span>
              <span :class="statusBadge(editorReport.status).cls" class="ml-1">
                <span class="mr-1 inline-block h-1.5 w-1.5 rounded-full" :class="statusBadge(editorReport.status).dot"></span>
                {{ statusBadge(editorReport.status).text }}
              </span></div>
            <div v-if="editorReport.medtech_name"><span class="text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Medtech:</span>
              <span class="ml-1">{{ editorReport.medtech_name }}</span></div>
            <div v-if="editorReport.pathologist_name"><span class="text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Pathologist:</span>
              <span class="ml-1">{{ editorReport.pathologist_name }}</span></div>
          </div>
        </div>

        <div v-if="editorReport.status !== 'draft'"
             class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          This report is <b>{{ editorReport.status }}</b> and is read-only. To correct results, void it and re-issue.
        </div>

        <!-- Specimen collection timestamp sits above the test items so the
             operator sets it before working through results — it's the
             first piece of data on the report and gets forgotten if
             buried at the bottom. -->
        <div>
          <label class="label">Specimen collected at (Time Taken)</label>
          <input type="datetime-local" v-model="editorReport.specimen_collected_at_local"
                 :disabled="editorReport.status !== 'draft'" class="input w-full sm:w-64" />
        </div>

        <div v-for="it in editorReport.items" :key="it.uuid" class="rounded-md border border-slate-200 dark:border-slate-700">
          <div class="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-3 py-2">
            <div>
              <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">{{ it.test_name }}</div>
              <div v-if="it.method" class="text-[11px] italic text-slate-600 dark:text-slate-300">Method: {{ it.method }}</div>
              <div class="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
                <span class="font-mono">{{ it.test_code }}</span>
                <span class="ml-2 uppercase">· {{ it.result_type }}</span>
                <span v-if="it.specimen" class="ml-2">· specimen: {{ it.specimen }}</span>
              </div>
            </div>
          </div>

          <!-- single / panel — reference-range table with editable value.
               Section headers render inline when components carry a `section`
               snapshot. Unit / Reference columns drop when every row is blank
               for that field. Flag column is hidden for now. -->
          <div v-if="it.result_type === 'single' || it.result_type === 'panel'" class="p-3">
            <table class="w-full text-sm">
              <thead class="text-[11px] uppercase text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
                <tr>
                  <th class="w-1/3 text-left font-semibold">Analyte</th>
                  <th class="text-left font-semibold">Result</th>
                  <th v-if="anyUnit(it)" class="w-24 text-left font-semibold">Unit</th>
                  <th v-if="anyReference(it)" class="w-40 text-left font-semibold">Reference</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="grp in groupValuesBySection(it.values)" :key="grp.section || 'none'">
                  <tr v-if="grp.section" class="bg-slate-50 dark:bg-slate-800">
                    <td colspan="4" class="py-1 pl-2 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      {{ grp.section }}
                    </td>
                  </tr>
                  <tr v-for="v in grp.values" :key="v.uuid" class="border-t border-slate-100 dark:border-slate-800">
                    <td class="py-1.5 text-slate-800 dark:text-slate-100">
                      {{ v.component_name }}
                      <span class="ml-1 font-mono text-[10px] text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">{{ v.component_code }}</span>
                    </td>
                    <td class="py-1.5">
                      <select v-if="lookupOptions(v).length"
                              v-model="v.value_text" :disabled="editorReport.status !== 'draft'"
                              class="input w-full py-1 text-sm">
                        <option value="">—</option>
                        <option v-for="opt in lookupOptions(v)" :key="opt" :value="opt">{{ opt }}</option>
                      </select>
                      <input v-else
                             v-model="v.value_text" :disabled="editorReport.status !== 'draft'"
                             class="input w-full py-1 text-sm" placeholder="—" />
                    </td>
                    <td v-if="anyUnit(it)" class="py-1.5 text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">{{ v.unit_of_measure || '' }}</td>
                    <td v-if="anyReference(it)" class="py-1.5 text-[11px] text-slate-600 dark:text-slate-300">{{ v.reference_range || '' }}</td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>

          <!-- matrix — rows × cols grid, one editable input per cell -->
          <div v-else-if="it.result_type === 'matrix'" class="p-3 overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="text-[11px] uppercase text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
                <tr>
                  <th class="text-left font-semibold"></th>
                  <th v-for="c in buildMatrixGrid(it).cols" :key="c" class="text-left font-semibold px-2">{{ c }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in buildMatrixGrid(it).rows" :key="r" class="border-t border-slate-100 dark:border-slate-800">
                  <td class="py-1.5 pr-3 font-medium text-slate-700 dark:text-slate-200">{{ r }}</td>
                  <td v-for="c in buildMatrixGrid(it).cols" :key="c" class="py-1 px-1">
                    <input v-model="(buildMatrixGrid(it).cells.get(r+'|'+c) || {}).value_text"
                           :disabled="editorReport.status !== 'draft'"
                           class="input w-full py-1 text-sm" placeholder="—" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- narrative / culture — free-text -->
          <div v-else class="p-3">
            <textarea v-model="it.narrative_text" :disabled="editorReport.status !== 'draft'"
                      rows="6"
                      class="input w-full font-mono text-sm"
                      :placeholder="it.result_type === 'culture' ? 'Organism, growth, sensitivity…' : 'Narrative findings…'"></textarea>
          </div>
        </div>

        <div>
          <label class="label">Remarks</label>
          <textarea v-model="editorReport.remarks" :disabled="editorReport.status !== 'draft'"
                    rows="2" class="input w-full"></textarea>
        </div>
      </div>

      <template #footer>
        <button class="btn-secondary" @click="showEditor = false">Close</button>
        <button v-if="editorReport && editorReport.status === 'finalized'"
                class="btn-primary" @click="() => openPrint(editorReport)">Print</button>
        <button v-if="editorReport && editorReport.status === 'draft'"
                class="btn-secondary" :disabled="savingResults" @click="saveAndAskFinal">Tag as Final</button>
        <button v-if="editorReport && editorReport.status === 'draft'"
                class="btn-primary" :disabled="savingResults" @click="() => saveResults()">
          {{ savingResults ? 'Saving…' : 'Save Results' }}
        </button>
      </template>
    </Modal>

    <!-- ─── Confirm: Set final ─── -->
    <Modal :show="confirmFinal.show" title="Tag as Final" size="md"
           @close="resetConfirmFinal()">
      <div class="space-y-3">
        <p class="text-sm text-slate-700 dark:text-slate-200">
          Finalizing <span class="font-mono font-semibold">{{ confirmFinal.report?.lab_number }}</span> will lock it.
          To correct results later you'll need to void this report and re-issue a new one.
        </p>
        <div v-if="confirmFinal.loadingDoctor" class="text-xs italic text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Loading default signatory…</div>
        <div v-else-if="confirmFinal.defaultDoctor"
             class="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          <span class="font-semibold">Signatory (from item group):</span>
          <span class="ml-1">{{ confirmFinal.defaultDoctor.name }}</span>
          <span v-if="confirmFinal.defaultDoctor.specialty" class="ml-1 text-emerald-700">· {{ confirmFinal.defaultDoctor.specialty }}</span>
          <span v-if="confirmFinal.defaultDoctor.license_number" class="ml-1 text-emerald-700">· Lic. {{ confirmFinal.defaultDoctor.license_number }}</span>
          <div class="mt-1 text-[11px] text-emerald-700">
            Name, license, and e-signature will be snapshotted from this doctor.
          </div>
        </div>
        <div v-else class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span class="font-semibold">No default signatory</span> — this report's item group has no doctor configured.
          Enter a name manually below, or set a default in <b>Item Groups → Edit</b>.
        </div>
        <div v-if="!confirmFinal.defaultDoctor">
          <label class="label">Pathologist name (printed on final report)</label>
          <input v-model="confirmFinal.pathologist" class="input w-full" placeholder="Pathologist full name" />
        </div>

        <!-- Second-tester credential ceremony (tenant.testerSignatoryCount = 2).
             The server verifies these against a user in this tenant; the
             resolved user is snapshotted as medtech2_*. When credentials
             resolve to the same user who created the report, the report
             collapses back to a single printed signature (not an error). -->
        <div v-if="twoTesterSignatories"
             class="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-3 space-y-2">
          <div class="text-xs font-semibold text-slate-700 dark:text-slate-200">Second tester signatory</div>
          <p class="text-[11px] text-slate-600 dark:text-slate-300">
            Enter another lab user's credentials to sign as the finalizer.
            If it's the same user who created the report, only one signature will print.
          </p>
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label class="label">Username</label>
              <input v-model="confirmFinal.signatoryUsername" type="text" class="input w-full" autocomplete="off" />
            </div>
            <div>
              <label class="label">Password</label>
              <input v-model="confirmFinal.signatoryPassword" type="password" class="input w-full" autocomplete="off"
                     @keydown.enter.prevent="doSetFinal" />
            </div>
          </div>
        </div>

        <div v-if="confirmFinal.authError" class="text-xs text-red-700">{{ confirmFinal.authError }}</div>
      </div>
      <template #footer>
        <button class="btn-secondary" :disabled="confirmFinal.submitting" @click="resetConfirmFinal()">Cancel</button>
        <button class="btn-primary"
                :disabled="!(confirmFinal.defaultDoctor || confirmFinal.pathologist.trim())
                           || confirmFinal.submitting
                           || (twoTesterSignatories && (!confirmFinal.signatoryUsername || !confirmFinal.signatoryPassword))"
                @click="doSetFinal">
          {{ confirmFinal.submitting ? 'Verifying…' : 'Tag as Final' }}
        </button>
      </template>
    </Modal>

    <!-- ─── Confirm: Void ─── -->
    <Modal :show="confirmVoid.show" title="Void lab report" size="md"
           @close="confirmVoid = { show: false, report: null, reason: '', username: '', password: '', authError: '', verifying: false }">
      <div class="space-y-3">
        <p class="text-sm text-slate-700 dark:text-slate-200">
          Voiding <span class="font-mono font-semibold">{{ confirmVoid.report?.lab_number }}</span> keeps the record for
          audit but releases the requisition items so you can re-issue a new lab report for them.
        </p>
        <div>
          <label class="label">Reason (required)</label>
          <textarea v-model="confirmVoid.reason" rows="3" class="input w-full"
                    placeholder="e.g. wrong panel encoded, specimen recollected, …"></textarea>
        </div>
        <div class="rounded-md border border-amber-200 bg-amber-50 p-3">
          <div class="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-800">
            Supervisor approval required
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="label">Username</label>
              <input v-model="confirmVoid.username" type="text" class="input w-full" autocomplete="off" />
            </div>
            <div>
              <label class="label">Password</label>
              <input v-model="confirmVoid.password" type="password" class="input w-full" autocomplete="off"
                     @keydown.enter.prevent="doVoid" />
            </div>
          </div>
          <div v-if="confirmVoid.authError" class="mt-2 text-xs text-red-700">{{ confirmVoid.authError }}</div>
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary"
                @click="confirmVoid = { show: false, report: null, reason: '', username: '', password: '', authError: '', verifying: false }">Cancel</button>
        <button class="btn-danger"
                :disabled="!confirmVoid.reason.trim() || !confirmVoid.password || confirmVoid.verifying"
                @click="doVoid">
          {{ confirmVoid.verifying ? 'Verifying…' : 'Void' }}
        </button>
      </template>
    </Modal>

    <Modal :show="confirmUnsetFinal.show" title="Untag as Final" size="md"
           @close="confirmUnsetFinal = { show: false, report: null, username: '', password: '', authError: '', verifying: false }">
      <div class="space-y-3">
        <p class="text-sm text-slate-700 dark:text-slate-200">
          Reopening <span class="font-mono font-semibold">{{ confirmUnsetFinal.report?.lab_number }}</span>
          will move it back to <span class="font-semibold text-amber-700">draft</span> so you can amend the results.
          The pathologist signature will be cleared and you'll need to Tag as Final again after editing.
        </p>
        <div class="rounded-md border border-amber-200 bg-amber-50 p-3">
          <div class="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-800">
            Supervisor approval required
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="label">Username</label>
              <input v-model="confirmUnsetFinal.username" type="text" class="input w-full" autocomplete="off" />
            </div>
            <div>
              <label class="label">Password</label>
              <input v-model="confirmUnsetFinal.password" type="password" class="input w-full" autocomplete="off"
                     @keydown.enter.prevent="doUnsetFinal" />
            </div>
          </div>
          <div v-if="confirmUnsetFinal.authError" class="mt-2 text-xs text-red-700">{{ confirmUnsetFinal.authError }}</div>
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary"
                @click="confirmUnsetFinal = { show: false, report: null, username: '', password: '', authError: '', verifying: false }">Cancel</button>
        <button class="btn-primary"
                :disabled="!confirmUnsetFinal.password || confirmUnsetFinal.verifying"
                @click="doUnsetFinal">
          {{ confirmUnsetFinal.verifying ? 'Verifying…' : 'Reopen to draft' }}
        </button>
      </template>
    </Modal>

    <!-- ─── Print preview (draft w/ watermark, final w/ signatures) ─── -->
    <Modal :show="showPrint" :title="`Print Preview — ${printReport?.lab_number || ''}`" size="2xl"
           @close="showPrint = false">
      <div v-if="printLoading" class="p-6 text-center text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Loading…</div>
      <div v-else-if="!printReport" class="p-6 text-center text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
        No report loaded. Close and try again.
      </div>
      <template v-else>
        <!-- Paper-size note. The predictor measures the rendered content at
             the configured paper's width and recommends a larger size when
             the content would overflow. Operator picks which one to print. -->
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
      <!-- Print block lives in a shared component so TestItemsView's "Print
           Preview" renders the identical template. The `lab-print-area` /
           `lab-print-header` / `lab-print-body` IDs live inside the component
           and are still scraped by doPrint() below.
           Wrapped in a scale frame: inner renders at true paper width so the
           preview matches the printed page exactly; on narrow modal widths
           (phones) CSS transform shrinks the whole page to fit — instead of
           letting Tailwind flex/grid classes collapse into a mobile layout. -->
      <div :ref="setPreviewFrame">
        <!-- Middle box hugs the scaled sheet's real footprint so mx-auto
             actually centers the paper — otherwise the outer container
             stretches full modal-width and the transformed inner sits
             pinned to top-left, leaving dead space on wide screens. -->
        <div class="mx-auto overflow-hidden"
             :style="`width: ${previewFrameWidthPx}px; height: ${previewFrameHeightPx}px;`">
          <div :ref="setPreviewContent"
               :style="`width: ${previewPaperPx.w}px;
                        transform: scale(${previewScale});
                        transform-origin: top left;`">
            <LabReportPrintable :report="printReport" :tenant="tenant.current"
                                :qr-data-url="qrDataUrl"
                                :paper-height="previewPaperPx.h" />
          </div>
        </div>
      </div>
      </template>
      <template #footer>
        <button class="btn-secondary" @click="showPrint = false">Close</button>
        <button class="btn-primary" @click="doPrint">Print</button>
      </template>
    </Modal>
  </div>
</template>

