<script setup>
import { computed, onMounted, ref } from 'vue'
import { useItemGroupsStore } from '../stores/itemGroups'
import { useDoctorsStore } from '../stores/doctors'
import { useAuthStore } from '../stores/auth'
import Modal from '../components/Modal.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import EmptyState from '../components/EmptyState.vue'
import SkeletonRows from '../components/SkeletonRows.vue'
import RowActionMenu from '../components/RowActionMenu.vue'
import MobileFilterBar from '../components/MobileFilterBar.vue'
import { formatDateTime } from '../utils/format'
import { getPreloadedCatalog, importPreloadedCatalog } from '../api/itemGroups'

const groups  = useItemGroupsStore()
const doctors = useDoctorsStore()
const auth    = useAuthStore()

const search       = ref('')
const statusFilter = ref('')      // '' | 'active' | 'inactive'
const listError    = ref('')

async function loadGroups() {
  listError.value = ''
  groups.setFilters({
    tenant_uuid: auth.tenantUuid || '',
    keywords: search.value.trim(),
    status: statusFilter.value ? [statusFilter.value] : []
  })
  try {
    await groups.fetch()
  } catch (e) {
    listError.value = e?.message || 'Failed to load item groups'
  }
}
async function loadDoctors() {
  try { await doctors.fetch({ page_number: 0, page_size: 500 }) }
  catch (_) { /* non-fatal — signatory picker just stays empty */ }
}
const activeDoctors = computed(() => doctors.items.filter((d) => d.status === 'active'))

onMounted(async () => {
  await Promise.all([loadGroups(), loadDoctors()])
})

function onSearchEnter()  { loadGroups() }
function onFilterChange() { loadGroups() }

