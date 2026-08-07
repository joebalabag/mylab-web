<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useTestItemsStore } from '../stores/testItems'
import { useItemCategoriesStore } from '../stores/itemCategories'
import { useItemGroupsStore } from '../stores/itemGroups'
import { useAuthStore } from '../stores/auth'
import { useTenantStore } from '../stores/tenant'
import Modal from '../components/Modal.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import EmptyState from '../components/EmptyState.vue'
import SkeletonRows from '../components/SkeletonRows.vue'
import RowActionMenu from '../components/RowActionMenu.vue'
import MobileFilterBar from '../components/MobileFilterBar.vue'
import LabReportPrintable from '../components/LabReportPrintable.vue'
import { money, formatDateTime, formatDate } from '../utils/format'
import { RESULT_TYPES, RESULT_TYPE_LABELS, viewTestItem, syncTestItemComponents, listTestItems } from '../api/testItems'

const tests      = useTestItemsStore()
const categories = useItemCategoriesStore()
const groups     = useItemGroupsStore()
const auth       = useAuthStore()
const tenant     = useTenantStore()

const search       = ref('')
const groupFilter  = ref('')
const catFilter    = ref('')
const typeFilter   = ref('')
const statusFilter = ref('')
const listError    = ref('')

async function loadDependencies() {
  try {
    await Promise.all([
      groups.fetch({ page_number: 0, page_size: 500 }),
      categories.fetch({ page_number: 0, page_size: 1000 })
    ])
  } catch (e) {
    // Non-fatal
    // eslint-disable-next-line no-console
    console.warn('Failed to preload groups/categories', e)
  }
}

async function loadTests() {
  listError.value = ''
  tests.setFilters({
    tenant_uuid:        auth.tenantUuid || '',
    item_group_uuid:    groupFilter.value || '',
    item_category_uuid: catFilter.value || '',
    result_type:        typeFilter.value || '',
    keywords:           search.value.trim(),
    status:             statusFilter.value ? [statusFilter.value] : []
  })
  try {
    await tests.fetch()
  } catch (e) {
    listError.value = e?.message || 'Failed to load test items'
  }
}
onMounted(async () => {
  await loadDependencies()
  await loadTests()
})

function onSearchEnter()  { loadTests() }
function onFilterChange() { loadTests() }

// If the user picks a group, clear the category filter so we don't leave a
// mismatched combo (category not in the newly-chosen group).
watch(groupFilter, () => { catFilter.value = '' })

const filtered    = computed(() => tests.items)
const totalCount  = computed(() => tests.total || tests.items.length)
const activeCount = computed(() => tests.items.filter(t => t.status === 'active').length)

