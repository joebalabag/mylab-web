<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useItemPackagesStore } from '../stores/itemPackages'
import { useTestItemsStore } from '../stores/testItems'
import { useAuthStore } from '../stores/auth'
import Modal from '../components/Modal.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import EmptyState from '../components/EmptyState.vue'
import SkeletonRows from '../components/SkeletonRows.vue'
import RowActionMenu from '../components/RowActionMenu.vue'
import MobileFilterBar from '../components/MobileFilterBar.vue'
import { money, formatDateTime } from '../utils/format'
import { viewItemPackage, syncItemPackageItems } from '../api/itemPackages'

const packages  = useItemPackagesStore()
const testItems = useTestItemsStore()
const auth      = useAuthStore()

const search       = ref('')
const statusFilter = ref('')
const listError    = ref('')

async function loadPackages() {
  listError.value = ''
  packages.setFilters({
    tenant_uuid: auth.tenantUuid || '',
    keywords: search.value.trim(),
    status: statusFilter.value ? [statusFilter.value] : []
  })
  try {
    await packages.fetch()
  } catch (e) {
    listError.value = e?.message || 'Failed to load item packages'
  }
}
async function loadTestItemsCatalog() {
  try {
    // Load all active test items once so the picker doesn't hit the network
    // on every row. 500 is well above the 114 currently seeded.
    await testItems.fetch({ page_number: 0, page_size: 500 })
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Failed to preload test items', e)
  }
}
onMounted(async () => {
  await Promise.all([loadPackages(), loadTestItemsCatalog()])
})

function onSearchEnter()  { loadPackages() }
function onFilterChange() { loadPackages() }

const filtered    = computed(() => packages.items)
const totalCount  = computed(() => packages.total || packages.items.length)
const activeCount = computed(() => packages.items.filter(p => p.status === 'active').length)

const activeTestItems = computed(() => testItems.items.filter(t => t.status === 'active'))

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

// ─── Add / Edit form ───
const showForm  = ref(false)
const editing   = ref(null)
const emptyForm = () => ({ code: '', name: '', description: '' })
const form      = ref(emptyForm())
const formError = ref('')
const submitting = ref(false)

// Line items — local state. Empty `uuid` means "new". `test_item_uuid`
// resolves against the preloaded catalog for display.
// `_search` and `_focus` are UI-only fields powering the typeahead picker
// (they never hit the API — see the sanitise step in submit()).
const lines = ref([])
const linesLoading = ref(false)
const linesError = ref('')

function emptyLineRow() {
  return { uuid: null, test_item_uuid: '', current_price: 0, new_price: 0, _search: '', _focus: false }
}
function addLineRow() {
  lines.value = [...lines.value, emptyLineRow()]
}
function removeLineRow(i) {
  lines.value = lines.value.filter((_, idx) => idx !== i)
}
function moveLineRow(i, delta) {
  const next = i + delta
  if (next < 0 || next >= lines.value.length) return
  const arr = [...lines.value]
  const [row] = arr.splice(i, 1)
  arr.splice(next, 0, row)
  lines.value = arr
}

// ─── Typeahead picker helpers ─────────────────────────────────────
// Filter the active catalog by whatever the user typed for this row.
// Prefix + substring hit on code AND name so "CBC" and "blood" both find CBC.
function matchesFor(row) {
  const q = String(row._search || '').trim().toLowerCase()
  if (!q) return activeTestItems.value.slice(0, 12)
  const chosen = new Set(lines.value.map(l => l.test_item_uuid).filter(Boolean))
  return activeTestItems.value
    .filter(ti => !chosen.has(ti.uuid))    // hide items already in the package
    .filter(ti =>
      ti.code?.toLowerCase().includes(q) ||
      ti.name?.toLowerCase().includes(q)
    )
    .slice(0, 12)
}
function pickLineItem(row, ti) {
  row.test_item_uuid = ti.uuid
  row._search = ''
  row._focus = false
  const price = Number(ti.price ?? 0)
  row.current_price = price
  // Only default new_price if user hasn't already typed something. Preserves
  // an intentional 0 they may have entered before picking (rare but possible).
  if (row.new_price == null || Number(row.new_price) === 0) {
    row.new_price = price
  }
}
function clearLinePick(row) {
  row.test_item_uuid = ''
  row._search = ''
  row._focus = true
}
// Small blur delay so a click on a dropdown option registers before the
// list unmounts. mousedown handler on the option is the reliable fallback.
function onPickerBlur(row) {
  setTimeout(() => { row._focus = false }, 120)
}
function pickedLabel(row) {
  const ti = activeTestItems.value.find(t => t.uuid === row.test_item_uuid)
  if (!ti) return '(unknown)'
  return `${ti.code} · ${ti.name}`
}