const filtered    = computed(() => groups.items)
const totalCount  = computed(() => groups.total || groups.items.length)
const activeCount = computed(() =>
  groups.items.filter(g => g.status === 'active').length
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
const emptyForm = () => ({ code: '', name: '', description: '', signatory_doctor_uuid: '', tester_role: '' })

// Common healthcare-professional roles that RUN tests, mapped to the item
// group they typically belong to. Used as the picker options — the field
// itself is free-text so admins can add anything unusual.
const TESTER_ROLES = [
  'Medical Technologist',
  'Radiologic Technologist',
  'Sonographer',
  'Nuclear Medicine Technologist',
  'Cardiovascular Technician',
  'Neurodiagnostic Technician',
  'Respiratory Therapist',
  'Histotechnologist',
  'Cytotechnologist',
]
const form = ref(emptyForm())
const formError = ref('')
const submitting = ref(false)

function openAdd() {
  editing.value = null
  form.value = emptyForm()
  formError.value = ''
  showForm.value = true
}
function openEdit(g) {
  editing.value = g
  form.value = {
    code: g.code || '',
    name: g.name || '',
    description: g.description || '',
    signatory_doctor_uuid: g.signatory_doctor_uuid || '',
    tester_role: g.tester_role || ''
  }
  formError.value = ''
  showForm.value = true
}

async function submit() {
  formError.value = ''
  const code = form.value.code.trim().toUpperCase()
  const name = form.value.name.trim()
  if (!code) { formError.value = 'Code is required'; return }
  if (!name) { formError.value = 'Name is required'; return }

  const payload = {
    code, name,
    description: form.value.description.trim() || null,
    signatory_doctor_uuid: form.value.signatory_doctor_uuid || null,
    tester_role: form.value.tester_role.trim() || null
  }

  submitting.value = true
  try {
    if (editing.value) {
      await groups.update(editing.value.uuid, payload)
      flash(`Updated ${code}`)
    } else {
      const created = await groups.create({
        tenant_uuid: auth.tenantUuid || undefined,
        ...payload
      })
      flash(`Created ${created?.code || code}`)
    }
    showForm.value = false
  } catch (e) {
    formError.value = e?.message || 'Failed to save item group'
  } finally {
    submitting.value = false
  }
}

// ─── Delete ───
const confirmDelete = ref({ show: false, group: null })
function askDelete(g) { confirmDelete.value = { show: true, group: g } }
async function doDelete() {
  const g = confirmDelete.value.group
  confirmDelete.value = { show: false, group: null }
  try {
    await groups.remove(g.uuid)
    flash(`Deleted ${g.code}`)
  } catch (e) {
    flashError(e, 'Failed to delete item group')
  }
}

// ─── Activate / Deactivate ───
const confirmStatus = ref({ show: false, group: null, next: '' })
function askToggleStatus(g) {
  const next = g.status === 'active' ? 'inactive' : 'active'
  confirmStatus.value = { show: true, group: g, next }
}
async function doToggleStatus() {
  const { group, next } = confirmStatus.value
  confirmStatus.value = { show: false, group: null, next: '' }
  try {
    await groups.setStatus(group.uuid, next)
    flash(`${group.code} is now ${next}`)
  } catch (e) {
    flashError(e, 'Failed to update status')
  }
}

// ─── Row menu ───
function actionsFor(g) {
  const isActive = g.status === 'active'
  return [
    { label: 'Edit item group', icon: 'edit', onClick: () => openEdit(g) },
    { label: isActive ? 'Deactivate' : 'Activate',
      icon:  isActive ? 'deactivate' : 'activate',
      variant: isActive ? 'danger' : 'success',
      onClick: () => askToggleStatus(g) },
    { divider: true },
    { label: 'Delete item group', icon: 'trash', variant: 'danger', onClick: () => askDelete(g) }
  ]
}

// ─── Import from pre-loaded standard catalog ───
// The catalog is a set of ITEM GROUPS. Each group bundles its own
// categories + test items. Ticking a group installs the whole sub-tree.
// Server-side idempotent — re-importing skips rows that already exist.
const showImport = ref(false)
const importCatalog = ref(null)       // { groups: [{code,name,categories:[{code,test_items_count}],categories_count,test_items_count}] }
const importPicks = ref(new Set())    // Set<group_code>
const importExpanded = ref(new Set()) // Set<group_code> — expanded preview of a group's categories
const importLoading = ref(false)
const importSubmitting = ref(false)
const importError = ref('')

async function openImport() {
  showImport.value = true
  importError.value = ''
  if (importCatalog.value) return   // cached across opens
  importLoading.value = true
  try {
    importCatalog.value = await getPreloadedCatalog()
    // Default: everything ticked so the common case (fresh tenant) is one click.
    importPicks.value = new Set((importCatalog.value?.groups || []).map(g => g.code))
  } catch (e) {
    importError.value = e?.message || 'Failed to load catalog'
  } finally {
    importLoading.value = false
  }
}

function toggleImportPick(code) {
  const s = new Set(importPicks.value)
  if (s.has(code)) s.delete(code); else s.add(code)
  importPicks.value = s
}
function toggleImportExpand(code) {
  const s = new Set(importExpanded.value)
  if (s.has(code)) s.delete(code); else s.add(code)
  importExpanded.value = s
}
function importPickAll() {
  importPicks.value = new Set((importCatalog.value?.groups || []).map(g => g.code))
}
function importPickNone() {
  importPicks.value = new Set()
}

// Rolls up categories + test items across the currently-ticked groups so
// the footer button label previews the actual install size.
const importSelectionTotals = computed(() => {
  const s = importPicks.value
  return (importCatalog.value?.groups || [])
    .filter(g => s.has(g.code))
    .reduce((acc, g) => {
      acc.categories += g.categories_count || 0
      acc.test_items += g.test_items_count || 0
      return acc
    }, { categories: 0, test_items: 0 })
})

async function doImport() {
  importError.value = ''
  if (!importPicks.value.size) {
    importError.value = 'Pick at least one item group to import.'
    return
  }
  importSubmitting.value = true
  try {
    const codes = Array.from(importPicks.value)
    const total = importCatalog.value?.groups?.length || 0
    // Pass undefined when everything is ticked so the API treats it as a
    // "full catalog" import (skips the whitelist filter entirely).
    const payload = codes.length === total ? undefined : codes
    const out = await importPreloadedCatalog(payload)
    const parts = [
      `${out?.groupsCreated ?? 0} group(s)`,
      `${out?.categoriesCreated ?? 0} categor${(out?.categoriesCreated ?? 0) === 1 ? 'y' : 'ies'}`,
      `${out?.testItemsCreated ?? 0} test item(s)`,
    ]
    flash(`Imported ${parts.join(', ')}`)
    if (out?.skippedCategories?.length) {
      flash(`${out.skippedCategories.length} category code(s) already exist under a different group — skipped`, 'amber')
    }
    showImport.value = false
    await loadGroups()
  } catch (e) {
    importError.value = e?.message || 'Import failed'
  } finally {
    importSubmitting.value = false
  }
}
</script>

<template>
  <div class="flex h-full flex-col gap-4">
    <div class="grid grid-cols-2 gap-3 shrink-0">
      <div class="card"><div class="card-body">
        <div class="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 dark:text-slate-500">Total Item Groups</div>
        <div class="mt-1 text-2xl font-bold">{{ totalCount }}</div>
      </div></div>
      <div class="card"><div class="card-body">
        <div class="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 dark:text-slate-500">Active</div>
        <div class="mt-1 text-2xl font-bold text-emerald-600">{{ activeCount }}</div>
      </div></div>
    </div>

    <!-- Empty-tenant helper note. Only appears when there are no item groups
         yet — nudges the operator toward importing the pre-loaded standard
         catalog instead of typing everything from scratch. Hides itself the
         moment any group exists so it doesn't clutter established tenants. -->
    <div v-if="!groups.loading && !groups.items.length"
         class="card border-brand-200 bg-brand-50/60 shrink-0">
      <div class="card-body flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div class="text-sm">
          <div class="font-semibold text-brand-800">Set up faster with the pre-loaded catalog</div>
          <div class="text-xs text-brand-700">
            Import the standard laboratory catalog (groups, categories, and common test items)
            instead of starting from an empty list. You can tick which categories to install.
          </div>
        </div>
        <button class="btn-primary shrink-0" @click="openImport">Import from Pre-loaded</button>
      </div>
    </div>

    <div class="card flex flex-1 min-h-0 flex-col overflow-hidden">
      <div class="card-header">
        <div>
          <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">Item Groups</div>
          <div class="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
            {{ filtered.length }} shown
            <span v-if="groups.loading" class="ml-1 text-brand-600">· loading…</span>
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
          <button class="btn-secondary" @click="loadGroups" :disabled="groups.loading" title="Refresh">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
          </button>
          <template #action>
            <button class="btn-secondary" @click="openImport">⬇ Import from Pre-loaded</button>
            <button class="btn-primary" @click="openAdd">+ Add Item Group</button>
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
          v-if="groups.loading && !groups.items.length"
          :rows="6"
          label="Loading item groups…"
          :columns="['bar','lines','pill','pill','dot']"
        />
        <table class="table" v-else-if="filtered.length">
          <thead class="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800 shadow-[inset_0_-1px_0_theme(colors.slate.100)]">
            <tr>
              <th class="w-24">Code</th>
              <th>Name</th>
              <th>Description</th>
              <th>Signatory</th>
              <th>Status</th>
              <th class="hidden md:table-cell">Created</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="g in filtered" :key="g.uuid" :class="g.status !== 'active' && 'bg-slate-50/50 dark:bg-slate-800/50'">
              <td class="font-mono text-xs font-semibold">{{ g.code }}</td>
              <td>
                <span class="font-medium text-slate-800 dark:text-slate-100">{{ g.name }}</span>
                <div v-if="g.status !== 'active'" class="text-[10px] font-semibold uppercase tracking-wider text-rose-600">
                  Hidden
                </div>
              </td>
              <td class="text-sm text-slate-600 dark:text-slate-300 max-w-md truncate">{{ g.description || '—' }}</td>
              <td class="text-sm text-slate-700 dark:text-slate-200">
                <template v-if="g.signatory_doctor_name">
                  <div>{{ g.signatory_doctor_name }}</div>
                  <div class="text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-500">
                    {{ g.signatory_doctor_specialty }}<span v-if="g.signatory_doctor_license"> · Lic. {{ g.signatory_doctor_license }}</span>
                  </div>
                </template>
                <span v-else class="text-slate-400 dark:text-slate-500">—</span>
                <div v-if="g.tester_role" class="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-500">
                  <span class="text-slate-400 dark:text-slate-500">Tester:</span> {{ g.tester_role }}
                </div>
              </td>
              <td>
                <span class="badge" :class="g.status === 'active' ? 'badge-success' : 'badge-danger'">
                  <span class="mr-1 inline-block h-1.5 w-1.5 rounded-full"
                        :class="g.status === 'active' ? 'bg-emerald-500' : 'bg-rose-500'"></span>
                  {{ g.status === 'active' ? 'Active' : 'Inactive' }}
                </span>
              </td>
              <td class="hidden md:table-cell text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{{ formatDateTime(g.created_at) }}</td>
              <td class="text-right">
                <RowActionMenu :actions="actionsFor(g)" />
              </td>
            </tr>
          </tbody>
        </table>
        <EmptyState v-else-if="!groups.loading" title="No item groups" message="Add an item group to organize your inventory." />
      </div>
    </div>

    <Modal :show="showForm" :title="editing ? 'Edit Item Group' : 'Add Item Group'" size="md" @close="showForm = false">
      <form id="groupForm" @submit.prevent="submit" class="space-y-4">
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label class="label">Code</label>
            <input v-model="form.code" required maxlength="100" placeholder="GRP-001" class="input font-mono uppercase" />
          </div>
          <div>
            <label class="label">Name</label>
            <input v-model="form.name" required maxlength="500" placeholder="Reagents" class="input" />
          </div>
        </div>
        <div>
          <label class="label">Description <span class="text-slate-400 dark:text-slate-500">(optional)</span></label>
          <textarea v-model="form.description" rows="3" maxlength="2000" class="input"></textarea>
        </div>

        <div class="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 p-3 space-y-3">
          <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500">Lab report roles</div>
          <div>
            <label class="label">Signatory doctor <span class="text-slate-400 dark:text-slate-500">(optional)</span></label>
            <select v-model="form.signatory_doctor_uuid" class="input">
              <option value="">— No default —</option>
              <option v-for="d in activeDoctors" :key="d.uuid" :value="d.uuid">
                {{ d.name }} · {{ d.specialty }}<span v-if="d.license_number"> · Lic. {{ d.license_number }}</span>
              </option>
            </select>
            <p class="mt-1 text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500">
              Auto-fills as the pathologist snapshot when finalizing a lab report from any test
              under this group. Manage doctors in <b>Company Settings → Doctors</b>.
            </p>
          </div>
          <div>
            <label class="label">Tester role <span class="text-slate-400 dark:text-slate-500">(who runs the test)</span></label>
            <input v-model="form.tester_role" list="tester-role-suggestions" maxlength="100"
                   class="input" placeholder="Medical Technologist" />
            <datalist id="tester-role-suggestions">
              <option v-for="r in TESTER_ROLES" :key="r" :value="r"></option>
            </datalist>
            <p class="mt-1 text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500">
              Prints under the medtech signature on the report — e.g. "Medical Technologist" for lab,
              "Radiologic Technologist" for X-ray, "Sonographer" for ultrasound.
            </p>
          </div>
        </div>

        <div v-if="formError" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ formError }}
        </div>
      </form>
      <template #footer>
        <button class="btn-secondary" :disabled="submitting" @click="showForm = false">Cancel</button>
        <button class="btn-primary" :disabled="submitting" form="groupForm" type="submit">
          {{ submitting ? 'Saving…' : (editing ? 'Save' : 'Create') }}
        </button>
      </template>
    </Modal>

    <ConfirmDialog
      :show="confirmStatus.show"
      :title="confirmStatus.next === 'active' ? 'Activate item group' : 'Deactivate item group'"
      :message="confirmStatus.next === 'active'
        ? `Make ${confirmStatus.group?.code} available again?`
        : `${confirmStatus.group?.code} will be hidden. Continue?`"
      :confirm-text="confirmStatus.next === 'active' ? 'Activate' : 'Deactivate'"
      :danger="confirmStatus.next !== 'active'"
      @close="confirmStatus = { show: false, group: null, next: '' }"
      @confirm="doToggleStatus"
    />

    <ConfirmDialog
      :show="confirmDelete.show"
      title="Delete item group"
      :message="confirmDelete.group
        ? `This will permanently delete ${confirmDelete.group.code} · ${confirmDelete.group.name}. Categories assigned to it must be removed first.`
        : ''"
      confirm-text="Delete"
      @close="confirmDelete = { show: false, group: null }"
      @confirm="doDelete"
    />

    <!-- Import from pre-loaded standard catalog. Checklist of item GROUPS,
         each bundling its own categories + test items. Click the row's
         chevron to preview which categories a group ships with. Idempotent
         server-side — existing codes are skipped, so re-importing is safe. -->
    <Modal :show="showImport"
           title="Import from pre-loaded catalog"
           size="lg" @close="showImport = false">
      <div class="space-y-3">
        <p class="text-xs text-slate-600 dark:text-slate-300">
          Pick which <b>item groups</b> to install. Each group ships with its own
          categories and standard test items — ticking a group installs the whole
          sub-tree. Existing codes are skipped, so re-running is safe.
        </p>

        <div v-if="importLoading" class="h-40 animate-pulse rounded bg-slate-50 dark:bg-slate-800"></div>

        <template v-else-if="importCatalog">
          <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
            <div>
              <b>{{ importPicks.size }}</b> of {{ importCatalog.groups.length }} groups ·
              <b>{{ importSelectionTotals.categories }}</b> categories ·
              <b>{{ importSelectionTotals.test_items }}</b> test items
            </div>
            <div class="flex gap-2">
              <button type="button" class="btn-ghost !text-[11px]" @click="importPickAll">Select all</button>
              <button type="button" class="btn-ghost !text-[11px]" @click="importPickNone">Clear</button>
            </div>
          </div>

          <div class="max-h-[26rem] overflow-auto rounded-md border border-slate-200 dark:border-slate-700">
            <div v-for="g in importCatalog.groups" :key="g.code"
                 class="border-b border-slate-100 dark:border-slate-800 last:border-none">
              <div class="flex items-start gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-800">
                <input type="checkbox"
                       :checked="importPicks.has(g.code)"
                       @change="toggleImportPick(g.code)"
                       :id="`grp-${g.code}`"
                       class="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                <label :for="`grp-${g.code}`" class="min-w-0 flex-1 cursor-pointer">
                  <div class="flex items-baseline justify-between gap-2">
                    <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      <span class="font-mono text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500">{{ g.code }}</span>
                      <span class="ml-1">{{ g.name }}</span>
                    </div>
                    <div class="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500 whitespace-nowrap">
                      {{ g.categories_count }} categor{{ g.categories_count === 1 ? 'y' : 'ies' }} ·
                      {{ g.test_items_count }} test(s)
                    </div>
                  </div>
                  <div v-if="g.description" class="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">{{ g.description }}</div>
                  <div v-if="g.tester_role" class="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 italic">Tester role: {{ g.tester_role }}</div>
                </label>
                <button type="button"
                        class="shrink-0 rounded-md p-1 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200"
                        @click="toggleImportExpand(g.code)"
                        :title="importExpanded.has(g.code) ? 'Hide categories' : 'Preview categories'">
                  <svg viewBox="0 0 24 24" class="h-4 w-4 transition-transform"
                       :class="importExpanded.has(g.code) ? 'rotate-180' : ''"
                       fill="none" stroke="currentColor" stroke-width="2.5"
                       stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
              </div>

              <!-- Expanded per-category preview. Read-only — you can't
                   partially tick within a group, ticking the group installs
                   everything under it. -->
              <div v-if="importExpanded.has(g.code)"
                   class="border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/60 px-3 py-2">
                <div class="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  <div v-for="c in g.categories" :key="c.code"
                       class="flex items-center gap-2 rounded px-2 py-1 text-xs">
                    <span class="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                          :style="{ background: c.color || '#94a3b8' }"></span>
                    <span class="font-mono text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-500">{{ c.code }}</span>
                    <span class="truncate">{{ c.name }}</span>
                    <span class="ml-auto text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap">{{ c.test_items_count }} test(s)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>

        <div v-if="importError"
             class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ importError }}
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" :disabled="importSubmitting" @click="showImport = false">Cancel</button>
        <button class="btn-primary" :disabled="importSubmitting || !importCatalog || !importPicks.size"
                @click="doImport">
          {{ importSubmitting ? 'Importing…' : `Import ${importPicks.size} group${importPicks.size === 1 ? '' : 's'}` }}
        </button>
      </template>
    </Modal>
  </div>
</template>
