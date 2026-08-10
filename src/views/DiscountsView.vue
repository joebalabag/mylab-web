<script setup>
import { computed, onMounted, ref } from 'vue'
import { useDiscountsStore } from '../stores/discounts'
import { useAuthStore } from '../stores/auth'
import Modal from '../components/Modal.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import EmptyState from '../components/EmptyState.vue'
import SkeletonRows from '../components/SkeletonRows.vue'
import RowActionMenu from '../components/RowActionMenu.vue'
import MobileFilterBar from '../components/MobileFilterBar.vue'
import { money, formatDateTime } from '../utils/format'

const discounts = useDiscountsStore()
const auth      = useAuthStore()

const TYPES = [
  { value: 'percent',     label: 'Percent (%)' },
  { value: 'fix',         label: 'Fixed amount (₱)' },
  { value: 'open_amount', label: 'Open amount (set at use time)' }
]

const search       = ref('')
const typeFilter   = ref('')      // '' | 'percent' | 'fix' | 'open_amount'
const statusFilter = ref('')      // '' | 'active' | 'inactive'
const listError    = ref('')

async function loadDiscounts() {
  listError.value = ''
  discounts.setFilters({
    tenant_uuid: auth.tenantUuid || '',
    keywords: search.value.trim(),
    discount_type: typeFilter.value,
    status: statusFilter.value ? [statusFilter.value] : []
  })
  try {
    await discounts.fetch()
  } catch (e) {
    listError.value = e?.message || 'Failed to load discounts'
  }
}
onMounted(loadDiscounts)

function onSearchEnter()  { loadDiscounts() }
function onFilterChange() { loadDiscounts() }

const filtered    = computed(() => discounts.items)
const totalCount  = computed(() => discounts.total || discounts.items.length)
const activeCount = computed(() =>
  discounts.items.filter(d => d.status === 'active').length
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
  code: '',
  name: '',
  discount_type: 'percent',
  value: 0
})
const form = ref(emptyForm())
const formError = ref('')
const submitting = ref(false)

function openAdd() {
  editing.value = null
  form.value = emptyForm()
  formError.value = ''
  showForm.value = true
}
function openEdit(d) {
  editing.value = d
  form.value = {
    code: d.code || '',
    name: d.name || '',
    discount_type: d.discount_type || 'percent',
    value: Number(d.value ?? 0)
  }
  formError.value = ''
  showForm.value = true
}

async function submit() {
  formError.value = ''
  const code = form.value.code.trim().toUpperCase()
  const name = form.value.name.trim()
  const dtype = form.value.discount_type
  if (!code) { formError.value = 'Code is required'; return }
  if (!name) { formError.value = 'Name is required'; return }
  let value = Number(form.value.value)
  if (dtype === 'open_amount') {
    value = 0
  } else {
    if (Number.isNaN(value) || value < 0) { formError.value = 'Value must be 0 or higher'; return }
    if (dtype === 'percent' && value > 100) { formError.value = 'Percent must be between 0 and 100'; return }
  }

  const payload = { code, name, discount_type: dtype, value }

  submitting.value = true
  try {
    if (editing.value) {
      await discounts.update(editing.value.uuid, payload)
      flash(`Updated ${code}`)
    } else {
      const created = await discounts.create({
        tenant_uuid: auth.tenantUuid || undefined,
        ...payload
      })
      flash(`Created ${created?.code || code}`)
    }
    showForm.value = false
  } catch (e) {
    formError.value = e?.message || 'Failed to save discount'
  } finally {
    submitting.value = false
  }
}

// ─── Delete ───
const confirmDelete = ref({ show: false, disc: null })
function askDelete(d) { confirmDelete.value = { show: true, disc: d } }
async function doDelete() {
  const d = confirmDelete.value.disc
  confirmDelete.value = { show: false, disc: null }
  try {
    await discounts.remove(d.uuid)
    flash(`Deleted ${d.code}`)
  } catch (e) {
    flashError(e, 'Failed to delete discount')
  }
}