const activeGroups = computed(() => groups.items.filter(g => g.status === 'active'))
const activeCategories = computed(() => categories.items.filter(c => c.status === 'active'))
// Categories available in the current group filter (or all when group filter is empty).
const filteredActiveCategories = computed(() =>
  groupFilter.value
    ? activeCategories.value.filter(c => c.item_group_uuid === groupFilter.value)
    : activeCategories.value
)
// Categories the form picker offers — driven by the group chosen inside the form.
const formGroupCategories = computed(() =>
  form.value.item_group_uuid
    ? activeCategories.value.filter(c => c.item_group_uuid === form.value.item_group_uuid)
    : activeCategories.value
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

// ─── Add / Edit ───
const showForm = ref(false)
const editing  = ref(null)
const emptyForm = () => ({
  item_group_uuid: '',       // UI convenience — narrows the category picker
  item_category_uuid: '',
  code: '',
  name: '',
  result_type: 'single',
  specimen: '',
  unit_of_measure: '',
  reference_range: '',
  method: '',
  lookup_values: '',
  matrix_rows: '',           // comma-separated for matrix type
  matrix_cols: '',           // comma-separated for matrix type
  price: 0,
  description: ''
})
const form = ref(emptyForm())
const formError = ref('')
const submitting = ref(false)

// Components (sub-analytes) fetched fresh when opening an existing item's
// edit modal. Server-authoritative — we don't cache them in the list because
// only the /view endpoint eager-loads them. Rows without a `uuid` are new;
// the sync endpoint assigns one on save. `display_order` is reindexed at
// submit time from the array position so drag/up-down reorders are cheap.
const components = ref([])
const componentsLoading = ref(false)
const componentsError = ref('')

function emptyComponentRow() {
  return { uuid: null, code: '', name: '', unit_of_measure: '', reference_range: '', lookup_values: '', section: '' }
}
function removeComponentRow(i) {
  components.value = components.value.filter((_, idx) => idx !== i)
}
function moveComponentRow(i, delta) {
  const next = i + delta
  if (next < 0 || next >= components.value.length) return
  const arr = [...components.value]
  const [row] = arr.splice(i, 1)
  arr.splice(next, 0, row)
  components.value = arr
}

// Nested modal — editing a single component row with full-width fields.
// editingComponent = null → the modal is closed. editingIndex = -1 → adding
// a new row; >= 0 → editing components[editingIndex] in place. componentDraft
// holds the working copy so Cancel discards without touching the parent form.
const showComponentModal = ref(false)
const editingIndex = ref(-1)
const componentDraft = ref(emptyComponentRow())
const componentModalError = ref('')

function openAddComponent() {
  editingIndex.value = -1
  componentDraft.value = emptyComponentRow()
  componentModalError.value = ''
  showComponentModal.value = true
}
function openEditComponent(i) {
  editingIndex.value = i
  componentDraft.value = { ...components.value[i] }
  componentModalError.value = ''
  showComponentModal.value = true
}
function saveComponentDraft() {
  const c = componentDraft.value
  const code = String(c.code || '').trim()
  const name = String(c.name || '').trim()
  if (!code || !name) {
    componentModalError.value = 'Code and Name are required.'
    return
  }
  const normalized = {
    uuid: c.uuid || null,
    code,
    name,
    unit_of_measure:  String(c.unit_of_measure  || '').trim(),
    reference_range:  String(c.reference_range  || '').trim(),
    lookup_values:    String(c.lookup_values    || '').trim(),
    section:          String(c.section          || '').trim(),
  }
  if (editingIndex.value === -1) {
    components.value = [...components.value, normalized]
  } else {
    const arr = [...components.value]
    arr[editingIndex.value] = normalized
    components.value = arr
  }
  showComponentModal.value = false
}

// Reset category when the user changes the group inside the form. The
// suppression flag guards against clobbering programmatic form population
// in openAdd / openEdit (where we set both fields in one go — the watch
// would otherwise fire on the next tick and nuke the just-set category).
const suppressGroupWatch = ref(false)
watch(() => form.value.item_group_uuid, (val, old) => {
  if (suppressGroupWatch.value) return
  if (val !== old) form.value.item_category_uuid = ''
})

function categoryGroupUuid(uuid) {
  const c = categories.items.find(x => x.uuid === uuid)
  return c?.item_group_uuid || ''
}

function openAdd() {
  editing.value = null
  suppressGroupWatch.value = true
  form.value = emptyForm()
  components.value = []
  if (groupFilter.value) form.value.item_group_uuid = groupFilter.value
  if (catFilter.value) {
    form.value.item_group_uuid = categoryGroupUuid(catFilter.value) || form.value.item_group_uuid
    form.value.item_category_uuid = catFilter.value
  }
  formError.value = ''
  showForm.value = true
  nextTick(() => { suppressGroupWatch.value = false })
}
async function openEdit(t) {
  editing.value = t
  suppressGroupWatch.value = true
  form.value = {
    item_group_uuid: categoryGroupUuid(t.item_category_uuid),
    item_category_uuid: t.item_category_uuid || '',
    code: t.code || '',
    name: t.name || '',
    result_type: t.result_type || 'single',
    specimen: t.specimen || '',
    unit_of_measure: t.unit_of_measure || '',
    reference_range: t.reference_range || '',
    method: t.method || '',
    lookup_values: t.lookup_values || '',
    matrix_rows: Array.isArray(t.matrix_config?.rows) ? t.matrix_config.rows.join(', ') : '',
    matrix_cols: Array.isArray(t.matrix_config?.cols) ? t.matrix_config.cols.join(', ') : '',
    price: Number(t.price ?? 0),
    description: t.description || ''
  }
  components.value = []
  formError.value = ''
  showForm.value = true
  // Let the group watch fire (and no-op due to the flag), then restore so
  // user-driven group changes reset the category again.
  await nextTick()
  suppressGroupWatch.value = false
  // Pull the full record so we get the eager-loaded components array. The
  // list endpoint doesn't include components — only /view/:uuid does.
  componentsLoading.value = true
  try {
    const full = await viewTestItem(t.uuid)
    components.value = Array.isArray(full?.components) ? full.components : []
  } catch (e) {
    // Non-fatal — leave the section empty and log for triage.
    // eslint-disable-next-line no-console
    console.warn('Failed to load components', e)
  } finally {
    componentsLoading.value = false
  }
}

// UI hints — for 'single' we surface unit + reference range; for others we
// hide them (kept in state so re-opening the form on a switched type keeps
// prior values). Panel/narrative/culture use their own renderers so those
// fields are meaningless at the item level.
const showSingleFields = computed(() => form.value.result_type === 'single')

async function submit() {
  formError.value = ''
  componentsError.value = ''
  const cat  = form.value.item_category_uuid
  const code = form.value.code.trim().toUpperCase()
  const name = form.value.name.trim()
  if (!cat)  { formError.value = 'Item category is required'; return }
  if (!code) { formError.value = 'Code is required'; return }
  if (!name) { formError.value = 'Name is required'; return }

  // Validate components upfront so we don't half-save the parent then bail.
  // Only panels care — other result types ignore whatever is in the array.
  if (form.value.result_type === 'panel') {
    for (let i = 0; i < components.value.length; i++) {
      const c = components.value[i]
      if (!String(c.code || '').trim() || !String(c.name || '').trim()) {
        componentsError.value = `Component #${i + 1}: code and name are required`
        return
      }
    }
    // Duplicate-code check inside the panel.
    const codes = components.value.map((c) => String(c.code).trim().toUpperCase())
    const dup = codes.find((c, i) => codes.indexOf(c) !== i)
    if (dup) {
      componentsError.value = `Duplicate component code: ${dup}`
      return
    }
  }

  // Clearable string fields are sent as `null` (not `undefined`) so JSON.stringify
  // includes the key. Sending `undefined` drops the key and the server-side
  // PATCH leaves the previous value untouched — which is why cleared fields
  // like reference_range weren't saving.
  // Build the matrix config from the two comma-separated inputs; empty on
  // both sides = null so the server doesn't seed any cells.
  const parseCsv = (s) => String(s || '').split(',').map(x => x.trim()).filter(Boolean)
  const mRows = parseCsv(form.value.matrix_rows)
  const mCols = parseCsv(form.value.matrix_cols)
  const matrixCfg = form.value.result_type === 'matrix' && mRows.length && mCols.length
    ? { rows: mRows, cols: mCols }
    : null

  const payload = {
    item_category_uuid: cat,
    code, name,
    result_type: form.value.result_type,
    specimen: form.value.specimen.trim() || null,
    unit_of_measure: showSingleFields.value ? (form.value.unit_of_measure.trim() || null) : null,
    reference_range: showSingleFields.value ? (form.value.reference_range.trim() || null) : null,
    method: form.value.method.trim() || null,
    lookup_values: showSingleFields.value ? (form.value.lookup_values.trim() || null) : null,
    matrix_config: matrixCfg,
    price: Number(form.value.price) || 0,
    description: form.value.description.trim() || null
  }

  // Build the component payload once — used by both create and update paths.
  // Rows without a uuid become inserts; the array position becomes display_order.
  const buildComponentsPayload = () =>
    components.value.map((c, idx) => ({
      uuid: c.uuid || undefined,
      code: String(c.code).trim().toUpperCase(),
      name: String(c.name).trim(),
      unit_of_measure: String(c.unit_of_measure || '').trim() || null,
      reference_range: String(c.reference_range || '').trim() || null,
      lookup_values: String(c.lookup_values || '').trim() || null,
      section: String(c.section || '').trim() || null,
      display_order: idx,
    }))

  submitting.value = true
  try {
    let targetUuid = editing.value?.uuid
    if (editing.value) {
      await tests.update(editing.value.uuid, payload)
      flash(`Updated ${code}`)
    } else {
      const created = await tests.create({
        tenant_uuid: auth.tenantUuid || undefined,
        ...payload
      })
      targetUuid = created?.uuid
      flash(`Created ${created?.code || code}`)
    }

    // Sync components AFTER the parent lands so a fresh Add already has a
    // uuid to attach to. On Edit we always sync so demoting panel→single
    // wipes leftover components; on Add we only sync when the user actually
    // authored some rows (nothing to delete on a fresh non-panel Add).
    if (targetUuid && (editing.value || components.value.length > 0)) {
      await syncTestItemComponents(targetUuid, buildComponentsPayload())
    }

    showForm.value = false
    await loadTests()
  } catch (e) {
    formError.value = e?.message || 'Failed to save test item'
  } finally {
    submitting.value = false
  }
}

// ─── View (read-only detail modal) ───
const showView = ref(false)
const viewing = ref(null)
const viewComponents = ref([])
const viewLoading = ref(false)
async function openView(t) {
  viewing.value = t
  viewComponents.value = []
  showView.value = true
  viewLoading.value = true
  try {
    const full = await viewTestItem(t.uuid)
    if (full) {
      viewing.value = full
      viewComponents.value = Array.isArray(full.components) ? full.components : []
    }
  } catch (e) {
    // Non-fatal — modal still opens with the row's summary data.
    // eslint-disable-next-line no-console
    console.warn('Failed to load full test item', e)
  } finally {
    viewLoading.value = false
  }
}
function closeView() {
  showView.value = false
  viewing.value = null
  viewComponents.value = []
}
function switchToEdit() {
  const t = viewing.value
  closeView()
  if (t) openEdit(t)
}
function resultTypeLabel(rt) {
  return RESULT_TYPE_LABELS[rt] || rt || '—'
}

// ─── Delete ───
const confirmDelete = ref({ show: false, test: null })
function askDelete(t) { confirmDelete.value = { show: true, test: t } }
async function doDelete() {
  const t = confirmDelete.value.test
  confirmDelete.value = { show: false, test: null }
  try {
    await tests.remove(t.uuid)
    flash(`Deleted ${t.code}`)
  } catch (e) {
    flashError(e, 'Failed to delete test item')
  }
}

// ─── Activate / Deactivate ───
const confirmStatus = ref({ show: false, test: null, next: '' })
function askToggleStatus(t) {
  const next = t.status === 'active' ? 'inactive' : 'active'
  confirmStatus.value = { show: true, test: t, next }
}
async function doToggleStatus() {
  const { test, next } = confirmStatus.value
  confirmStatus.value = { show: false, test: null, next: '' }
  try {
    await tests.setStatus(test.uuid, next)
    flash(`${test.code} is now ${next}`)
  } catch (e) {
    flashError(e, 'Failed to update status')
  }
}

// ─── Row menu ───
function actionsFor(t) {
  const isActive = t.status === 'active'
  return [
    { label: 'View test item', icon: 'eye', onClick: () => openView(t) },
    { label: 'Edit test item', icon: 'edit', onClick: () => openEdit(t) },
    { label: 'Print Preview', icon: 'eye', onClick: () => openPrintPreview(t) },
    { label: isActive ? 'Deactivate' : 'Activate',
      icon:  isActive ? 'deactivate' : 'activate',
      variant: isActive ? 'danger' : 'success',
      onClick: () => askToggleStatus(t) },
    { divider: true },
    { label: 'Delete test item', icon: 'trash', variant: 'danger', onClick: () => askDelete(t) }
  ]
}

// ═══════════════════════════════════════════════════════════════════════════
// PRINT PREVIEW — renders a mock lab report so operators can see what a
// test item will look like on the printout without creating a real report.
// Supports adding more items (from the same or another category) to preview
// a combined result page.
// ═══════════════════════════════════════════════════════════════════════════
const showPrint = ref(false)
const printItems = ref([])       // Array<full test-item objects (with components + matrix_config)>
const printLoading = ref(false)
const printError = ref('')

// "Add another test" picker state.
const addPickerOpen = ref(false)
const addSearch = ref('')
const addResults = ref([])
const addSearching = ref(false)

async function openPrintPreview(t) {
  printError.value = ''
  printItems.value = []
  addPickerOpen.value = false
  addSearch.value = ''
  addResults.value = []
  showPrint.value = true
  printLoading.value = true
  try {
    const full = await viewTestItem(t.uuid)
    printItems.value = [full || t]
  } catch (e) {
    printError.value = e?.message || 'Failed to load test item for preview'
  } finally {
    printLoading.value = false
  }
}

function closePrint() {
  showPrint.value = false
  printItems.value = []
  addPickerOpen.value = false
  addResults.value = []
}

async function runAddSearch() {
  addSearching.value = true
  try {
    // Real lab reports are scoped to ONE category — so only items in the
    // same category as the primary (first) preview item can be added.
    // Backend filter narrows the result set; belt-and-suspenders client-side
    // check below guards against any stale rows the server might send.
    const primaryCatUuid = printItems.value[0]?.item_category_uuid || undefined
    const res = await listTestItems({
      tenant_uuid: auth.tenantUuid || undefined,
      item_category_uuid: primaryCatUuid,
      keywords: addSearch.value.trim() || undefined,
      status: ['active'],
      page_number: 0,
      page_size: 0,
    })
    const rows = Array.isArray(res?.results) ? res.results : []
    // Hide items already in the preview list; extra category filter as a
    // safety net for older backends that ignore the query param.
    const inPreview = new Set(printItems.value.map(i => i.uuid))
    addResults.value = rows.filter(r =>
      !inPreview.has(r.uuid) &&
      (!primaryCatUuid || r.item_category_uuid === primaryCatUuid)
    )
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Add-picker search failed', e)
    addResults.value = []
  } finally {
    addSearching.value = false
  }
}

async function addPrintItem(t) {
  try {
    const full = await viewTestItem(t.uuid)
    printItems.value = [...printItems.value, full || t]
    addResults.value = addResults.value.filter(r => r.uuid !== t.uuid)
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Failed to load added item', e)
  }
}
function removePrintItem(uuid) {
  printItems.value = printItems.value.filter(i => i.uuid !== uuid)
}

// ─── Sample-value helpers ────────────────────────────────────────────────
// The preview needs plausible-looking result cells. For panel components we
// use the first token of `lookup_values` (typically the "normal" option), or
// synthesize a numeric value from the reference-range midpoint. Narratives
// get a canned paragraph so the layout isn't empty.
const SAMPLE_NARRATIVE = 'Sample narrative report — the finalized report will render the actual observations, findings, and impression typed by the pathologist / medtech here.'
const SAMPLE_CULTURE   = 'No growth after 48 hours of incubation.'

function sampleFor(row) {
  if (row?.lookup_values) {
    const first = String(row.lookup_values).split(',')[0]
    if (first) return first.trim()
  }
  const range = String(row?.reference_range || '')
  const m = range.match(/(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)/)
  if (m) {
    const lo = Number(m[1]), hi = Number(m[2])
    return String(Math.round(((lo + hi) / 2) * 10) / 10)
  }
  const m2 = range.match(/up to\s*(\d+(?:\.\d+)?)/i)
  if (m2) return String(Math.round(Number(m2[1]) * 0.8 * 10) / 10)
  return 'SAMPLE'
}

// Convert a test-item template into the `report.items[]` shape that
// LabReportPrintable expects. Components/matrix cells become value rows
// with synthesized sample values; narrative/culture rows carry canned text.
function templateToReportItem(t) {
  const base = {
    uuid: t.uuid,
    test_code: t.code,
    test_name: t.name,
    method: t.method || '',
    specimen: t.specimen || '',
    result_type: t.result_type,
    values: [],
    matrix_config: t.matrix_config || null,
    narrative_text: '',
  }
  if (t.result_type === 'single') {
    base.values = [{
      uuid: `${t.uuid}-v0`,
      component_code: t.code,
      component_name: t.name,
      value_text: sampleFor(t),
      unit_of_measure: t.unit_of_measure || '',
      reference_range: t.reference_range || '',
      section: '',
    }]
  } else if (t.result_type === 'panel') {
    base.values = (t.components || []).map((c, i) => ({
      uuid: `${t.uuid}-v${i}`,
      component_code: c.code || `${t.code}-${i}`,
      component_name: c.name,
      value_text: sampleFor(c),
      unit_of_measure: c.unit_of_measure || '',
      reference_range: c.reference_range || '',
      section: c.section || '',
    }))
  } else if (t.result_type === 'matrix') {
    const cfg = t.matrix_config || { rows: [], cols: [] }
    const rows = Array.isArray(cfg.rows) ? cfg.rows : []
    const cols = Array.isArray(cfg.cols) ? cfg.cols : []
    for (const r of rows) for (const c of cols) {
      base.values.push({
        uuid: `${t.uuid}-${r}-${c}`,
        component_code: `${r}|${c}`,
        component_name: `${r} / ${c}`,
        value_text: 'SAMPLE',
        unit_of_measure: '',
        reference_range: '',
        section: '',
        matrix_row: r,
        matrix_col: c,
      })
    }
  } else if (t.result_type === 'culture') {
    base.narrative_text = SAMPLE_CULTURE
  } else {
    base.narrative_text = SAMPLE_NARRATIVE
  }
  return base
}

// Real lab reports are category-scoped — one report per category. When the
// user tacks on items from a different category we still render all of them
// under the FIRST item's category banner (with an amber note in the toolbar).
// The category color / print title come off the first item's joined data.
const previewReport = computed(() => {
  if (!printItems.value.length) return null
  const first = printItems.value[0]
  const now = new Date().toISOString()
  return {
    uuid: 'preview',
    status: 'draft',
    lab_number: 'L-PREVIEW-000001',
    patient_first_name: 'Juan A.',
    patient_last_name: 'Dela Cruz',
    patient_birthdate: '1990-04-12',
    patient_sex: 'male',
    patient_number: 'MRN-000123',
    patient_case_number: 'C-2026-000456',
    requisition_number: 'R-2026-000789',
    specimen_collected_at: now,
    created_at: now,
    finalized_at: null,
    remarks: '',
    // Category snapshot fields — same shape LabReportPrintable reads.
    item_category_uuid: first.item_category_uuid || null,
    item_category_name: first.item_category_name || first.category_name || 'Uncategorized',
    item_category_print_title: first.item_category_print_title || '',
    item_category_color: first.item_category_color || '#64748b',
    item_category_print_paper_size: first.item_category_print_paper_size || 'letter',
    item_group_tester_role: first.item_group_tester_role || 'Medical Technologist',
    // Signatory fields — left blank because status is 'draft', so the
    // printable renders empty signature lines (matches unsigned state).
    medtech_name: '',
    medtech_license: '',
    pathologist_name: '',
    pathologist_license: '',
    pathologist_esignature_image: '',
    items: printItems.value.map(templateToReportItem),
  }
})

// Print the preview: use window.print() with a scoped print stylesheet that
// only surfaces the .print-preview-sheet element. Cheaper than a new-window
// popup and preserves the exact styling the user just previewed.
async function doPrintPreview() {
  await nextTick()
  window.print()
}

function typeBadgeClass(t) {
  switch (t) {
    case 'single':    return 'bg-emerald-100 text-emerald-700'
    case 'panel':     return 'bg-brand-100 text-brand-700'
    case 'narrative': return 'bg-amber-100 text-amber-700'
    case 'culture':   return 'bg-fuchsia-100 text-fuchsia-700'
    default:          return 'bg-slate-100 text-slate-700'
  }
}
</script>

<template>
  <div class="flex h-full flex-col gap-4">
    <div class="grid grid-cols-2 gap-3 shrink-0">
      <div class="card"><div class="card-body">
        <div class="text-xs font-semibold uppercase text-slate-500">Total Test Items</div>
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
          <div class="text-sm font-semibold text-slate-800">Test Items</div>
          <div class="text-xs text-slate-500">
            {{ filtered.length }} shown
            <span v-if="tests.loading" class="ml-1 text-brand-600">· loading…</span>
          </div>
        </div>
        <MobileFilterBar>
          <input
            v-model="search"
            @keyup.enter="onSearchEnter"
            placeholder="Search code, name, group, or category… (Enter)"
            class="input w-full sm:w-64"
          />
          <select v-model="groupFilter" @change="onFilterChange" class="input w-full sm:w-44">
            <option value="">All item groups</option>
            <option v-for="g in activeGroups" :key="g.uuid" :value="g.uuid">{{ g.code }} · {{ g.name }}</option>
          </select>
          <select v-model="catFilter" @change="onFilterChange" class="input w-full sm:w-56">
            <option value="">All categories</option>
            <option v-for="c in filteredActiveCategories" :key="c.uuid" :value="c.uuid">{{ c.code }} · {{ c.name }}</option>
          </select>
          <select v-model="typeFilter" @change="onFilterChange" class="input w-full sm:w-40">
            <option value="">All result types</option>
            <option v-for="t in RESULT_TYPES" :key="t" :value="t">{{ RESULT_TYPE_LABELS[t] }}</option>
          </select>
          <select v-model="statusFilter" @change="onFilterChange" class="input w-full sm:w-36">
            <option value="">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <button class="btn-secondary" @click="loadTests" :disabled="tests.loading" title="Refresh">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
          </button>
          <template #action>
            <button class="btn-primary" :disabled="!activeCategories.length" @click="openAdd">+ Add Test Item</button>
          </template>
        </MobileFilterBar>
      </div>

      <div v-if="!activeCategories.length && !categories.loading"
           class="border-t border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
        No active item categories yet — create one under <b>Item Categories</b> before adding test items.
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
          v-if="tests.loading && !tests.items.length"
          :rows="8"
          label="Loading test items…"
          :columns="['bar','lines','lines','pill','pill','bar','dot']"
        />
        <table class="table" v-else-if="filtered.length">
          <thead class="sticky top-0 z-10 bg-slate-50 shadow-[inset_0_-1px_0_theme(colors.slate.100)]">
            <tr>
              <th class="w-24">Code</th>
              <th>Name</th>
              <th>Category</th>
              <th>Result type</th>
              <th>Specimen / Modality</th>
              <th class="text-right">Price</th>
              <th>Status</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in filtered" :key="t.uuid" :class="t.status !== 'active' && 'bg-slate-50/50'">
              <td class="font-mono text-xs font-semibold">
                <button type="button"
                        class="text-brand-600 hover:text-brand-800 hover:underline"
                        @click="openView(t)"
                        :title="`View ${t.code}`">{{ t.code }}</button>
              </td>
              <td>
                <span class="font-medium text-slate-800">{{ t.name }}</span>
                <div v-if="t.reference_range" class="text-[11px] text-slate-500">Ref: {{ t.reference_range }}</div>
                <div v-if="t.status !== 'active'" class="text-[10px] font-semibold uppercase tracking-wider text-rose-600">
                  Hidden
                </div>
              </td>
              <td>
                <div class="text-sm text-slate-700">{{ t.item_category_name || '—' }}</div>
                <div class="text-[11px] text-slate-500">{{ t.item_group_name || '' }}</div>
              </td>
              <td>
                <span class="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                      :class="typeBadgeClass(t.result_type)">
                  {{ t.result_type }}
                </span>
              </td>
              <td class="text-sm text-slate-600">
                {{ t.specimen || '—' }}
                <span v-if="t.unit_of_measure" class="ml-1 text-[11px] text-slate-400">· {{ t.unit_of_measure }}</span>
              </td>
              <td class="text-right font-semibold">{{ money(t.price) }}</td>
              <td>
                <span class="badge" :class="t.status === 'active' ? 'badge-success' : 'badge-danger'">
                  <span class="mr-1 inline-block h-1.5 w-1.5 rounded-full"
                        :class="t.status === 'active' ? 'bg-emerald-500' : 'bg-rose-500'"></span>
                  {{ t.status === 'active' ? 'Active' : 'Inactive' }}
                </span>
              </td>
              <td class="text-right">
                <RowActionMenu :actions="actionsFor(t)" />
              </td>
            </tr>
          </tbody>
        </table>
        <EmptyState v-else-if="!tests.loading" title="No test items" message="Add a test item under one of your categories." />
      </div>
    </div>

    <!-- View (read-only) modal. Opened via row-menu "View" or by clicking
         the code in the table. Shares the /view endpoint with the edit
         modal so components come along automatically. -->
    <Modal :show="showView" :title="'View Test Item'" size="lg" @close="closeView">
      <div v-if="viewing" class="space-y-4">
        <!-- Header block: name + category badge + status -->
        <div class="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-700">{{ viewing.code }}</span>
              <span class="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                    :class="typeBadgeClass(viewing.result_type)">
                {{ viewing.result_type }}
              </span>
              <span class="badge" :class="viewing.status === 'active' ? 'badge-success' : 'badge-danger'">
                <span class="mr-1 inline-block h-1.5 w-1.5 rounded-full"
                      :class="viewing.status === 'active' ? 'bg-emerald-500' : 'bg-rose-500'"></span>
                {{ viewing.status === 'active' ? 'Active' : 'Inactive' }}
              </span>
            </div>
            <h3 class="mt-1 text-lg font-bold text-slate-800">{{ viewing.name }}</h3>
            <div class="mt-0.5 text-xs text-slate-500">
              <span v-if="viewing.item_group_name">{{ viewing.item_group_name }} · </span>
              <span>{{ viewing.item_category_name || '—' }}</span>
            </div>
          </div>
          <div class="text-right">
            <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Price</div>
            <div class="text-xl font-bold text-slate-800">{{ money(viewing.price) }}</div>
          </div>
        </div>

        <!-- Detail grid -->
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Result Type</div>
            <div class="mt-0.5 text-sm text-slate-800">{{ resultTypeLabel(viewing.result_type) }}</div>
          </div>
          <div>
            <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Specimen / Modality</div>
            <div class="mt-0.5 text-sm text-slate-800">{{ viewing.specimen || '—' }}</div>
          </div>
          <div>
            <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Unit of Measure</div>
            <div class="mt-0.5 text-sm text-slate-800">{{ viewing.unit_of_measure || '—' }}</div>
          </div>
          <div class="sm:col-span-2">
            <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Reference Range</div>
            <div class="mt-0.5 text-sm text-slate-800">{{ viewing.reference_range || '—' }}</div>
          </div>
          <div>
            <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Created</div>
            <div class="mt-0.5 text-xs text-slate-600">{{ formatDateTime(viewing.created_at) }}</div>
            <div v-if="viewing.created_by" class="text-[11px] text-slate-500">by {{ viewing.created_by }}</div>
          </div>
        </div>

        <div v-if="viewing.description">
          <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Description</div>
          <p class="mt-0.5 whitespace-pre-line text-sm text-slate-700">{{ viewing.description }}</p>
        </div>

        <!-- Components — panel-only, mirrors the edit-modal layout so users see
             the same table shape whether they're viewing or editing. -->
        <div v-if="viewing.result_type === 'panel'"
             class="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
          <div class="mb-2 flex items-center justify-between">
            <div class="text-xs font-bold uppercase tracking-widest text-slate-500">
              Components ({{ viewComponents.length }})
            </div>
            <span v-if="viewLoading" class="text-[11px] text-brand-600">Loading…</span>
          </div>

          <div v-if="!viewLoading && !viewComponents.length"
               class="rounded-md border border-dashed border-slate-300 bg-white p-3 text-center text-xs text-slate-500">
            No components defined for this panel yet.
          </div>

          <div v-else-if="viewComponents.length" class="overflow-hidden rounded-md border border-slate-200 bg-white">
            <table class="w-full text-xs">
              <thead class="bg-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th class="w-8 px-2 py-1.5 text-left">#</th>
                  <th class="w-24 px-2 py-1.5 text-left">Code</th>
                  <th class="px-2 py-1.5 text-left">Name</th>
                  <th class="w-24 px-2 py-1.5 text-left">Unit</th>
                  <th class="px-2 py-1.5 text-left">Reference Range</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(c, i) in viewComponents" :key="c.uuid" class="border-t border-slate-100">
                  <td class="px-2 py-1 text-slate-400">{{ i + 1 }}</td>
                  <td class="px-2 py-1 font-mono font-semibold text-slate-700">{{ c.code }}</td>
                  <td class="px-2 py-1 text-slate-800">{{ c.name }}</td>
                  <td class="px-2 py-1 text-slate-600">{{ c.unit_of_measure || '—' }}</td>
                  <td class="px-2 py-1 text-slate-600">{{ c.reference_range || '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="closeView">Close</button>
        <button class="btn-primary" @click="switchToEdit">Edit</button>
      </template>
    </Modal>

    <Modal :show="showForm" :title="editing ? 'Edit Test Item' : 'Add Test Item'" size="lg" @close="showForm = false">
      <form id="testForm" @submit.prevent="submit" class="space-y-4">
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label class="label">Item Group</label>
            <select v-model="form.item_group_uuid" class="input">
              <option value="">All groups</option>
              <option v-for="g in activeGroups" :key="g.uuid" :value="g.uuid">{{ g.code }} · {{ g.name }}</option>
            </select>
            <p class="mt-1 text-[11px] text-slate-500">Narrows the category picker. Optional.</p>
          </div>
          <div>
            <label class="label">Item Category</label>
            <select v-model="form.item_category_uuid" required class="input">
              <option value="" disabled>Choose a category…</option>
              <option v-for="c in formGroupCategories" :key="c.uuid" :value="c.uuid">
                {{ c.code }} · {{ c.name }}
              </option>
            </select>
          </div>
          <div>
            <label class="label">Code</label>
            <input v-model="form.code" required maxlength="100" placeholder="FBS" class="input font-mono uppercase" />
          </div>
          <div>
            <label class="label">Name</label>
            <input v-model="form.name" required maxlength="500" placeholder="Fasting Blood Sugar" class="input" />
          </div>
          <div>
            <label class="label">Result Type</label>
            <select v-model="form.result_type" required class="input">
              <option v-for="t in RESULT_TYPES" :key="t" :value="t">{{ RESULT_TYPE_LABELS[t] }}</option>
            </select>
            <p class="mt-1 text-[11px] text-slate-500">
              The report renderer picks its template automatically from this value — no manual template choice.
            </p>
          </div>
          <div>
            <label class="label">Price</label>
            <input type="number" step="0.01" min="0" v-model.number="form.price" class="input" />
          </div>
          <div class="sm:col-span-2">
            <label class="label">Specimen / Modality</label>
            <input v-model="form.specimen" maxlength="255" class="input"
                   placeholder="Serum · Chest PA · 12-lead · Whole abdomen…" />
          </div>
          <template v-if="showSingleFields">
            <div>
              <label class="label">Unit of measure</label>
              <input v-model="form.unit_of_measure" maxlength="50" placeholder="mg/dL" class="input" />
            </div>
            <div>
              <label class="label">Reference range</label>
              <input v-model="form.reference_range" maxlength="500" placeholder="70-110 mg/dL" class="input" />
            </div>
            <div class="sm:col-span-2">
              <label class="label">Result values <span class="text-slate-400">(optional)</span></label>
              <input v-model="form.lookup_values" maxlength="1000" placeholder="Positive,Negative,Indeterminate"
                     class="input" />
              <p class="mt-1 text-[11px] text-slate-500">
                Comma-separated allowed values. When set, the result editor renders a dropdown; leave blank for free-text.
              </p>
            </div>
          </template>
          <div class="sm:col-span-2">
            <label class="label">Method <span class="text-slate-400">(optional)</span></label>
            <input v-model="form.method" maxlength="500"
                   placeholder="Qualitative Immunochromatographic Assay" class="input" />
            <p class="mt-1 text-[11px] text-slate-500">
              Printed under the test name on the report.
            </p>
          </div>
          <template v-if="form.result_type === 'matrix'">
            <div>
              <label class="label">Matrix rows <span class="text-slate-400">(comma-separated)</span></label>
              <input v-model="form.matrix_rows" class="input"
                     placeholder="Ascaris, Hookworm, Trichuris, E. histolytica, E. coli" />
            </div>
            <div>
              <label class="label">Matrix columns <span class="text-slate-400">(comma-separated)</span></label>
              <input v-model="form.matrix_cols" class="input"
                     placeholder="Cyst, Trophozoite" />
              <p class="mt-1 text-[11px] text-slate-500">
                Renders as a rows × cols grid on the result editor.
              </p>
            </div>
          </template>
        </div>

        <div>
          <label class="label">Description <span class="text-slate-400">(optional)</span></label>
          <textarea v-model="form.description" rows="3" maxlength="2000" class="input"></textarea>
        </div>

        <!-- Components (sub-analytes) — editable in place. Panel-only.
             The array position drives display_order at save time so the
             up/down buttons and delete are the "reorder" UI. On Add, the
             parent item is created first, then the components sync using
             the returned uuid. -->
        <div v-if="form.result_type === 'panel'"
             class="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
          <div class="mb-2 flex items-center justify-between">
            <div class="text-xs font-bold uppercase tracking-widest text-slate-500">
              Components ({{ components.length }})
            </div>
            <div class="flex items-center gap-2">
              <span v-if="componentsLoading" class="text-[11px] text-brand-600">Loading…</span>
              <button type="button" class="btn-secondary !py-1 !text-[11px]" @click="openAddComponent">
                + Add component
              </button>
            </div>
          </div>

          <div v-if="!componentsLoading && !components.length"
               class="rounded-md border border-dashed border-slate-300 bg-white p-3 text-center text-xs text-slate-500">
            No components yet. Click <b>+ Add component</b> to define the sub-analytes for this panel.
          </div>

          <!-- Compact read-only list. Click a row (or Edit) to open the
               component modal where each field gets full modal width. -->
          <div v-else-if="components.length" class="rounded-md border border-slate-200 bg-white">
            <table class="w-full text-xs">
              <thead class="bg-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th class="w-16 px-2 py-1.5 text-left">Order</th>
                  <th class="px-2 py-1.5 text-left">Component</th>
                  <th class="px-2 py-1.5 text-left">Reference / Options</th>
                  <th class="w-32 px-2 py-1.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(c, i) in components" :key="c.uuid || `new-${i}`"
                    class="border-t border-slate-100 align-middle hover:bg-brand-50/30">
                  <td class="px-2 py-1.5">
                    <div class="flex items-center gap-0.5">
                      <span class="w-4 text-right text-[11px] text-slate-400">{{ i + 1 }}</span>
                      <button type="button"
                              class="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                              :disabled="i === 0" @click.stop="moveComponentRow(i, -1)" title="Move up">
                        <svg viewBox="0 0 24 24" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="2.5"
                             stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
                      </button>
                      <button type="button"
                              class="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                              :disabled="i === components.length - 1" @click.stop="moveComponentRow(i, 1)" title="Move down">
                        <svg viewBox="0 0 24 24" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="2.5"
                             stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                      </button>
                    </div>
                  </td>
                  <td class="cursor-pointer px-2 py-1.5" @click="openEditComponent(i)">
                    <div class="text-slate-800">
                      <span class="font-mono text-[11px] font-semibold">{{ c.code || '—' }}</span>
                      <span class="ml-2">{{ c.name || '—' }}</span>
                    </div>
                    <div class="text-[10px] text-slate-500">
                      <span v-if="c.section">{{ c.section }}</span>
                      <span v-if="c.section && c.unit_of_measure"> · </span>
                      <span v-if="c.unit_of_measure">unit: {{ c.unit_of_measure }}</span>
                    </div>
                  </td>
                  <td class="cursor-pointer px-2 py-1.5 text-slate-600" @click="openEditComponent(i)">
                    <div v-if="c.reference_range" class="truncate">{{ c.reference_range }}</div>
                    <div v-if="c.lookup_values" class="text-[10px] text-slate-500 truncate">
                      Options: {{ c.lookup_values }}
                    </div>
                    <div v-if="!c.reference_range && !c.lookup_values" class="text-slate-400">—</div>
                  </td>
                  <td class="px-2 py-1.5 text-right">
                    <button type="button" class="btn-secondary !py-0.5 !text-[11px]" @click="openEditComponent(i)">Edit</button>
                    <button type="button"
                            class="ml-1 rounded p-1 text-rose-500 hover:bg-rose-50 hover:text-rose-700"
                            @click.stop="removeComponentRow(i)" title="Remove">
                      <svg viewBox="0 0 24 24" class="h-3.5 w-3.5 inline" fill="none" stroke="currentColor" stroke-width="2"
                           stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                        <path d="M10 11v6M14 11v6"/>
                      </svg>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-if="componentsError" class="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] text-rose-700">
            {{ componentsError }}
          </div>
          <p class="mt-2 text-[11px] text-slate-500">
            Row order is the display order on the printed report. Changes save with the parent item.
          </p>
        </div>

        <div v-if="formError" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ formError }}
        </div>
      </form>
      <template #footer>
        <button class="btn-secondary" :disabled="submitting" @click="showForm = false">Cancel</button>
        <button class="btn-primary" :disabled="submitting" form="testForm" type="submit">
          {{ submitting ? 'Saving…' : (editing ? 'Save' : 'Create') }}
        </button>
      </template>
    </Modal>

    <!-- Nested modal — full-width form for one component. Opens on
         "+ Add component" (editingIndex = -1) or on a row's Edit button. -->
    <Modal :show="showComponentModal"
           :title="editingIndex === -1 ? 'Add Component' : `Edit Component #${editingIndex + 1}`"
           size="lg" @close="showComponentModal = false">
      <div class="space-y-3">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div class="sm:col-span-1">
            <label class="label">Code</label>
            <input v-model="componentDraft.code" maxlength="100" placeholder="WBC"
                   class="input font-mono uppercase" />
          </div>
          <div class="sm:col-span-3">
            <label class="label">Name</label>
            <input v-model="componentDraft.name" maxlength="500" placeholder="White Blood Cell Count" class="input" />
          </div>
          <div class="sm:col-span-2">
            <label class="label">Section <span class="text-slate-400">(sub-heading)</span></label>
            <input v-model="componentDraft.section" maxlength="100"
                   placeholder="Chemical Properties / Differential Count / …" class="input" />
            <p class="mt-1 text-[11px] text-slate-500">
              Optional. Rows sharing the same section group under a bolded sub-heading on the printout.
            </p>
          </div>
          <div class="sm:col-span-1">
            <label class="label">Unit</label>
            <input v-model="componentDraft.unit_of_measure" maxlength="50" placeholder="x10^9/L" class="input" />
          </div>
          <div class="sm:col-span-1">
            <label class="label">Reference Range</label>
            <input v-model="componentDraft.reference_range" maxlength="500" placeholder="4.5-11.0" class="input" />
          </div>
        </div>
        <div>
          <label class="label">Result values <span class="text-slate-400">(optional)</span></label>
          <input v-model="componentDraft.lookup_values" maxlength="1000"
                 placeholder="Positive,Negative,Indeterminate" class="input" />
          <p class="mt-1 text-[11px] text-slate-500">
            Comma-separated. When set, the result editor renders a dropdown; blank = free-text input.
          </p>
        </div>
        <div v-if="componentModalError"
             class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ componentModalError }}
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="showComponentModal = false">Cancel</button>
        <button class="btn-primary" @click="saveComponentDraft">
          {{ editingIndex === -1 ? 'Add' : 'Save' }}
        </button>
      </template>
    </Modal>

    <ConfirmDialog
      :show="confirmStatus.show"
      :title="confirmStatus.next === 'active' ? 'Activate test item' : 'Deactivate test item'"
      :message="confirmStatus.next === 'active'
        ? `Make ${confirmStatus.test?.code} available again?`
        : `${confirmStatus.test?.code} will be hidden. Continue?`"
      :confirm-text="confirmStatus.next === 'active' ? 'Activate' : 'Deactivate'"
      :danger="confirmStatus.next !== 'active'"
      @close="confirmStatus = { show: false, test: null, next: '' }"
      @confirm="doToggleStatus"
    />

    <ConfirmDialog
      :show="confirmDelete.show"
      title="Delete test item"
      :message="confirmDelete.test
        ? `This will permanently delete ${confirmDelete.test.code} · ${confirmDelete.test.name}.`
        : ''"
      confirm-text="Delete"
      @close="confirmDelete = { show: false, test: null }"
      @confirm="doDelete"
    />

    <!-- ═══ Print Preview modal ═══
         Mock lab report so ops can see how a test item will render on the
         printout without creating a real report. The `.print-preview-sheet`
         inside is the only element that gets printed (see the @media print
         rules at the bottom of the file). Users can add more items to the
         preview from the picker at the top — grouped by category, same
         layout as the actual laboratory report. -->
    <Modal :show="showPrint" title="Print Preview" size="xl" @close="closePrint">
      <div v-if="printError" class="mb-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
        {{ printError }}
      </div>

      <!-- Preview toolbar — Add another item + list of items in preview -->
      <div class="no-print mb-3 flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50 p-2 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex flex-wrap items-center gap-1 text-xs">
          <span class="font-semibold text-slate-600">In preview:</span>
          <span v-for="it in printItems" :key="it.uuid"
                class="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-brand-800">
            <span class="font-mono text-[10px]">{{ it.code }}</span>
            <span>{{ it.name }}</span>
            <button v-if="printItems.length > 1"
                    class="ml-0.5 text-brand-500 hover:text-rose-600"
                    @click="removePrintItem(it.uuid)" title="Remove from preview">×</button>
          </span>
        </div>
        <button v-if="!addPickerOpen" type="button" class="btn-secondary !text-xs"
                @click="addPickerOpen = true; runAddSearch()">+ Add another item</button>
        <button v-else type="button" class="btn-ghost !text-xs"
                @click="addPickerOpen = false">Done</button>
      </div>

      <!-- Item picker (search + click to add). Renders only when open. Scoped
           to the primary item's category — real lab reports are one category
           per report, so mixing them here would misrepresent the printout. -->
      <div v-if="addPickerOpen" class="no-print mb-3 rounded-md border border-slate-200 p-2">
        <div class="mb-2 rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
          Only items in the same category as
          <b>{{ printItems[0]?.name || 'the primary item' }}</b>
          <span v-if="printItems[0]?.item_category_name">
            (<span class="text-slate-800">{{ printItems[0].item_category_name }}</span>)
          </span>
          can be added.
        </div>
        <div class="flex gap-2">
          <input v-model="addSearch" @keyup.enter="runAddSearch"
                 placeholder="Search test items by code or name…"
                 class="input flex-1" />
          <button type="button" class="btn-secondary" :disabled="addSearching" @click="runAddSearch">
            {{ addSearching ? 'Searching…' : 'Search' }}
          </button>
        </div>
        <div class="mt-2 max-h-56 overflow-auto rounded border border-slate-100">
          <div v-if="!addResults.length && !addSearching"
               class="p-3 text-center text-xs text-slate-400">
            No matches in this category. Try a different keyword.
          </div>
          <button v-for="r in addResults" :key="r.uuid" type="button"
                  class="flex w-full items-center justify-between border-b border-slate-100 px-2.5 py-1.5 text-left text-xs hover:bg-slate-50 last:border-none"
                  @click="addPrintItem(r)">
            <span class="min-w-0 flex-1 truncate">
              <span class="font-mono text-[10px] text-slate-500">{{ r.code }}</span>
              <span class="ml-1">{{ r.name }}</span>
              <span v-if="r.item_category_name" class="ml-2 text-slate-400">· {{ r.item_category_name }}</span>
            </span>
            <span class="ml-2 text-[10px] font-semibold text-brand-600">+ Add</span>
          </button>
        </div>
      </div>

      <!-- Sample lab report — SAME template LaboratoryView uses. The
           `print-preview-sheet` wrapper is what the @media print rule below
           surfaces; the LabReportPrintable inside carries the standard IDs
           and full layout. -->
      <div v-if="printLoading" class="h-40 animate-pulse rounded bg-slate-50"></div>
      <div v-else-if="previewReport"
           class="print-preview-sheet mx-auto rounded border border-slate-200 bg-white"
           style="max-width: 820px;">
        <div class="no-print bg-amber-50 px-2 py-1 text-center text-[10px] font-bold uppercase tracking-widest text-amber-700">
          Sample · Preview only · Not a real lab report
        </div>
        <LabReportPrintable :report="previewReport" :tenant="tenant.current" :paper-height="1056" />
      </div>

      <template #footer>
        <button class="btn-secondary" @click="closePrint">Close</button>
        <button class="btn-primary" @click="doPrintPreview">⎙ Print</button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
/* Only the .print-preview-sheet element is printed. Hide the modal chrome
   (title bar, buttons, add-picker) and the app frame so the sample report
   comes out clean. */
@media print {
  @page { size: letter portrait; margin: 0.5in; }
  html, body { background: white !important; }
  body * { visibility: hidden !important; }
  .print-preview-sheet, .print-preview-sheet * { visibility: visible !important; }
  .print-preview-sheet {
    position: fixed !important;
    top: 0; left: 0; right: 0;
    width: 100%;
    max-width: none !important;
    margin: 0 !important;
    border: none !important;
    box-shadow: none !important;
    padding: 0.25in !important;
  }
  .no-print { display: none !important; }
}
</style>
