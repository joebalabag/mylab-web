<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useUsersStore } from '../../stores/users'
import * as tenantsApi from '../../api/tenants'
import Modal from '../../components/Modal.vue'
import ConfirmDialog from '../../components/ConfirmDialog.vue'
import EmptyState from '../../components/EmptyState.vue'
import RowActionMenu from '../../components/RowActionMenu.vue'
import SkeletonRows from '../../components/SkeletonRows.vue'
import { formatDateTime } from '../../utils/format'
import { loadUserAccess, saveUserAccess as saveUserAccessLocal, clearUserAccess } from '../../utils/access'
import * as userAccessApi from '../../api/userAccess'
import { useAccessTemplateStore } from '../../stores/accessTemplate'

const accessTemplate = useAccessTemplateStore()

const users = useUsersStore()

const ROLES = [
  { value: 'manager',     label: 'Manager' },
  { value: 'cashier',     label: 'Cashier' },
  { value: 'stock_clerk', label: 'Stock Clerk' },
  { value: 'staff',       label: 'Staff' }
]
const roleLabel = (r) => ROLES.find(x => x.value === r)?.label || r || '—'

/* ─── Tenant picker (for filter + create) ─── */
const tenants        = ref([])
const tenantsLoading = ref(false)
const tenantsError   = ref('')
async function loadTenants() {
  tenantsLoading.value = true
  tenantsError.value = ''
  try {
    const res = await tenantsApi.listTenants({ page_size: 500 })
    tenants.value = Array.isArray(res?.results) ? res.results : []
  } catch (e) {
    tenantsError.value = e?.message || 'Failed to load tenants'
  } finally {
    tenantsLoading.value = false
  }
}
const tenantsByUuid = computed(() => {
  const m = {}
  for (const t of tenants.value) m[t.uuid] = t
  return m
})
function tenantLabel(uuid) {
  const t = tenantsByUuid.value[uuid]
  if (!t) return uuid ? `Tenant ${String(uuid).slice(0, 8)}…` : '—'
  return t.display_name || t.store_code || uuid
}

/* ─── Filters ─── */
const tenantScope  = ref('all')     // 'all' | 'specific'
const tenantUuid   = ref('')
const search       = ref('')
const roleFilter   = ref('')
const statusFilter = ref('')

// Mobile-only collapse — the six-column filter row is the tallest thing on
// this page on a phone, so hide it by default and let the user tap to expand.
// Tablet/desktop always show it inline.
const filtersOpen = ref(false)
const filtersSummary = computed(() => {
  const parts = []
  if (tenantScope.value === 'specific') {
    parts.push(tenantUuid.value ? tenantLabel(tenantUuid.value) : 'No tenant picked')
  } else {
    parts.push('All tenants')
  }
  if (roleFilter.value)   parts.push(roleLabel(roleFilter.value))
  if (statusFilter.value) parts.push(statusFilter.value === 'active' ? 'Active' : 'Inactive')
  if (search.value.trim()) parts.push(`"${search.value.trim()}"`)
  return parts.join(' · ')
})

const listError = ref('')

async function loadUsers() {
  listError.value = ''
  users.setFilters({
    tenant_uuid: tenantScope.value === 'specific' ? tenantUuid.value : '',
    keywords:    search.value.trim(),
    role:        roleFilter.value,
    status:      statusFilter.value ? [statusFilter.value] : []
  })
  if (tenantScope.value === 'specific' && !tenantUuid.value) {
    users.items = []
    users.total = 0
    listError.value = 'Pick a tenant to see its users.'
    return
  }
  try {
    await users.fetch()
  } catch (e) {
    listError.value = e?.message || 'Failed to load users'
  }
}

function onFilterChange() { loadUsers() }
let searchTimer = null
watch(search, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(loadUsers, 300)
})
watch(tenantScope, (v) => {
  if (v === 'all') tenantUuid.value = ''
  loadUsers()
})
watch(tenantUuid, () => {
  if (tenantScope.value === 'specific') loadUsers()
})

onMounted(async () => {
  await loadTenants()
  await loadUsers()
})

const filtered = computed(() => users.visibleItems)

