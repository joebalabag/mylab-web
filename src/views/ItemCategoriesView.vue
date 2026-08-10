<script setup>
import { computed, onMounted, ref } from 'vue'
import { useItemCategoriesStore } from '../stores/itemCategories'
import { useItemGroupsStore } from '../stores/itemGroups'
import { useAuthStore } from '../stores/auth'
import Modal from '../components/Modal.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import EmptyState from '../components/EmptyState.vue'
import SkeletonRows from '../components/SkeletonRows.vue'
import RowActionMenu from '../components/RowActionMenu.vue'
import MobileFilterBar from '../components/MobileFilterBar.vue'
import { formatDateTime } from '../utils/format'

const categories = useItemCategoriesStore()
const groups     = useItemGroupsStore()
const auth       = useAuthStore()

const search       = ref('')
const groupFilter  = ref('')      // '' | uuid
const statusFilter = ref('')      // '' | 'active' | 'inactive'
const listError    = ref('')

async function loadGroups() {
  try {
    await groups.fetch({ page_number: 0, page_size: 500 })
  } catch (e) {
    // Non-fatal — form picker still renders empty
    // eslint-disable-next-line no-console
    console.warn('Failed to preload item groups', e)
  }
}
async function loadCategories() {
  listError.value = ''
  categories.setFilters({
    tenant_uuid: auth.tenantUuid || '',
    item_group_uuid: groupFilter.value || '',
    keywords: search.value.trim(),
    status: statusFilter.value ? [statusFilter.value] : []
  })
  try {
    await categories.fetch()
  } catch (e) {
    listError.value = e?.message || 'Failed to load item categories'
  }
}
onMounted(async () => {
  await loadGroups()
  await loadCategories()
})

function onSearchEnter()  { loadCategories() }
function onFilterChange() { loadCategories() }

const filtered    = computed(() => categories.items)
const totalCount  = computed(() => categories.total || categories.items.length)
const activeCount = computed(() =>
  categories.items.filter(c => c.status === 'active').length
)
const activeGroups = computed(() => groups.items.filter(g => g.status === 'active'))

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
  item_group_uuid: '', code: '', name: '', description: '',
  combine_printout: true,
  color: '#0ea5e9',
  print_title: '',
  print_template: 'default',
  print_paper_size: 'full'
})
const form = ref(emptyForm())
const formError = ref('')
const submitting = ref(false)

function openAdd() {
  editing.value = null
  form.value = emptyForm()
  // Preselect the currently filtered group if any
  if (groupFilter.value) form.value.item_group_uuid = groupFilter.value
  formError.value = ''
  showForm.value = true
}
function openEdit(c) {
  editing.value = c
  form.value = {
    item_group_uuid: c.item_group_uuid || '',
    code: c.code || '',
    name: c.name || '',
    description: c.description || '',
    combine_printout: c.combine_printout !== false,
    color: c.color || '#0ea5e9',
    print_title: c.print_title || '',
    print_template: c.print_template || 'default',
    print_paper_size: c.print_paper_size || 'full'
  }
  formError.value = ''
  showForm.value = true
}

async function submit() {
  formError.value = ''
  const group = form.value.item_group_uuid
  const code  = form.value.code.trim().toUpperCase()
  const name  = form.value.name.trim()
  if (!group) { formError.value = 'Item group is required'; return }
  if (!code)  { formError.value = 'Code is required'; return }
  if (!name)  { formError.value = 'Name is required'; return }

  const payload = {
    item_group_uuid: group,
    code, name,
    description: form.value.description.trim() || null,
    combine_printout: !!form.value.combine_printout,
    color: form.value.color || null,
    print_title: form.value.print_title.trim() || null,
    print_template: form.value.print_template || 'default',
    print_paper_size: form.value.print_paper_size || 'full'
  }

  submitting.value = true
  try {
    if (editing.value) {
      await categories.update(editing.value.uuid, payload)
      flash(`Updated ${code}`)
    } else {
      const created = await categories.create({
        tenant_uuid: auth.tenantUuid || undefined,
        ...payload
      })
      flash(`Created ${created?.code || code}`)
    }
    showForm.value = false
    await loadCategories()
  } catch (e) {
    formError.value = e?.message || 'Failed to save item category'
  } finally {
    submitting.value = false
  }
}

// ─── Delete ───
const confirmDelete = ref({ show: false, cat: null })
function askDelete(c) { confirmDelete.value = { show: true, cat: c } }
async function doDelete() {
  const c = confirmDelete.value.cat
  confirmDelete.value = { show: false, cat: null }
  try {
    await categories.remove(c.uuid)
    flash(`Deleted ${c.code}`)
  } catch (e) {
    flashError(e, 'Failed to delete item category')
  }
}