// Live totals — shown at the bottom of the items table and drive the parent's
// package_price on save.
const originalTotal = computed(() =>
  lines.value.reduce((s, r) => s + Number(r.current_price || 0), 0)
)
const packageTotal = computed(() =>
  lines.value.reduce((s, r) => s + Number(r.new_price || 0), 0)
)
const totalSavings = computed(() => Math.max(0, originalTotal.value - packageTotal.value))
const savingsPct = computed(() => {
  if (originalTotal.value <= 0) return 0
  return Math.round((totalSavings.value / originalTotal.value) * 100)
})

// ─── Target package price ─────────────────────────────────────────
// The operator can override the package price directly; hitting Distribute
// pushes proportional new_prices into each row so their sum matches the
// target. Auto-tracks the current sum until the user manually edits it.
const targetPackagePrice = ref(0)
const targetDirty = ref(false)   // true once the operator has typed a target
function markTargetDirty() { targetDirty.value = true }
function distributeTargetPrice() {
  linesError.value = ''
  const target = Math.max(0, Number(targetPackagePrice.value) || 0)
  if (!lines.value.length) return
  const total = originalTotal.value

  // If every current_price is 0 we can't ratio anything — fall back to an
  // even split so the target still lands somewhere sensible.
  if (total <= 0) {
    const per = Math.round((target / lines.value.length) * 100) / 100
    let accum = 0
    lines.value.forEach((r, i) => {
      if (i === lines.value.length - 1) {
        r.new_price = Math.round((target - accum) * 100) / 100
      } else {
        r.new_price = per
        accum += per
      }
    })
  } else {
    // Proportional to current_price. Last row absorbs any rounding remainder
    // so the sum exactly matches the target (avoids ₱0.01 drift).
    let accum = 0
    lines.value.forEach((r, i) => {
      if (i === lines.value.length - 1) {
        r.new_price = Math.round((target - accum) * 100) / 100
      } else {
        const share = Math.round((Number(r.current_price || 0) / total) * target * 100) / 100
        r.new_price = share
        accum += share
      }
    })
  }
  targetDirty.value = false
}
// Auto-track the sum whenever the operator hasn't manually set a target yet.
// Once they type in the target box, we stop syncing so their entry sticks.
watch(packageTotal, (v) => {
  if (!targetDirty.value) targetPackagePrice.value = Math.round(v * 100) / 100
})

// ─── Uniform discount % ──────────────────────────────────────────
// The other way to price a bundle: set a % off and stamp every row's
// new_price = current_price × (1 - pct/100). Rounded to 2 decimals.
const discountPct = ref(0)
function applyDiscountToAll() {
  linesError.value = ''
  const pct = Number(discountPct.value)
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    linesError.value = 'Discount must be between 0 and 100.'
    return
  }
  const factor = 1 - pct / 100
  lines.value.forEach((r) => {
    r.new_price = Math.round(Number(r.current_price || 0) * factor * 100) / 100
  })
  // Target auto-tracks the new sum since the operator's intent is "% off",
  // not "hit a specific total". Clear the dirty flag so the target field
  // resumes syncing with packageTotal on the next tick.
  targetDirty.value = false
}