/* ─── Toast ─── */
const toast = ref('')
const toastTone = ref('emerald')
let toastTimer = null
function flash(m, tone = 'emerald') {
  toast.value = m
  toastTone.value = tone
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 2500)
}
function flashError(e, fallback) {
  flash(e?.message || fallback || 'Something went wrong', 'rose')
}

/* ─── Add / Edit ─── */
const showForm = ref(false)
const editing  = ref(null)
const form = ref({
  tenant_uuid: '',
  name: '',
  username: '',
  email: '',
  role: 'cashier',
  password: '',
  confirm_password: ''
})
const formError = ref('')
const submitting = ref(false)

function openAdd() {
  editing.value = null
  form.value = {
    tenant_uuid: tenantScope.value === 'specific' ? tenantUuid.value : '',
    name: '', username: '', email: '', role: 'cashier',
    password: '', confirm_password: ''
  }
  formError.value = ''
  showForm.value = true
}
function openEdit(u) {
  editing.value = u
  form.value = {
    tenant_uuid: u.tenant_uuid || '',
    name: u.name || '',
    username: u.username || '',
    email: u.email || '',
    role: u.role || 'cashier',
    password: '',
    confirm_password: ''
  }
  formError.value = ''
  showForm.value = true
}

async function submit() {
  formError.value = ''
  if (!editing.value && !form.value.tenant_uuid) {
    formError.value = 'Pick a tenant for this user.'
    return
  }
  if (!form.value.name.trim()) { formError.value = 'Full name is required'; return }
  if (!editing.value) {
    if (!form.value.username.trim() || form.value.username.trim().length < 3) {
      formError.value = 'Username must be at least 3 characters'; return
    }
    if (!form.value.password || form.value.password.length < 6) {
      formError.value = 'Password must be at least 6 characters'; return
    }
    if (form.value.password !== form.value.confirm_password) {
      formError.value = 'Passwords do not match'; return
    }
  }

  submitting.value = true
  try {
    if (editing.value) {
      await users.update(editing.value.uuid, {
        name: form.value.name.trim(),
        email: form.value.email.trim() || undefined,
        role: form.value.role
      })
      flash(`Updated ${editing.value.username}`)
    } else {
      const created = await users.create({
        tenant_uuid: form.value.tenant_uuid,
        username: form.value.username.trim(),
        password: form.value.password,
        confirm_password: form.value.confirm_password,
        name: form.value.name.trim(),
        email: form.value.email.trim() || undefined,
        role: form.value.role
      })
      flash(`Created ${created?.username || form.value.username}`)
    }
    showForm.value = false
    await loadUsers()
  } catch (e) {
    formError.value = e?.message || 'Failed to save user'
  } finally {
    submitting.value = false
  }
}

/* ─── Change password ─── */
const showPassword = ref(false)
const passwordUser = ref(null)
const passwordForm = ref({ new: '', confirm: '' })
const passwordError = ref('')
const passwordBusy = ref(false)

function openPassword(u) {
  passwordUser.value = u
  passwordForm.value = { new: '', confirm: '' }
  passwordError.value = ''
  showPassword.value = true
}
async function submitPassword() {
  passwordError.value = ''
  const { new: np, confirm: cp } = passwordForm.value
  if (np.length < 6) { passwordError.value = 'Password must be at least 6 characters'; return }
  if (np !== cp)     { passwordError.value = 'Passwords do not match'; return }
  passwordBusy.value = true
  try {
    await users.changePassword(passwordUser.value.uuid, np, cp)
    flash(`Password updated for ${passwordUser.value.username}`)
    showPassword.value = false
  } catch (e) {
    passwordError.value = e?.message || 'Failed to change password'
  } finally {
    passwordBusy.value = false
  }
}

/* ─── Activate / Deactivate ─── */
const confirmStatus = ref({ show: false, user: null, next: '' })
function askToggleStatus(u) {
  const next = u.status === 'active' ? 'inactive' : 'active'
  confirmStatus.value = { show: true, user: u, next }
}
async function doToggleStatus() {
  const { user, next } = confirmStatus.value
  confirmStatus.value = { show: false, user: null, next: '' }
  try {
    await users.setStatus(user.uuid, next)
    flash(`${user.username} is now ${next}`)
  } catch (e) {
    flashError(e, 'Failed to update status')
  }
}

