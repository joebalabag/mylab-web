<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useOwnerStore } from '../../stores/owner'
import Modal from '../../components/Modal.vue'
import EmptyState from '../../components/EmptyState.vue'
import SkeletonRows from '../../components/SkeletonRows.vue'
import RowActionMenu from '../../components/RowActionMenu.vue'
import TenantCreateModal from '../../components/TenantCreateModal.vue'
import { money, formatDateTime } from '../../utils/format'
import * as ownerMeApi from '../../api/ownerMe'

const owner = useOwnerStore()
const router = useRouter()

const loading = ref(false)
const tenants = ref([])
const search  = ref('')
const statusFilter = ref('')

const flashMsg = ref('')
let flashTimer = null
function flash(m) {
  flashMsg.value = m
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => flashMsg.value = '', 2500)
}

async function load() {
  loading.value = true
  try {
    const rows = await ownerMeApi.listMyTenants()
    tenants.value = Array.isArray(rows) ? rows : []
  } finally {
    loading.value = false
  }
}
onMounted(load)

const filtered = computed(() => {
  const term = search.value.trim().toLowerCase()
  return tenants.value.filter(t => {
    if (statusFilter.value && t.status !== statusFilter.value) return false
    if (!term) return true
    return (
      t.display_name?.toLowerCase().includes(term) ||
      t.store_code?.toLowerCase().includes(term) ||
      t.branch?.toLowerCase().includes(term)
    )
  })
})

/* ─── Edit tenant modal (owner-scoped, read-only-ish subset) ─── */
const showEdit  = ref(false)
const editing   = ref(null)
const editForm  = ref({})
const editSaving = ref(false)
const editError  = ref('')

function openEdit(t) {
  editing.value = t
  editForm.value = {
    display_name:   t.display_name   || '',
    branch:         t.branch         || '',
    status:         t.status         || 'active',
    contact_number: t.contact_number || '',
    email_address:  t.email_address  || ''
  }
  editError.value = ''
  showEdit.value = true
}
function closeEdit() {
  if (editSaving.value) return
  showEdit.value = false
}
async function saveEdit() {
  editError.value = ''
  const f = editForm.value
  if (!f.display_name.trim()) { editError.value = 'Display name is required.'; return }
  editSaving.value = true
  try {
    const updated = await ownerMeApi.updateMyTenant(editing.value.tenant_uuid, {
      display_name:   f.display_name.trim(),
      branch:         f.branch.trim() || null,
      status:         f.status,
      contact_number: f.contact_number.trim() || null,
      email_address:  f.email_address.trim() || null,
    })
    Object.assign(editing.value, {
      display_name:   updated?.display_name   ?? f.display_name.trim(),
      branch:         updated?.branch         ?? f.branch.trim(),
      status:         updated?.status         ?? f.status,
      contact_number: updated?.contact_number ?? f.contact_number.trim(),
      email_address:  updated?.email_address  ?? f.email_address.trim(),
    })
    showEdit.value = false
    flash(`Saved "${f.display_name.trim()}"`)
  } catch (e) {
    editError.value = e?.message || 'Failed to save tenant'
  } finally {
    editSaving.value = false
  }
}

function openReports(t) {
  router.push({ name: 'owner-tenant-reports', query: { tenant: t.tenant_uuid } })
}
function openMigrations(t) {
  router.push({ name: 'owner-migrations', query: { tenant: t.tenant_uuid } })
}
function openCatalog(t) {
  router.push({ name: 'owner-catalog', query: { tenant: t.tenant_uuid } })
}

/* ─── New tenant ───
   Owners can self-provision a new branch under their own account. The
   TenantCreateModal is reused verbatim (same UI as Super's create flow)
   and locked to this owner via preset_owner_uuid.
   TODO (post-Phase 2): gate by the owner's subscription plan — e.g.
   starter tier caps the number of tenants an owner may run. Needs a
   subscription-tier check against /owner/me (not yet wired). */
const showNewTenant = ref(false)
function openNewTenant()  { showNewTenant.value = true  }
function closeNewTenant() { showNewTenant.value = false }
function onTenantCreated(t) {
  if (!t) return
  tenants.value.push({
    tenant_uuid: t.uuid || t.tenant_uuid || ('t-new-' + Math.random().toString(36).slice(2, 8)),
    display_name: t.display_name,
    store_code:   t.store_code,
    branch:       t.branch || '',
    status:       t.status || 'active',
    // Fresh tenants start with zeroed metrics until the backend produces real data.
    active_users: 0,
    today_tests: 0,
    mtd_revenue: 0,
    pending_requisitions: 0,
    last_result_at: null
  })
  showNewTenant.value = false
  flash(`Tenant "${t.display_name}" created & assigned to you`)
}
</script>