function openAdd() {
  editing.value = null
  form.value = emptyForm()
  lines.value = []
  targetPackagePrice.value = 0
  targetDirty.value = false
  formError.value = ''
  linesError.value = ''
  showForm.value = true
}
async function openEdit(pkg) {
  editing.value = pkg
  form.value = { code: pkg.code || '', name: pkg.name || '', description: pkg.description || '' }
  lines.value = []
  targetPackagePrice.value = Number(pkg.package_price ?? 0)
  targetDirty.value = false
  formError.value = ''
  linesError.value = ''
  showForm.value = true
  // Fetch the full record so lines are populated.
  linesLoading.value = true
  try {
    const full = await viewItemPackage(pkg.uuid)
    if (Array.isArray(full?.items)) {
      lines.value = full.items.map((it) => ({
        uuid: it.uuid,
        test_item_uuid: it.test_item_uuid,
        current_price: Number(it.current_price ?? 0),
        new_price: Number(it.new_price ?? 0),
        _search: '',
        _focus: false,
      }))
      targetPackagePrice.value = Number(full.package_price ?? pkg.package_price ?? 0)
      targetDirty.value = false
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Failed to load package items', e)
  } finally {
    linesLoading.value = false
  }
}

async function submit() {
  formError.value = ''
  linesError.value = ''
  const code = form.value.code.trim().toUpperCase()
  const name = form.value.name.trim()
  if (!code) { formError.value = 'Code is required'; return }
  if (!name) { formError.value = 'Name is required'; return }

  // Line validation — every row must resolve to a picked test item, and no
  // test item may repeat inside the same package (backend enforces too).
  for (let i = 0; i < lines.value.length; i++) {
    const r = lines.value[i]
    if (!r.test_item_uuid) { linesError.value = `Item #${i + 1}: pick a test item`; return }
    if (Number(r.new_price) < 0) { linesError.value = `Item #${i + 1}: new price cannot be negative`; return }
  }
  const seen = new Set()
  for (let i = 0; i < lines.value.length; i++) {
    const t = lines.value[i].test_item_uuid
    if (seen.has(t)) { linesError.value = `Duplicate test item on row ${i + 1}`; return }
    seen.add(t)
  }

  const payload = {
    code, name,
    description: form.value.description.trim() || undefined,
  }

  submitting.value = true
  try {
    let targetUuid = editing.value?.uuid
    if (editing.value) {
      await packages.update(editing.value.uuid, payload)
      flash(`Updated ${code}`)
    } else {
      const created = await packages.create({
        tenant_uuid: auth.tenantUuid || undefined,
        ...payload
      })
      targetUuid = created?.uuid
      flash(`Created ${created?.code || code}`)
    }

    if (targetUuid && (editing.value || lines.value.length > 0)) {
      const rows = lines.value.map((r, idx) => ({
        uuid: r.uuid || undefined,
        test_item_uuid: r.test_item_uuid,
        current_price: Number(r.current_price) || 0,
        new_price: Number(r.new_price) || 0,
        display_order: idx,
      }))
      await syncItemPackageItems(targetUuid, rows)
    }

    showForm.value = false
    await loadPackages()
  } catch (e) {
    formError.value = e?.message || 'Failed to save item package'
  } finally {
    submitting.value = false
  }
}

// ─── View (read-only) ───
const showView = ref(false)
const viewing  = ref(null)
const viewLoading = ref(false)
async function openView(pkg) {
  viewing.value = pkg
  showView.value = true
  viewLoading.value = true
  try {
    const full = await viewItemPackage(pkg.uuid)
    if (full) viewing.value = full
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Failed to load package detail', e)
  } finally {
    viewLoading.value = false
  }
}
function closeView() { showView.value = false; viewing.value = null }
function switchToEdit() {
  const p = viewing.value
  closeView()
  if (p) openEdit(p)
}
const viewOriginalTotal = computed(() =>
  (viewing.value?.items || []).reduce((s, r) => s + Number(r.current_price || 0), 0)
)
const viewSavings = computed(() => Math.max(0, viewOriginalTotal.value - Number(viewing.value?.package_price || 0)))

// ─── Delete + Status ───
const confirmDelete = ref({ show: false, pkg: null })
function askDelete(p) { confirmDelete.value = { show: true, pkg: p } }
async function doDelete() {
  const p = confirmDelete.value.pkg
  confirmDelete.value = { show: false, pkg: null }
  try {
    await packages.remove(p.uuid)
    flash(`Deleted ${p.code}`)
  } catch (e) {
    flashError(e, 'Failed to delete package')
  }
}
const confirmStatus = ref({ show: false, pkg: null, next: '' })
function askToggleStatus(p) {
  const next = p.status === 'active' ? 'inactive' : 'active'
  confirmStatus.value = { show: true, pkg: p, next }
}
async function doToggleStatus() {
  const { pkg, next } = confirmStatus.value
  confirmStatus.value = { show: false, pkg: null, next: '' }
  try {
    await packages.setStatus(pkg.uuid, next)
    flash(`${pkg.code} is now ${next}`)
  } catch (e) {
    flashError(e, 'Failed to update status')
  }
}

function actionsFor(p) {
  const isActive = p.status === 'active'
  return [
    { label: 'View package', icon: 'eye',  onClick: () => openView(p) },
    { label: 'Edit package', icon: 'edit', onClick: () => openEdit(p) },
    { label: isActive ? 'Deactivate' : 'Activate',
      icon:  isActive ? 'deactivate' : 'activate',
      variant: isActive ? 'danger' : 'success',
      onClick: () => askToggleStatus(p) },
    { divider: true },
    { label: 'Delete package', icon: 'trash', variant: 'danger', onClick: () => askDelete(p) }
  ]
}

// Helper for the view modal — test item label off the joined test_item_* fields.
function itemLabel(row) {
  const code = row.test_item_code || '—'
  const name = row.test_item_name || ''
  return `${code}${name ? ' · ' + name : ''}`
}
</script>

<template>
  <div class="flex h-full flex-col gap-4">
    <div class="grid grid-cols-2 gap-3 shrink-0">
      <div class="card"><div class="card-body">
        <div class="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 dark:text-slate-500">Total Packages</div>
        <div class="mt-1 text-2xl font-bold">{{ totalCount }}</div>
      </div></div>
      <div class="card"><div class="card-body">
        <div class="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 dark:text-slate-500">Active</div>
        <div class="mt-1 text-2xl font-bold text-emerald-600">{{ activeCount }}</div>
      </div></div>
    </div>

    <div class="card flex flex-1 min-h-0 flex-col overflow-hidden">
      <div class="card-header">
        <div>
          <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">Item Packages</div>
          <div class="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
            {{ filtered.length }} shown
            <span v-if="packages.loading" class="ml-1 text-brand-600">· loading…</span>
          </div>
        </div>
        <MobileFilterBar>
          <input
            v-model="search"
            @keyup.enter="onSearchEnter"
            placeholder="Search code or name… (Enter)"
            class="input w-full sm:w-64"
          />
          <select v-model="statusFilter" @change="onFilterChange" class="input w-full sm:w-36">
            <option value="">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <button class="btn-secondary" @click="loadPackages" :disabled="packages.loading" title="Refresh">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
          </button>
          <template #action>
            <button class="btn-primary" :disabled="!activeTestItems.length" @click="openAdd">+ Add Package</button>
          </template>
        </MobileFilterBar>
      </div>

      <div v-if="!activeTestItems.length && !testItems.loading"
           class="border-t border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
        No active test items yet — create some under <b>Test Items</b> before building packages.
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
          v-if="packages.loading && !packages.items.length"
          :rows="6"
          label="Loading packages…"
          :columns="['bar','lines','pill','bar','pill','dot']"
        />
        <table class="table" v-else-if="filtered.length">
          <thead class="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800 shadow-[inset_0_-1px_0_theme(colors.slate.100)]">
            <tr>
              <th class="w-28">Code</th>
              <th>Name</th>
              <th class="text-right">Items</th>
              <th class="text-right">Package Price</th>
              <th>Status</th>
              <th class="hidden md:table-cell">Created</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in filtered" :key="p.uuid" :class="p.status !== 'active' && 'bg-slate-50/50 dark:bg-slate-800/50'">
              <td class="font-mono text-xs font-semibold">
                <button type="button"
                        class="text-brand-600 hover:text-brand-800 hover:underline"
                        @click="openView(p)"
                        :title="`View ${p.code}`">{{ p.code }}</button>
              </td>
              <td>
                <div class="font-medium text-slate-800 dark:text-slate-100">{{ p.name }}</div>
                <div v-if="p.description" class="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500 truncate max-w-md">{{ p.description }}</div>
                <div v-if="p.status !== 'active'" class="text-[10px] font-semibold uppercase tracking-wider text-rose-600">
                  Hidden
                </div>
              </td>
              <td class="text-right text-sm text-slate-700 dark:text-slate-200">{{ p.item_count || 0 }}</td>
              <td class="text-right font-semibold">{{ money(p.package_price) }}</td>
              <td>
                <span class="badge" :class="p.status === 'active' ? 'badge-success' : 'badge-danger'">
                  <span class="mr-1 inline-block h-1.5 w-1.5 rounded-full"
                        :class="p.status === 'active' ? 'bg-emerald-500' : 'bg-rose-500'"></span>
                  {{ p.status === 'active' ? 'Active' : 'Inactive' }}
                </span>
              </td>
              <td class="hidden md:table-cell text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{{ formatDateTime(p.created_at) }}</td>
              <td class="text-right">
                <RowActionMenu :actions="actionsFor(p)" />
              </td>
            </tr>
          </tbody>
        </table>
        <EmptyState v-else-if="!packages.loading" title="No packages" message="Bundle test items into a package to offer discounted rates." />
      </div>
    </div>

    <!-- ═══ Add / Edit form ═════════════════════════════════════════════════ -->
    <Modal :show="showForm" :title="editing ? 'Edit Item Package' : 'Add Item Package'" size="xl" @close="showForm = false">
      <form id="pkgForm" @submit.prevent="submit" class="space-y-4">
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label class="label">Code *</label>
            <input v-model="form.code" required maxlength="100" placeholder="ECHK-01" class="input font-mono uppercase" />
          </div>
          <div class="sm:col-span-2">
            <label class="label">Name *</label>
            <input v-model="form.name" required maxlength="500" placeholder="Executive Check-up" class="input" />
          </div>
          <div class="sm:col-span-3">
            <label class="label">Description <span class="text-slate-400 dark:text-slate-500">(optional)</span></label>
            <textarea v-model="form.description" rows="2" maxlength="2000" class="input"></textarea>
          </div>
        </div>

        <!-- Package items — editable table. Current price snapshots from the
             test item's catalog price when picked; new price is the discounted
             price within this package. Sum of new prices = package_price. -->
        <div class="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/70 p-3">
          <div class="mb-2 flex items-center justify-between">
            <div class="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500">
              Package Items ({{ lines.length }})
            </div>
            <div class="flex items-center gap-2">
              <span v-if="linesLoading" class="text-[11px] text-brand-600">Loading…</span>
              <button type="button" class="btn-secondary !py-1 !text-[11px]" @click="addLineRow"
                      :disabled="!activeTestItems.length">
                + Add item
              </button>
            </div>
          </div>

          <!-- Two ways to price the bundle. Both are convenience helpers —
               individual new prices below stay editable after either action.
               Left: hit an exact package total (proportional split).
               Right: apply a uniform % off across every row. -->
          <div class="mb-2 rounded-md border border-brand-100 bg-brand-50/60 px-2 py-1.5">
            <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
              <!-- Target price -->
              <div class="flex flex-wrap items-center gap-1.5">
                <label class="text-[10px] font-bold uppercase tracking-widest text-brand-700">
                  Target package price
                </label>
                <span class="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">₱</span>
                <input type="number" min="0" step="0.01"
                       v-model.number="targetPackagePrice"
                       @input="markTargetDirty"
                       @keyup.enter.prevent="distributeTargetPrice"
                       class="input !py-1 !text-xs w-28 text-right" />
                <button type="button" class="btn-primary !py-1 !text-[11px]"
                        :disabled="!lines.length"
                        @click="distributeTargetPrice">
                  Distribute
                </button>
              </div>

              <span class="text-[10px] font-semibold text-slate-400 dark:text-slate-500">— OR —</span>

              <!-- Uniform discount % -->
              <div class="flex flex-wrap items-center gap-1.5">
                <label class="text-[10px] font-bold uppercase tracking-widest text-brand-700">
                  Discount to all
                </label>
                <input type="number" min="0" max="100" step="0.01"
                       v-model.number="discountPct"
                       @keyup.enter.prevent="applyDiscountToAll"
                       class="input !py-1 !text-xs w-20 text-right" />
                <span class="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">%</span>
                <button type="button" class="btn-primary !py-1 !text-[11px]"
                        :disabled="!lines.length"
                        @click="applyDiscountToAll">
                  Apply to all
                </button>
              </div>

              <span v-if="targetDirty" class="ml-auto text-[10px] font-semibold text-amber-700">
                Target unapplied — click Distribute
              </span>
            </div>
            <p class="mt-1 text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-500">
              <b>Distribute</b> splits the target across items proportionally by current price.
              <b>Apply to all</b> stamps every new price as current × (1 − %).
              Rows stay individually editable after either.
            </p>
          </div>

          <div v-if="!linesLoading && !lines.length"
               class="rounded-md border border-dashed border-slate-300 bg-white dark:bg-slate-900 p-3 text-center text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
            No items yet. Click <b>+ Add item</b> to bundle test items into this package.
          </div>

          <!-- overflow-visible so the picker's dropdown can escape the box. -->
          <div v-else-if="lines.length" class="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <table class="w-full text-xs">
              <thead class="bg-slate-100 dark:bg-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500">
                <tr>
                  <th class="w-14 px-2 py-1.5 text-left">Order</th>
                  <th class="px-2 py-1.5 text-left">Test Item</th>
                  <th class="w-28 px-2 py-1.5 text-right">Current</th>
                  <th class="w-28 px-2 py-1.5 text-right">New</th>
                  <th class="w-24 px-2 py-1.5 text-right">Savings</th>
                  <th class="w-14 px-2 py-1.5 text-right"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(r, i) in lines" :key="r.uuid || `new-${i}`" class="border-t border-slate-100 dark:border-slate-800 align-middle">
                  <td class="px-1 py-1">
                    <div class="flex items-center gap-0.5">
                      <span class="w-4 text-right text-[11px] text-slate-400 dark:text-slate-500">{{ i + 1 }}</span>
                      <button type="button"
                              class="rounded p-0.5 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30"
                              :disabled="i === 0" @click="moveLineRow(i, -1)" title="Move up">
                        <svg viewBox="0 0 24 24" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="2.5"
                             stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
                      </button>
                      <button type="button"
                              class="rounded p-0.5 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30"
                              :disabled="i === lines.length - 1" @click="moveLineRow(i, 1)" title="Move down">
                        <svg viewBox="0 0 24 24" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="2.5"
                             stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                      </button>
                    </div>
                  </td>
                  <td class="px-1 py-1">
                    <!-- Typeahead picker. Unpicked: text input + filtered
                         dropdown (max 12 matches, excludes items already in
                         the package). After pick: locked chip with a × to
                         clear. Uses @mousedown.prevent on the option so the
                         click registers before the input's blur handler fires. -->
                    <div class="relative">
                      <div v-if="r.test_item_uuid"
                           class="flex items-center gap-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1">
                        <span class="flex-1 truncate text-xs">
                          <span class="font-mono font-semibold text-slate-700 dark:text-slate-200">{{ (activeTestItems.find(t => t.uuid === r.test_item_uuid) || {}).code || '—' }}</span>
                          <span class="ml-1 text-slate-700 dark:text-slate-200">{{ (activeTestItems.find(t => t.uuid === r.test_item_uuid) || {}).name || '' }}</span>
                        </span>
                        <button type="button"
                                class="rounded p-0.5 text-slate-400 dark:text-slate-500 hover:bg-white dark:hover:bg-slate-800 hover:text-rose-600"
                                @click="clearLinePick(r)"
                                title="Change item">
                          <svg viewBox="0 0 24 24" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="2.5"
                               stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                      </div>
                      <template v-else>
                        <input type="text"
                               v-model="r._search"
                               @focus="r._focus = true"
                               @blur="onPickerBlur(r)"
                               placeholder="Search code or name…"
                               class="input !py-1 !text-xs" />
                        <div v-if="r._focus"
                             class="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-auto rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg">
                          <button v-for="m in matchesFor(r)" :key="m.uuid"
                                  type="button"
                                  @mousedown.prevent="pickLineItem(r, m)"
                                  class="block w-full px-2 py-1 text-left text-xs hover:bg-brand-50">
                            <span class="font-mono font-semibold text-slate-700 dark:text-slate-200">{{ m.code }}</span>
                            <span class="ml-1 text-slate-800 dark:text-slate-100">{{ m.name }}</span>
                            <span class="ml-1 text-slate-500 dark:text-slate-400 dark:text-slate-500">· {{ money(m.price) }}</span>
                          </button>
                          <div v-if="!matchesFor(r).length" class="px-2 py-2 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                            No matches.
                          </div>
                        </div>
                      </template>
                    </div>
                  </td>
                  <td class="px-1 py-1">
                    <input type="number" min="0" step="0.01"
                           v-model.number="r.current_price"
                           class="input !py-1 !text-xs text-right" />
                  </td>
                  <td class="px-1 py-1">
                    <input type="number" min="0" step="0.01"
                           v-model.number="r.new_price"
                           class="input !py-1 !text-xs text-right font-semibold" />
                  </td>
                  <td class="px-1 py-1 text-right text-xs"
                      :class="(Number(r.current_price) - Number(r.new_price)) > 0 ? 'text-emerald-700 font-semibold' : 'text-slate-400 dark:text-slate-500'">
                    {{ money(Math.max(0, Number(r.current_price) - Number(r.new_price))) }}
                  </td>
                  <td class="px-1 py-1 text-right">
                    <button type="button"
                            class="rounded p-1 text-rose-500 hover:bg-rose-50 hover:text-rose-700"
                            @click="removeLineRow(i)" title="Remove">
                      <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2"
                           stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                        <path d="M10 11v6M14 11v6"/>
                      </svg>
                    </button>
                  </td>
                </tr>
              </tbody>
              <tfoot v-if="lines.length" class="bg-slate-50 dark:bg-slate-800 text-xs">
                <tr class="border-t border-slate-200 dark:border-slate-700">
                  <td class="px-2 py-1.5"></td>
                  <td class="px-2 py-1.5 text-right font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[10px]">Original total (sum of current)</td>
                  <td class="px-2 py-1.5 text-right font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500 line-through">{{ money(originalTotal) }}</td>
                  <td class="px-2 py-1.5"></td>
                  <td class="px-2 py-1.5"></td>
                  <td></td>
                </tr>
                <tr>
                  <td class="px-2 py-1.5"></td>
                  <td class="px-2 py-1.5 text-right font-bold text-brand-700 uppercase tracking-wider text-[10px]">Package price (sum of new)</td>
                  <td class="px-2 py-1.5"></td>
                  <td class="px-2 py-1.5 text-right font-bold text-brand-700">{{ money(packageTotal) }}</td>
                  <td class="px-2 py-1.5 text-right font-bold text-emerald-700">
                    {{ money(totalSavings) }}
                    <span v-if="savingsPct > 0" class="ml-1 text-[10px] font-semibold">({{ savingsPct }}% off)</span>
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div v-if="linesError" class="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] text-rose-700">
            {{ linesError }}
          </div>
          <p class="mt-2 text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500">
            Current price snapshots from the test item's catalog price on pick. New price is what this package charges for that item — the totals above drive the package's saved price.
          </p>
        </div>

        <div v-if="formError" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ formError }}
        </div>
      </form>
      <template #footer>
        <button class="btn-secondary" :disabled="submitting" @click="showForm = false">Cancel</button>
        <button class="btn-primary" :disabled="submitting" form="pkgForm" type="submit">
          {{ submitting ? 'Saving…' : (editing ? 'Save' : 'Create') }}
        </button>
      </template>
    </Modal>

    <!-- ═══ View (read-only) ═════════════════════════════════════════════════ -->
    <Modal :show="showView" title="Item Package" size="lg" @close="closeView">
      <div v-if="viewing" class="space-y-4">
        <div class="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <div class="flex items-center gap-2">
              <span class="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-mono text-xs font-bold text-slate-700 dark:text-slate-200">{{ viewing.code }}</span>
              <span class="badge" :class="viewing.status === 'active' ? 'badge-success' : 'badge-danger'">
                <span class="mr-1 inline-block h-1.5 w-1.5 rounded-full"
                      :class="viewing.status === 'active' ? 'bg-emerald-500' : 'bg-rose-500'"></span>
                {{ viewing.status === 'active' ? 'Active' : 'Inactive' }}
              </span>
            </div>
            <h3 class="mt-1 text-lg font-bold text-slate-800 dark:text-slate-100">{{ viewing.name }}</h3>
            <p v-if="viewing.description" class="mt-0.5 whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">{{ viewing.description }}</p>
          </div>
          <div class="text-right">
            <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500">Package Price</div>
            <div class="text-xl font-bold text-brand-700">{{ money(viewing.package_price) }}</div>
            <div v-if="viewSavings > 0" class="text-[11px] font-semibold text-emerald-700">
              Saves {{ money(viewSavings) }} vs. individual
            </div>
          </div>
        </div>

        <div>
          <div class="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500">
            Items ({{ viewing.items?.length || 0 }})
            <span v-if="viewLoading" class="ml-1 text-brand-600">· Loading…</span>
          </div>
          <div v-if="viewing.items?.length" class="overflow-hidden rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <table class="w-full text-xs">
              <thead class="bg-slate-100 dark:bg-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500">
                <tr>
                  <th class="w-8 px-2 py-1.5 text-left">#</th>
                  <th class="px-2 py-1.5 text-left">Test Item</th>
                  <th class="w-24 px-2 py-1.5 text-right">Current</th>
                  <th class="w-24 px-2 py-1.5 text-right">Package</th>
                  <th class="w-20 px-2 py-1.5 text-right">Savings</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(r, i) in viewing.items" :key="r.uuid" class="border-t border-slate-100 dark:border-slate-800">
                  <td class="px-2 py-1 text-slate-400 dark:text-slate-500">{{ i + 1 }}</td>
                  <td class="px-2 py-1 text-slate-800 dark:text-slate-100">
                    <span class="font-mono font-semibold text-slate-700 dark:text-slate-200">{{ r.test_item_code || '—' }}</span>
                    <span v-if="r.test_item_name" class="ml-1">· {{ r.test_item_name }}</span>
                  </td>
                  <td class="px-2 py-1 text-right text-slate-500 dark:text-slate-400 dark:text-slate-500 line-through">{{ money(r.current_price) }}</td>
                  <td class="px-2 py-1 text-right font-semibold text-brand-700">{{ money(r.new_price) }}</td>
                  <td class="px-2 py-1 text-right text-emerald-700 font-semibold">
                    {{ money(Math.max(0, Number(r.current_price) - Number(r.new_price))) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="rounded-md border border-dashed border-slate-300 bg-white dark:bg-slate-900 p-3 text-center text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
            No items in this package yet.
          </div>
        </div>

        <div class="border-t border-slate-100 dark:border-slate-800 pt-2 text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500">
          Created {{ formatDateTime(viewing.created_at) }}<span v-if="viewing.created_by"> by {{ viewing.created_by }}</span>
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="closeView">Close</button>
        <button class="btn-primary" @click="switchToEdit">Edit</button>
      </template>
    </Modal>

    <ConfirmDialog
      :show="confirmStatus.show"
      :title="confirmStatus.next === 'active' ? 'Activate package' : 'Deactivate package'"
      :message="confirmStatus.next === 'active'
        ? `Make ${confirmStatus.pkg?.code} available again?`
        : `${confirmStatus.pkg?.code} will be hidden from requisition pickers. Continue?`"
      :confirm-text="confirmStatus.next === 'active' ? 'Activate' : 'Deactivate'"
      :danger="confirmStatus.next !== 'active'"
      @close="confirmStatus = { show: false, pkg: null, next: '' }"
      @confirm="doToggleStatus"
    />

    <ConfirmDialog
      :show="confirmDelete.show"
      title="Delete package"
      :message="confirmDelete.pkg
        ? `This will permanently delete ${confirmDelete.pkg.code} · ${confirmDelete.pkg.name} and all its items.`
        : ''"
      confirm-text="Delete"
      @close="confirmDelete = { show: false, pkg: null }"
      @confirm="doDelete"
    />
  </div>
</template>