// ─── Activate / Deactivate ───
const confirmStatus = ref({ show: false, disc: null, next: '' })
function askToggleStatus(d) {
  const next = d.status === 'active' ? 'inactive' : 'active'
  confirmStatus.value = { show: true, disc: d, next }
}
async function doToggleStatus() {
  const { disc, next } = confirmStatus.value
  confirmStatus.value = { show: false, disc: null, next: '' }
  try {
    await discounts.setStatus(disc.uuid, next)
    flash(`${disc.code} is now ${next}`)
  } catch (e) {
    flashError(e, 'Failed to update status')
  }
}

// ─── Row menu ───
function actionsFor(d) {
  const isActive = d.status === 'active'
  return [
    { label: 'Edit discount', icon: 'edit', onClick: () => openEdit(d) },
    { label: isActive ? 'Deactivate discount' : 'Activate discount',
      icon:  isActive ? 'deactivate' : 'activate',
      variant: isActive ? 'danger' : 'success',
      onClick: () => askToggleStatus(d) },
    { divider: true },
    { label: 'Delete discount', icon: 'trash', variant: 'danger', onClick: () => askDelete(d) }
  ]
}
</script>

<template>
  <div class="flex h-full flex-col gap-4">
    <div class="grid grid-cols-2 gap-3 shrink-0">
      <div class="card"><div class="card-body">
        <div class="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 dark:text-slate-500">Total Discounts</div>
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
          <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">Discounts</div>
          <div class="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
            {{ filtered.length }} shown
            <span v-if="discounts.loading" class="ml-1 text-brand-600">· loading…</span>
          </div>
        </div>
        <MobileFilterBar>
          <input
            v-model="search"
            @keyup.enter="onSearchEnter"
            placeholder="Search code or name… (Enter)"
            class="input w-full sm:w-64"
          />
          <select v-model="typeFilter" @change="onFilterChange" class="input w-full sm:w-44">
            <option value="">All types</option>
            <option v-for="t in TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
          </select>
          <select v-model="statusFilter" @change="onFilterChange" class="input w-full sm:w-36">
            <option value="">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <button class="btn-secondary" @click="loadDiscounts" :disabled="discounts.loading" title="Refresh">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
          </button>
          <template #action>
            <button class="btn-primary" @click="openAdd">+ Add Discount</button>
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
          v-if="discounts.loading && !discounts.items.length"
          :rows="6"
          label="Loading discounts…"
          :columns="['bar','lines','pill','bar','pill','dot']"
        />
        <table class="table" v-else-if="filtered.length">
          <thead class="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800 shadow-[inset_0_-1px_0_theme(colors.slate.100)]">
            <tr>
              <th class="w-24">Code</th>
              <th>Name</th>
              <th>Type</th>
              <th class="text-right">Value</th>
              <th>Status</th>
              <th class="hidden md:table-cell">Created</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in filtered" :key="d.uuid" :class="d.status !== 'active' && 'bg-slate-50/50 dark:bg-slate-800/50'">
              <td class="font-mono text-xs font-semibold">{{ d.code }}</td>
              <td>
                <span class="font-medium text-slate-800 dark:text-slate-100">{{ d.name }}</span>
                <div v-if="d.status !== 'active'" class="text-[10px] font-semibold uppercase tracking-wider text-rose-600">
                  Hidden
                </div>
              </td>
              <td>
                <span class="badge-muted" v-if="d.discount_type === 'percent'">Percent</span>
                <span class="badge-muted" v-else-if="d.discount_type === 'fix'">Fixed amount</span>
                <span class="badge-info"  v-else-if="d.discount_type === 'open_amount'">Open amount</span>
                <span v-else>{{ d.discount_type }}</span>
              </td>
              <td class="text-right font-semibold">
                <span v-if="d.discount_type === 'percent'">{{ Number(d.value) }}%</span>
                <span v-else-if="d.discount_type === 'fix'">{{ money(d.value) }}</span>
                <span v-else class="text-slate-400 dark:text-slate-500 italic">set at use time</span>
              </td>
              <td>
                <span class="badge" :class="d.status === 'active' ? 'badge-success' : 'badge-danger'">
                  <span class="mr-1 inline-block h-1.5 w-1.5 rounded-full"
                        :class="d.status === 'active' ? 'bg-emerald-500' : 'bg-rose-500'"></span>
                  {{ d.status === 'active' ? 'Active' : 'Inactive' }}
                </span>
              </td>
              <td class="hidden md:table-cell text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{{ formatDateTime(d.created_at) }}</td>
              <td class="text-right">
                <RowActionMenu :actions="actionsFor(d)" />
              </td>
            </tr>
          </tbody>
        </table>
        <EmptyState v-else-if="!discounts.loading" title="No discounts" message="Add a discount so it can be applied later." />
      </div>
    </div>

    <Modal :show="showForm" :title="editing ? 'Edit Discount' : 'Add Discount'" size="lg" @close="showForm = false">
      <form id="discForm" @submit.prevent="submit" class="space-y-4">
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label class="label">Code</label>
            <input v-model="form.code" required maxlength="100" placeholder="SC-20" class="input font-mono uppercase" />
          </div>
          <div>
            <label class="label">Name</label>
            <input v-model="form.name" required maxlength="500" placeholder="Senior Citizen 20%" class="input" />
          </div>
          <div>
            <label class="label">Type</label>
            <select v-model="form.discount_type" class="input">
              <option v-for="t in TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
            </select>
          </div>
          <div>
            <label class="label">Value</label>
            <input
              type="number" step="0.01" min="0"
              :max="form.discount_type === 'percent' ? 100 : undefined"
              v-model.number="form.value"
              :required="form.discount_type !== 'open_amount'"
              :disabled="form.discount_type === 'open_amount'"
              :placeholder="form.discount_type === 'open_amount' ? 'Set at use time' : ''"
              class="input"
            />
            <p v-if="form.discount_type === 'percent'" class="mt-1 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
              0–100 percent.
            </p>
            <p v-else-if="form.discount_type === 'fix'" class="mt-1 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
              Fixed peso amount subtracted from the subtotal.
            </p>
            <p v-else class="mt-1 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
              Amount is entered at the moment the discount is applied.
            </p>
          </div>
        </div>

        <div v-if="formError" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ formError }}
        </div>
      </form>
      <template #footer>
        <button class="btn-secondary" :disabled="submitting" @click="showForm = false">Cancel</button>
        <button class="btn-primary" :disabled="submitting" form="discForm" type="submit">
          {{ submitting ? 'Saving…' : (editing ? 'Save' : 'Create') }}
        </button>
      </template>
    </Modal>

    <ConfirmDialog
      :show="confirmStatus.show"
      :title="confirmStatus.next === 'active' ? 'Activate discount' : 'Deactivate discount'"
      :message="confirmStatus.next === 'active'
        ? `Make ${confirmStatus.disc?.code} available again?`
        : `${confirmStatus.disc?.code} will be hidden. Continue?`"
      :confirm-text="confirmStatus.next === 'active' ? 'Activate' : 'Deactivate'"
      :danger="confirmStatus.next !== 'active'"
      @close="confirmStatus = { show: false, disc: null, next: '' }"
      @confirm="doToggleStatus"
    />

    <ConfirmDialog
      :show="confirmDelete.show"
      title="Delete discount"
      :message="confirmDelete.disc
        ? `This will permanently delete ${confirmDelete.disc.code} · ${confirmDelete.disc.name}. This cannot be undone.`
        : ''"
      confirm-text="Delete"
      @close="confirmDelete = { show: false, disc: null }"
      @confirm="doDelete"
    />
  </div>
</template>