/* ─── Delete ─── */
const confirmDelete = ref({ show: false, user: null })
function askDelete(u) { confirmDelete.value = { show: true, user: u } }
async function doDelete() {
  const target = confirmDelete.value.user
  confirmDelete.value = { show: false, user: null }
  try {
    await users.remove(target.uuid)
    clearUserAccess(target.uuid)
    flash(`Deleted ${target.username}`)
  } catch (e) {
    flashError(e, 'Failed to delete user')
  }
}

/* ─── Assign Access ─── */
const showAccess = ref(false)
const accessUser = ref(null)
const accessKeys = ref([])          // array of navigation_id numbers
const accessSaving = ref(false)
const accessLoadError = ref('')

const accessSet = computed(() => new Set(accessKeys.value))
const accessTree = computed(() => accessTemplate.tree)

function normalizeUserAccessResponse(res) {
  const list = Array.isArray(res?.items)   ? res.items
             : Array.isArray(res?.results) ? res.results
             : Array.isArray(res)          ? res
             : []
  const ids = []
  for (const row of list) {
    if (row == null) continue
    if (typeof row === 'number') { ids.push(row); continue }
    const id = Number(row.navigation_id ?? row.id)
    if (!Number.isFinite(id)) continue
    if (row.has_access === false) continue
    ids.push(id)
  }
  return ids
}

async function openAccess(u) {
  accessUser.value = u
  accessKeys.value = loadUserAccess(u.uuid)
  accessLoadError.value = ''
  showAccess.value = true
  try {
    const [_, res] = await Promise.all([
      accessTemplate.fetch(),
      userAccessApi.getUserAccess(u.uuid)
    ])
    accessKeys.value = normalizeUserAccessResponse(res)
  } catch (e) {
    accessLoadError.value = e?.message || 'Failed to load user access'
  }
}

function toggleAccess(navId) {
  const s = new Set(accessKeys.value)
  if (s.has(navId)) s.delete(navId)
  else s.add(navId)
  accessKeys.value = Array.from(s)
}
function moduleIds(mod) {
  return accessTemplate.moduleNavigationIds(mod)
}
function toggleAccessModule(mod) {
  const s = new Set(accessKeys.value)
  const ids = moduleIds(mod)
  const allOn = ids.every(id => s.has(id))
  for (const id of ids) {
    if (allOn) s.delete(id)
    else s.add(id)
  }
  accessKeys.value = Array.from(s)
}
function toggleAccessGroup(group) {
  const s = new Set(accessKeys.value)
  const ids = group.modules.flatMap(m => moduleIds(m))
  const allOn = ids.every(id => s.has(id))
  for (const id of ids) {
    if (allOn) s.delete(id)
    else s.add(id)
  }
  accessKeys.value = Array.from(s)
}
function moduleState(mod) {
  const s = new Set(accessKeys.value)
  const ids = moduleIds(mod)
  const on = ids.filter(id => s.has(id)).length
  if (on === 0) return 'none'
  if (on === ids.length) return 'all'
  return 'some'
}
function groupState(group) {
  const s = new Set(accessKeys.value)
  const ids = group.modules.flatMap(m => moduleIds(m))
  const on = ids.filter(id => s.has(id)).length
  if (on === 0) return 'none'
  if (on === ids.length) return 'all'
  return 'some'
}
function isModuleActive(mod) {
  return accessTemplate.isModuleActive(accessKeys.value, mod)
}
function selectAllAccess()  { accessKeys.value = [...accessTemplate.allNavigationIds] }
function clearAllAccess()   { accessKeys.value = [] }

async function submitAccess() {
  if (!accessUser.value?.uuid) return
  accessSaving.value = true
  accessLoadError.value = ''
  try {
    const granted = new Set(accessKeys.value)
    const items = accessTemplate.allNavigationIds.map(id => ({
      navigation_id: id,
      has_access:   granted.has(id)
    }))
    await userAccessApi.saveUserAccess(accessUser.value.uuid, items)
    saveUserAccessLocal(accessUser.value.uuid, accessKeys.value)
    flash(`Access saved for ${accessUser.value.username}`)
    showAccess.value = false
  } catch (e) {
    accessLoadError.value = e?.message || 'Failed to save access'
  } finally {
    accessSaving.value = false
  }
}