<template>
  <div class="flex h-full flex-col gap-4">
    <div class="card flex flex-1 min-h-0 flex-col overflow-hidden">
      <div class="card-header">
        <div>
          <div class="text-sm font-semibold text-slate-800">My Tenants</div>
          <div class="text-xs text-slate-500">
            {{ filtered.length }} shown
            <span v-if="loading" class="ml-1 text-amber-600">· loading…</span>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button class="btn-secondary !px-3" @click="load" :disabled="loading" title="Refresh">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
          </button>
          <!-- New-tenant creation is intentionally hidden for now — the modal
               + handler stay in this file (openNewTenant, closeNewTenant, the
               `<Modal>` below) and can be re-exposed by removing `v-if="false"`. -->
          <button v-if="false" class="btn-primary" @click="openNewTenant" title="Create a new branch under your owner account">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New tenant
          </button>
        </div>
      </div>

      <div class="grid gap-2 border-b border-slate-100 p-4 grid-cols-1 sm:grid-cols-2">
        <input v-model="search" class="input" placeholder="Search by name, code, branch…" />
        <select v-model="statusFilter" class="input">
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

      <div class="min-h-0 flex-1 overflow-auto">
        <SkeletonRows v-if="loading && !tenants.length" :rows="6" />
        <EmptyState
          v-else-if="!filtered.length"
          title="No tenants found"
          :message="search || statusFilter ? 'Try clearing your filters.' : 'No tenants are assigned to your owner account yet.'"
        />
        <table v-else class="table">
          <thead class="sticky top-0 z-10 bg-slate-50 shadow-[inset_0_-1px_0_theme(colors.slate.100)]">
            <tr>
              <th class="text-left">Tenant</th>
              <th class="text-left hidden md:table-cell">Branch</th>
              <th class="text-right hidden sm:table-cell">Today</th>
              <th class="text-right hidden md:table-cell">Active Users</th>
              <th class="text-right hidden lg:table-cell">MTD Revenue</th>
              <th class="text-left">Status</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in filtered" :key="t.tenant_uuid" class="hover:bg-slate-50/60">
              <td>
                <div class="font-semibold text-slate-800">{{ t.display_name }}</div>
                <div class="text-[11px] text-slate-500 font-mono">{{ t.store_code }}</div>
              </td>
              <td class="hidden md:table-cell">{{ t.branch || '—' }}</td>
              <td class="text-right tabular-nums hidden sm:table-cell">{{ t.today_tests || 0 }}</td>
              <td class="text-right tabular-nums hidden md:table-cell">{{ t.active_users || 0 }}</td>
              <td class="text-right font-semibold tabular-nums hidden lg:table-cell">{{ money(t.mtd_revenue || 0) }}</td>
              <td>
                <span v-if="t.status === 'active'" class="badge-success">Active</span>
                <span v-else class="badge-muted">Inactive</span>
              </td>
              <td class="text-right">
                <RowActionMenu :actions="[
                  { label: 'Edit tenant',       icon: 'edit',  onClick: () => openEdit(t) },
                  { label: 'View reports',      icon: 'eye',   onClick: () => openReports(t) },
                  { label: 'Browse catalog',    icon: 'eye',   onClick: () => openCatalog(t) }
                  // 'Run migrations' row action paired with the hidden
                  // sidebar entry — re-add once Migrations is re-exposed.
                ]" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <Modal :show="showEdit" @close="closeEdit" :title="editing ? `Edit ${editing.display_name}` : 'Edit tenant'" size="md">
      <form class="space-y-4" @submit.prevent="saveEdit">
        <div v-if="editError" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ editError }}
        </div>
        <label class="block">
          <span class="label">Display name</span>
          <input v-model="editForm.display_name" class="input" required />
        </label>
        <label class="block">
          <span class="label">Branch</span>
          <input v-model="editForm.branch" class="input" />
        </label>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label class="block">
            <span class="label">Contact phone</span>
            <input v-model="editForm.contact_number" class="input" />
          </label>
          <label class="block">
            <span class="label">Contact email</span>
            <input v-model="editForm.email_address" type="email" class="input" />
          </label>
        </div>
        <label class="block">
          <span class="label">Status</span>
          <select v-model="editForm.status" class="input">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        <p class="rounded-md border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600">
          Need to change TIN, address, receipts, or subscription? Platform super-admin handles those — contact support.
        </p>
      </form>
      <template #footer>
        <button class="btn-secondary" :disabled="editSaving" @click="closeEdit">Cancel</button>
        <button class="btn-primary" :disabled="editSaving" @click="saveEdit">
          {{ editSaving ? 'Saving…' : 'Save changes' }}
        </button>
      </template>
    </Modal>

    <!-- New tenant modal — identical UI to Super's create flow, auto-assigned to this owner.
         Subscription-tier gating will be layered on top later. -->
    <TenantCreateModal
      :show="showNewTenant"
      :preset-owner-uuid="owner.ownerUuid"
      @close="closeNewTenant"
      @created="onTenantCreated"
    />
  </div>
</template>