// ─── Activate / Deactivate ───
const confirmStatus = ref({ show: false, cat: null, next: '' })
function askToggleStatus(c) {
  const next = c.status === 'active' ? 'inactive' : 'active'
  confirmStatus.value = { show: true, cat: c, next }
}
async function doToggleStatus() {
  const { cat, next } = confirmStatus.value
  confirmStatus.value = { show: false, cat: null, next: '' }
  try {
    await categories.setStatus(cat.uuid, next)
    flash(`${cat.code} is now ${next}`)
  } catch (e) {
    flashError(e, 'Failed to update status')
  }
}

// ─── Row menu ───
function actionsFor(c) {
  const isActive = c.status === 'active'
  return [
    { label: 'Edit item category', icon: 'edit', onClick: () => openEdit(c) },
    { label: isActive ? 'Deactivate' : 'Activate',
      icon:  isActive ? 'deactivate' : 'activate',
      variant: isActive ? 'danger' : 'success',
      onClick: () => askToggleStatus(c) },
    { divider: true },
    { label: 'Delete item category', icon: 'trash', variant: 'danger', onClick: () => askDelete(c) }
  ]
}
</script>

<template>
  <div class="flex h-full flex-col gap-4">
    <div class="grid grid-cols-2 gap-3 shrink-0">
      <div class="card"><div class="card-body">
        <div class="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 dark:text-slate-500">Total Categories</div>
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
          <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">Item Categories</div>
          <div class="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
            {{ filtered.length }} shown
            <span v-if="categories.loading" class="ml-1 text-brand-600">· loading…</span>
          </div>
        </div>
        <MobileFilterBar>
          <input
            v-model="search"
            @keyup.enter="onSearchEnter"
            placeholder="Search code, name, or group… (Enter)"
            class="input w-full sm:w-64"
          />
          <select v-model="groupFilter" @change="onFilterChange" class="input w-full sm:w-48">
            <option value="">All item groups</option>
            <option v-for="g in activeGroups" :key="g.uuid" :value="g.uuid">{{ g.code }} · {{ g.name }}</option>
          </select>
          <select v-model="statusFilter" @change="onFilterChange" class="input w-full sm:w-36">
            <option value="">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <button class="btn-secondary" @click="loadCategories" :disabled="categories.loading" title="Refresh">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
          </button>
          <template #action>
            <button class="btn-primary" :disabled="!activeGroups.length" @click="openAdd">+ Add Item Category</button>
          </template>
        </MobileFilterBar>
      </div>

      <div v-if="!activeGroups.length && !groups.loading"
           class="border-t border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
        No active item groups yet — create one under <b>Item Groups</b> before adding categories.
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
          v-if="categories.loading && !categories.items.length"
          :rows="6"
          label="Loading item categories…"
          :columns="['bar','lines','lines','pill','pill','dot']"
        />
        <table class="table" v-else-if="filtered.length">
          <thead class="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800 shadow-[inset_0_-1px_0_theme(colors.slate.100)]">
            <tr>
              <th class="w-24">Code</th>
              <th>Name</th>
              <th>Item Group</th>
              <th>Description</th>
              <th>Status</th>
              <th class="hidden md:table-cell">Created</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in filtered" :key="c.uuid" :class="c.status !== 'active' && 'bg-slate-50/50 dark:bg-slate-800/50'">
              <td class="font-mono text-xs font-semibold">{{ c.code }}</td>
              <td>
                <span class="font-medium text-slate-800 dark:text-slate-100">{{ c.name }}</span>
                <div v-if="c.status !== 'active'" class="text-[10px] font-semibold uppercase tracking-wider text-rose-600">
                  Hidden
                </div>
              </td>
              <td>
                <span class="font-mono text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500">{{ c.item_group_code || '—' }}</span>
                <span class="ml-1 text-sm text-slate-700 dark:text-slate-200">{{ c.item_group_name || '—' }}</span>
              </td>
              <td class="text-sm text-slate-600 dark:text-slate-300 max-w-xs truncate">{{ c.description || '—' }}</td>
              <td>
                <span class="badge" :class="c.status === 'active' ? 'badge-success' : 'badge-danger'">
                  <span class="mr-1 inline-block h-1.5 w-1.5 rounded-full"
                        :class="c.status === 'active' ? 'bg-emerald-500' : 'bg-rose-500'"></span>
                  {{ c.status === 'active' ? 'Active' : 'Inactive' }}
                </span>
              </td>
              <td class="hidden md:table-cell text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{{ formatDateTime(c.created_at) }}</td>
              <td class="text-right">
                <RowActionMenu :actions="actionsFor(c)" />
              </td>
            </tr>
          </tbody>
        </table>
        <EmptyState v-else-if="!categories.loading" title="No item categories" message="Add a category to group your items further." />
      </div>
    </div>

    <Modal :show="showForm" :title="editing ? 'Edit Item Category' : 'Add Item Category'" size="md" @close="showForm = false">
      <form id="catForm" @submit.prevent="submit" class="space-y-4">
        <div>
          <label class="label">Item Group</label>
          <select v-model="form.item_group_uuid" required class="input">
            <option value="" disabled>Choose a group…</option>
            <option v-for="g in activeGroups" :key="g.uuid" :value="g.uuid">
              {{ g.code }} · {{ g.name }}
            </option>
          </select>
        </div>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label class="label">Code</label>
            <input v-model="form.code" required maxlength="100" placeholder="CAT-001" class="input font-mono uppercase" />
          </div>
          <div>
            <label class="label">Name</label>
            <input v-model="form.name" required maxlength="500" placeholder="Blood Chemistry" class="input" />
          </div>
        </div>
        <div>
          <label class="label">Description <span class="text-slate-400 dark:text-slate-500">(optional)</span></label>
          <textarea v-model="form.description" rows="3" maxlength="2000" class="input"></textarea>
        </div>
        <label class="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
          <input type="checkbox" v-model="form.combine_printout" class="mt-0.5" />
          <span>
            <span class="font-medium">Combine tests in one laboratory print-out</span>
            <span class="block text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
              When on, all requisitioned tests in this category share a single Lab ID and print together.
              Turn off if each test in this category should print as its own report.
            </span>
          </span>
        </label>

        <div class="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 p-3 space-y-3">
          <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500">Print layout</div>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label class="label">Section color</label>
              <div class="flex items-center gap-2">
                <input type="color" v-model="form.color" class="h-9 w-14 rounded border border-slate-200 dark:border-slate-700" />
                <input type="text" v-model="form.color" maxlength="20"
                       class="input font-mono flex-1" placeholder="#0ea5e9" />
              </div>
              <p class="mt-1 text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500">Colored band above the results on the printout.</p>
            </div>
            <div>
              <label class="label">Print template</label>
              <select v-model="form.print_template" class="input">
                <option value="default">Default (analyte / result / unit / range)</option>
                <option value="sectioned">Sectioned (sub-headings inside a panel)</option>
                <option value="narrative">Narrative (free-text report)</option>
                <option value="matrix">Matrix (grid table)</option>
              </select>
            </div>
          </div>
          <div>
            <label class="label">Paper size</label>
            <select v-model="form.print_paper_size" class="input">
              <option value="full">Full page (A4)</option>
              <option value="half">Half page (A5)</option>
              <option value="letter">Letter — 8.5″ × 11″ (short bond)</option>
              <option value="legal">Legal — 8.5″ × 14″ (long bond)</option>
              <option value="half_letter">Half Letter — 5.5″ × 8.5″ portrait</option>
              <option value="half_letter_crosswise">Half Letter — 8.5″ × 5.5″ crosswise (landscape)</option>
              <option value="half_legal_crosswise">Half Legal — 8.5″ × 7″ crosswise (landscape)</option>
            </select>
            <p class="mt-1 text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500">
              Applied to the browser print dialog. Big panels typically use full; single-line qualitative tests fit on half.
            </p>
          </div>
          <div>
            <label class="label">Print title <span class="text-slate-400 dark:text-slate-500">(optional)</span></label>
            <input v-model="form.print_title" maxlength="255" class="input"
                   placeholder="C L I N I C A L   C H E M I S T R Y" />
            <p class="mt-1 text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500">
              Section title printed in the colored band above the results. Leave blank to use the category name.
            </p>
          </div>
        </div>


        <div v-if="formError" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ formError }}
        </div>
      </form>
      <template #footer>
        <button class="btn-secondary" :disabled="submitting" @click="showForm = false">Cancel</button>
        <button class="btn-primary" :disabled="submitting" form="catForm" type="submit">
          {{ submitting ? 'Saving…' : (editing ? 'Save' : 'Create') }}
        </button>
      </template>
    </Modal>

    <ConfirmDialog
      :show="confirmStatus.show"
      :title="confirmStatus.next === 'active' ? 'Activate item category' : 'Deactivate item category'"
      :message="confirmStatus.next === 'active'
        ? `Make ${confirmStatus.cat?.code} available again?`
        : `${confirmStatus.cat?.code} will be hidden. Continue?`"
      :confirm-text="confirmStatus.next === 'active' ? 'Activate' : 'Deactivate'"
      :danger="confirmStatus.next !== 'active'"
      @close="confirmStatus = { show: false, cat: null, next: '' }"
      @confirm="doToggleStatus"
    />

    <ConfirmDialog
      :show="confirmDelete.show"
      title="Delete item category"
      :message="confirmDelete.cat
        ? `This will permanently delete ${confirmDelete.cat.code} · ${confirmDelete.cat.name}.`
        : ''"
      confirm-text="Delete"
      @close="confirmDelete = { show: false, cat: null }"
      @confirm="doDelete"
    />
  </div>
</template>