function actionsFor(u) {
  const isActive = u.status === 'active'
  return [
    { label: 'Edit user',        icon: 'edit',     onClick: () => openEdit(u) },
    { label: 'Change password',  icon: 'password', onClick: () => openPassword(u) },
    { label: 'Assign access',    icon: 'edit',     onClick: () => openAccess(u) },
    { label: isActive ? 'Deactivate user' : 'Activate user',
      icon:  isActive ? 'deactivate' : 'activate',
      variant: isActive ? 'danger' : 'success',
      onClick: () => askToggleStatus(u) },
    { divider: true },
    { label: 'Delete user', icon: 'trash', variant: 'danger',
      onClick: () => askDelete(u) }
  ]
}
</script>

<template>
  <div class="flex h-full flex-col gap-4">
    <div class="card flex flex-1 min-h-0 flex-col overflow-hidden">
      <div class="card-header">
        <div>
          <div class="text-sm font-semibold text-slate-800">Tenant Users</div>
          <div class="text-xs text-slate-500">
            {{ filtered.length }} of {{ users.total }} shown
            <span v-if="users.loading" class="ml-1 text-brand-600">· loading…</span>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button class="btn-secondary !px-3" @click="loadUsers" :disabled="users.loading" title="Refresh">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
          </button>
          <button class="btn-primary" @click="openAdd">+ Add User</button>
        </div>
      </div>

      <!-- Mobile-only collapse toggle. sm:hidden so tablet/desktop always
           show the filter body inline. Matches the ReportsView pattern. -->
      <button
        type="button"
        class="flex w-full items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2 text-left text-sm text-slate-700 sm:hidden"
        :aria-expanded="filtersOpen"
        aria-controls="tenant-users-filters"
        @click="filtersOpen = !filtersOpen"
      >
        <span class="flex min-w-0 items-center gap-2">
          <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0 text-slate-500" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
          <b class="shrink-0">Filters</b>
          <span class="truncate text-xs font-normal text-slate-500">· {{ filtersSummary }}</span>
        </span>
        <svg viewBox="0 0 24 24"
             class="h-4 w-4 shrink-0 text-slate-500 transition-transform"
             :class="filtersOpen && 'rotate-180'"
             fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      <!-- Filters -->
      <div
        id="tenant-users-filters"
        class="gap-2 border-b border-slate-100 p-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-6"
        :class="filtersOpen ? 'grid' : 'hidden sm:grid'"
      >
        <div class="lg:col-span-2">
          <label class="label">Tenant scope</label>
          <div class="flex gap-2">
            <label class="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm transition"
                   :class="tenantScope === 'all'
                           ? 'border-indigo-500 bg-indigo-50 font-semibold text-indigo-700'
                           : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300'">
              <input v-model="tenantScope" type="radio" value="all" class="sr-only" />
              All tenants
            </label>
            <label class="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm transition"
                   :class="tenantScope === 'specific'
                           ? 'border-indigo-500 bg-indigo-50 font-semibold text-indigo-700'
                           : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300'">
              <input v-model="tenantScope" type="radio" value="specific" class="sr-only" />
              Specific tenant
            </label>
          </div>
        </div>

        <div class="lg:col-span-2">
          <label class="label">
            Tenant
            <span v-if="tenantScope === 'specific'" class="text-rose-500">*</span>
          </label>
          <select v-model="tenantUuid" class="input" :disabled="tenantScope !== 'specific' || tenantsLoading">
            <option value="">
              {{ tenantScope === 'specific'
                 ? (tenantsLoading ? 'Loading tenants…' : 'Choose a tenant…')
                 : 'All tenants' }}
            </option>
            <option v-for="t in tenants" :key="t.uuid" :value="t.uuid">
              {{ t.display_name || t.store_code }}<span v-if="t.store_code"> · {{ t.store_code }}</span>
            </option>
          </select>
          <p v-if="tenantsError" class="mt-1 text-[11px] text-rose-600">{{ tenantsError }}</p>
        </div>

        <div>
          <label class="label">Role</label>
          <select v-model="roleFilter" @change="onFilterChange" class="input">
            <option value="">All roles</option>
            <option v-for="r in ROLES" :key="r.value" :value="r.value">{{ r.label }}</option>
          </select>
        </div>

        <div>
          <label class="label">Status</label>
          <select v-model="statusFilter" @change="onFilterChange" class="input">
            <option value="">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <div class="sm:col-span-2 lg:col-span-6">
          <label class="label">Search</label>
          <input v-model="search" class="input" placeholder="Name, username, email…" />
        </div>
      </div>

      <transition name="fade">
        <div v-if="toast" class="border-b px-4 py-2 text-sm"
             :class="toastTone === 'emerald'
                     ? 'border-emerald-100 bg-emerald-50 text-emerald-800'
                     : 'border-rose-100 bg-rose-50 text-rose-800'">
          {{ toast }}
        </div>
      </transition>
      <div v-if="listError" class="border-b border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        {{ listError }}
      </div>

      <div class="min-h-0 flex-1 overflow-auto">
        <SkeletonRows
          v-if="users.loading && !users.items.length"
          :rows="8"
          label="Loading users…"
          :columns="['avatar','lines','wide','bar','pill','dot']"
        />
        <table class="table" v-else-if="filtered.length">
          <thead class="sticky top-0 z-10 bg-slate-50 shadow-[inset_0_-1px_0_theme(colors.slate.100)]">
            <tr>
              <th>Name</th>
              <th>Tenant</th>
              <th>Username</th>
              <th class="hidden md:table-cell">Email</th>
              <th>Role</th>
              <th>Status</th>
              <th class="hidden lg:table-cell">Last login</th>
              <th class="hidden md:table-cell">Created</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in filtered" :key="u.uuid">
              <td>
                <div class="flex items-center gap-3">
                  <div class="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-xs font-bold">
                    {{ (u.name || u.username || '?').charAt(0).toUpperCase() }}
                  </div>
                  <div>
                    <div class="font-medium text-slate-800">{{ u.name }}</div>
                    <div v-if="u.status !== 'active'" class="text-[10px] font-semibold uppercase tracking-wider text-rose-600">
                      Sign-in disabled
                    </div>
                  </div>
                </div>
              </td>
              <td>
                <div class="max-w-[16ch] truncate text-sm text-slate-800">
                  {{ tenantLabel(u.tenant_uuid) }}
                </div>
                <div v-if="tenantsByUuid[u.tenant_uuid]?.store_code"
                     class="font-mono text-[10px] text-slate-500">
                  {{ tenantsByUuid[u.tenant_uuid].store_code }}
                </div>
              </td>
              <td class="font-mono text-xs">{{ u.username }}</td>
              <td class="hidden md:table-cell text-slate-600">{{ u.email || '—' }}</td>
              <td><span class="badge-info">{{ roleLabel(u.role) }}</span></td>
              <td>
                <span class="badge" :class="u.status === 'active' ? 'badge-success' : 'badge-danger'">
                  <span class="mr-1 inline-block h-1.5 w-1.5 rounded-full"
                        :class="u.status === 'active' ? 'bg-emerald-500' : 'bg-rose-500'"></span>
                  {{ u.status === 'active' ? 'Active' : 'Inactive' }}
                </span>
              </td>
              <td class="hidden lg:table-cell text-xs text-slate-500">{{ formatDateTime(u.last_logindate) }}</td>
              <td class="hidden md:table-cell text-xs text-slate-500">{{ formatDateTime(u.created_at) }}</td>
              <td class="text-right">
                <RowActionMenu :actions="actionsFor(u)" />
              </td>
            </tr>
          </tbody>
        </table>
        <EmptyState v-else-if="!users.loading"
                    title="No users found"
                    message="Adjust filters or add a new user." />
      </div>
    </div>

    <!-- Add / Edit -->
    <Modal :show="showForm" :title="editing ? 'Edit User' : 'Add User'" size="md" @close="showForm = false">
      <form id="tenantUserForm" @submit.prevent="submit" class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div class="sm:col-span-2">
          <label class="label">Tenant *</label>
          <select v-model="form.tenant_uuid" class="input" :disabled="!!editing">
            <option value="">Choose a tenant…</option>
            <option v-for="t in tenants" :key="t.uuid" :value="t.uuid">
              {{ t.display_name || t.store_code }}<span v-if="t.store_code"> · {{ t.store_code }}</span>
            </option>
          </select>
          <p v-if="editing" class="mt-1 text-[11px] text-slate-500">Tenant assignment cannot be changed after creation.</p>
        </div>
        <div class="sm:col-span-2">
          <label class="label">Full name</label>
          <input v-model="form.name" required class="input" />
        </div>
        <div>
          <label class="label">Username</label>
          <input v-model="form.username" :disabled="!!editing" required minlength="3" class="input font-mono" />
          <p v-if="editing" class="mt-1 text-[11px] text-slate-500">Username cannot be changed after creation.</p>
        </div>
        <div>
          <label class="label">Email</label>
          <input type="email" v-model="form.email" class="input" />
        </div>
        <div>
          <label class="label">Role</label>
          <select v-model="form.role" class="input">
            <option v-for="r in ROLES" :key="r.value" :value="r.value">{{ r.label }}</option>
          </select>
        </div>
        <div v-if="!editing" class="sm:col-span-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label class="label">Password</label>
            <input type="password" v-model="form.password" required minlength="6" autocomplete="new-password" class="input" />
            <p class="mt-1 text-[11px] text-slate-500">Minimum 6 characters.</p>
          </div>
          <div>
            <label class="label">Confirm password</label>
            <input type="password" v-model="form.confirm_password" required minlength="6" autocomplete="new-password" class="input" />
          </div>
        </div>
        <div v-else class="sm:col-span-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Passwords are changed from the row action <b>Change password</b>.
        </div>

        <div v-if="formError" class="sm:col-span-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ formError }}
        </div>
      </form>
      <template #footer>
        <button class="btn-secondary" :disabled="submitting" @click="showForm = false">Cancel</button>
        <button class="btn-primary" :disabled="submitting" form="tenantUserForm" type="submit">
          {{ submitting ? 'Saving…' : (editing ? 'Save changes' : 'Create user') }}
        </button>
      </template>
    </Modal>

    <!-- Change password -->
    <Modal :show="showPassword" title="Change Password" size="sm" @close="showPassword = false">
      <div v-if="passwordUser" class="mb-3 rounded-md bg-slate-50 px-3 py-2 text-sm">
        <div class="text-xs uppercase tracking-wide text-slate-500">Account</div>
        <div class="font-semibold text-slate-800">
          {{ passwordUser.name }} <span class="font-mono text-xs text-slate-500">· {{ passwordUser.username }}</span>
        </div>
        <div v-if="passwordUser.last_change_password" class="mt-1 text-xs text-slate-500">
          Last changed: {{ formatDateTime(passwordUser.last_change_password) }}
        </div>
      </div>

      <form id="tenantUserPwForm" @submit.prevent="submitPassword" class="space-y-3">
        <div>
          <label class="label">New password</label>
          <input type="password" v-model="passwordForm.new" required minlength="6" autocomplete="new-password" class="input" />
          <p class="mt-1 text-xs text-slate-500">Minimum 6 characters.</p>
        </div>
        <div>
          <label class="label">Confirm new password</label>
          <input type="password" v-model="passwordForm.confirm" required minlength="6" autocomplete="new-password" class="input" />
        </div>
        <div v-if="passwordError" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ passwordError }}
        </div>
      </form>

      <template #footer>
        <button class="btn-secondary" :disabled="passwordBusy" @click="showPassword = false">Cancel</button>
        <button class="btn-primary" :disabled="passwordBusy" form="tenantUserPwForm" type="submit">
          {{ passwordBusy ? 'Saving…' : 'Update password' }}
        </button>
      </template>
    </Modal>

    <ConfirmDialog
      :show="confirmStatus.show"
      :title="confirmStatus.next === 'active' ? 'Activate user' : 'Deactivate user'"
      :message="confirmStatus.next === 'active'
        ? `Re-enable sign-in for ${confirmStatus.user?.username}?`
        : `${confirmStatus.user?.username} will no longer be able to sign in. Continue?`"
      :confirm-text="confirmStatus.next === 'active' ? 'Activate' : 'Deactivate'"
      :danger="confirmStatus.next !== 'active'"
      @close="confirmStatus = { show: false, user: null, next: '' }"
      @confirm="doToggleStatus"
    />
    <ConfirmDialog
      :show="confirmDelete.show"
      title="Delete user"
      :message="confirmDelete.user
        ? `This will permanently remove @${confirmDelete.user.username}. This cannot be undone.`
        : ''"
      confirm-text="Delete"
      @close="confirmDelete = { show: false, user: null }"
      @confirm="doDelete"
    />

    <!-- Assign Access -->
    <Modal :show="showAccess"
           :title="accessUser ? `Assign access — ${accessUser.name || accessUser.username}` : 'Assign access'"
           size="lg"
           @close="showAccess = false">
      <div v-if="accessUser" class="space-y-4">
        <div v-if="accessLoadError"
             class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ accessLoadError }}
        </div>
        <div v-if="accessTemplate.loading && !accessTree.length"
             class="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Loading access template…
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
          <div class="text-slate-600">
            <b>{{ accessKeys.length }}</b> access item{{ accessKeys.length === 1 ? '' : 's' }} selected
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn-ghost !text-xs" @click="selectAllAccess">Select all</button>
            <button type="button" class="btn-ghost !text-xs" @click="clearAllAccess">Clear all</button>
          </div>
        </div>

        <div class="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
          <div v-for="group in accessTree" :key="group.key"
               class="rounded-lg border border-slate-200 bg-white">
            <div class="flex items-center justify-between border-b border-slate-100 px-3 py-2">
              <div class="min-w-0">
                <div class="text-sm font-semibold capitalize text-slate-800">{{ group.label }}</div>
              </div>
              <label class="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                <input type="checkbox"
                       class="h-4 w-4 rounded border-slate-300"
                       :checked="groupState(group) === 'all'"
                       :indeterminate.prop="groupState(group) === 'some'"
                       @change="toggleAccessGroup(group)" />
                <span class="font-semibold">All</span>
              </label>
            </div>

            <div class="divide-y divide-slate-100">
              <div v-for="mod in group.modules" :key="mod.key" class="p-3">
                <label v-if="!Array.isArray(mod.actions)"
                       class="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1 text-sm text-slate-700 hover:bg-slate-50">
                  <input type="checkbox"
                         class="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300"
                         :checked="accessSet.has(mod.navigation_id)"
                         @change="toggleAccess(mod.navigation_id)" />
                  <span class="min-w-0 flex-1">
                    <span class="block font-medium capitalize leading-tight text-slate-800">{{ mod.label }}</span>
                    <span v-if="mod.remarks" class="block text-[11px] text-slate-500">{{ mod.remarks }}</span>
                  </span>
                  <span class="font-mono text-[10px] text-slate-400">#{{ mod.navigation_id }}</span>
                </label>

                <template v-else>
                  <div class="mb-2 flex items-center gap-2">
                    <label class="inline-flex cursor-pointer items-center gap-2">
                      <input type="checkbox"
                             class="h-4 w-4 rounded border-slate-300"
                             :checked="moduleState(mod) === 'all'"
                             :indeterminate.prop="moduleState(mod) === 'some'"
                             @change="toggleAccessModule(mod)" />
                      <span class="text-sm font-semibold capitalize text-slate-800">{{ mod.label }}</span>
                    </label>
                    <span v-if="isModuleActive(mod)"
                          class="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"
                          title="Menu is visible because at least one sub-action is checked.">
                      <svg viewBox="0 0 24 24" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="2.5"
                           stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      Menu visible
                    </span>
                  </div>
                  <div class="ml-6 grid grid-cols-1 gap-0.5 sm:grid-cols-2">
                    <label v-for="a in mod.actions" :key="a.navigation_id"
                           class="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1 text-sm text-slate-700 hover:bg-slate-50">
                      <input type="checkbox"
                             class="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300"
                             :checked="accessSet.has(a.navigation_id)"
                             @change="toggleAccess(a.navigation_id)" />
                      <span class="min-w-0 flex-1">
                        <span class="block capitalize leading-tight">{{ a.label }}</span>
                        <span v-if="a.remarks" class="block text-[11px] text-slate-500">{{ a.remarks }}</span>
                      </span>
                      <span class="font-mono text-[10px] text-slate-400">#{{ a.navigation_id }}</span>
                    </label>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" :disabled="accessSaving" @click="showAccess = false">Cancel</button>
        <button class="btn-primary" :disabled="accessSaving" @click="submitAccess">
          {{ accessSaving ? 'Saving…' : 'Save access' }}
        </button>
      </template>
    </Modal>
  </div>
</template>
