<script setup>
import { computed, onMounted, ref } from 'vue'
import { useUsersStore } from '../stores/users'
import { useAuthStore } from '../stores/auth'
import { useTenantStore } from '../stores/tenant'
import Modal from '../components/Modal.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import EmptyState from '../components/EmptyState.vue'
import RowActionMenu from '../components/RowActionMenu.vue'
import SkeletonRows from '../components/SkeletonRows.vue'
import MobileFilterBar from '../components/MobileFilterBar.vue'
import { formatDateTime } from '../utils/format'
import { loadUserAccess, saveUserAccess, clearUserAccess } from '../utils/access'
import * as userAccessApi from '../api/userAccess'
import { checkUsernameAvailable } from '../api/users'
import { useAccessTemplateStore } from '../stores/accessTemplate'

const accessTemplate = useAccessTemplateStore()

const users = useUsersStore()
const auth  = useAuthStore()
const tenant = useTenantStore()

// A module in the assign-access tree is "plan-locked" when its main_navigation
// maps to a POS module the tenant's current subscription plan doesn't include.
// Non-POS modules (Products, Reports, Users, etc.) are never locked.
function isModulePlanLocked(mod) {
  return !tenant.planAllowsMainNav(mod?.label || '')
}

const ROLES = [
  { value: 'manager',     label: 'Manager' },
  { value: 'cashier',     label: 'Cashier' },
  { value: 'stock_clerk', label: 'Stock Clerk' },
  { value: 'staff',       label: 'Staff' }
]
const roleLabel = (r) => ROLES.find(x => x.value === r)?.label || r || '—'

const search       = ref('')
const roleFilter   = ref('')
const statusFilter = ref('')     // '', 'active', 'inactive'

// Data + errors
const listError = ref('')

async function loadUsers() {
  listError.value = ''
  users.setFilters({
    tenant_uuid: auth.tenantUuid || '',
    keywords: search.value.trim(),
    role: roleFilter.value,
    status: statusFilter.value ? [statusFilter.value] : []
  })
  try {
    await users.fetch()
  } catch (e) {
    listError.value = e?.message || 'Failed to load users'
  }
}

function onSearchEnter() { loadUsers() }
function onFilterChange() { loadUsers() }

onMounted(loadUsers)

const filtered = computed(() => users.visibleItems)

// ─── Toast ───
const toast = ref('')
const toastTone = ref('emerald')   // emerald | rose
let toastTimer = null
function flash(m, tone = 'emerald') {
  toast.value = m
  toastTone.value = tone
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.value = '', 2500)
}
function flashError(e, fallback) {
  const msg = e?.message || fallback || 'Something went wrong'
  flash(msg, 'rose')
}

// ─── Add / Edit ───
const showForm = ref(false)
const editing  = ref(null)
const form = ref({
  name: '',
  username: '',
  email: '',
  role: 'cashier',
  license_number: '',
  lab_display_name: '',
  password: '',
  confirm_password: ''
})
const formError = ref('')
const submitting = ref(false)

// Live username availability. `probeToken` is bumped for each blur so a
// slow response from an earlier probe can't overwrite a newer one.
const usernameStatus = ref('idle') // 'idle' | 'checking' | 'available' | 'taken' | 'too_short' | 'error'
let probeToken = 0
function resetUsernameStatus() {
  usernameStatus.value = 'idle'
  probeToken++
}
async function checkUsername() {
  if (editing.value) return // username is immutable on edit
  const u = (form.value.username || '').trim()
  if (u.length < 3) { usernameStatus.value = 'too_short'; return }
  const my = ++probeToken
  usernameStatus.value = 'checking'
  try {
    const res = await checkUsernameAvailable(u)
    if (my !== probeToken) return
    usernameStatus.value = res?.available ? 'available' : 'taken'
  } catch {
    if (my !== probeToken) return
    usernameStatus.value = 'error'
  }
}

function openAdd() {
  editing.value = null
  form.value = { name: '', username: '', email: '', role: 'cashier', license_number: '', lab_display_name: '', password: '', confirm_password: '' }
  formError.value = ''
  resetUsernameStatus()
  showForm.value = true
}
function openEdit(u) {
  editing.value = u
  form.value = {
    name: u.name || '',
    username: u.username || '',
    email: u.email || '',
    role: u.role || 'cashier',
    license_number: u.license_number || '',
    lab_display_name: u.lab_display_name || '',
    password: '',
    confirm_password: ''
  }
  formError.value = ''
  resetUsernameStatus()
  showForm.value = true
}

async function submit() {
  formError.value = ''
  if (!form.value.name.trim()) { formError.value = 'Full name is required'; return }
  if (!editing.value) {
    if (!form.value.username.trim() || form.value.username.trim().length < 3) {
      formError.value = 'Username must be at least 3 characters'; return
    }
    if (usernameStatus.value === 'taken') {
      formError.value = 'That username is already taken. Pick a different one.'; return
    }
    if (usernameStatus.value === 'checking') {
      formError.value = 'Still checking username availability — try again in a moment.'; return
    }
    if (!form.value.password || form.value.password.length < 6) {
      formError.value = 'Password must be at least 6 characters'; return
    }
    if (form.value.password !== form.value.confirm_password) {
      formError.value = 'Passwords do not match'; return
    }
    if (!auth.tenantUuid) {
      formError.value = 'Your session is missing a tenant — sign in again'; return
    }
  }

  submitting.value = true
  try {
    if (editing.value) {
      await users.update(editing.value.uuid, {
        name: form.value.name.trim(),
        email: form.value.email.trim() || null,
        role: form.value.role,
        license_number: form.value.license_number.trim() || null,
        lab_display_name: form.value.lab_display_name.trim() || null,
      })
      flash(`Updated ${editing.value.username}`)
    } else {
      const created = await users.create({
        tenant_uuid: auth.tenantUuid,
        username: form.value.username.trim(),
        password: form.value.password,
        confirm_password: form.value.confirm_password,
        name: form.value.name.trim(),
        email: form.value.email.trim() || null,
        role: form.value.role,
        license_number: form.value.license_number.trim() || null,
        lab_display_name: form.value.lab_display_name.trim() || null,
      })
      flash(`Created ${created?.username || form.value.username}`)
    }
    showForm.value = false
  } catch (e) {
    formError.value = e?.message || 'Failed to save user'
  } finally {
    submitting.value = false
  }
}

// ─── Change Password (admin from dashboard) ───
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

// ─── Activate / Deactivate ───
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

// ─── Delete ───
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

// ─── Assign Access ───
const showAccess = ref(false)
const accessUser = ref(null)
const accessKeys = ref([])   // array of navigation_id numbers
const accessSaving = ref(false)
const accessLoadError = ref('')

const accessSet = computed(() => new Set(accessKeys.value))
const accessTree = computed(() => accessTemplate.tree)

// Normalize whatever the GET endpoint returns into a plain number[] of the
// granted navigation_ids. Accepts several likely response shapes.
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
    // Rows with has_access:false mean "revoked" — skip them. When has_access
    // is missing (raw id lists), assume granted.
    if (row.has_access === false) continue
    ids.push(id)
  }
  return ids
}

async function openAccess(u) {
  accessUser.value = u
  // Optimistic default: whatever the local cache had, so the modal opens with
  // sensible checkboxes while the API call is in flight.
  accessKeys.value = loadUserAccess(u.uuid)
  accessLoadError.value = ''
  showAccess.value = true

  // Template + user grants in parallel — both are needed to render the modal.
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
// Every navigation_id living under a plan-locked module — used to skip locked
// rows during bulk toggles (group "Select all", module header checkbox) so an
// upgrade-required action can't sneak in through a parent tick.
const lockedNavIdSet = computed(() => {
  const ids = new Set()
  for (const g of accessTree.value) {
    for (const m of g.modules) {
      if (!isModulePlanLocked(m)) continue
      for (const id of accessTemplate.moduleNavigationIds(m)) ids.add(id)
    }
  }
  return ids
})

function toggleAccess(navId) {
  if (lockedNavIdSet.value.has(navId)) return
  const s = new Set(accessKeys.value)
  if (s.has(navId)) s.delete(navId)
  else s.add(navId)
  accessKeys.value = Array.from(s)
}
function moduleIds(mod) {
  return accessTemplate.moduleNavigationIds(mod)
}
// Toggle every access id that belongs to one module.
function toggleAccessModule(mod) {
  if (isModulePlanLocked(mod)) return
  const s = new Set(accessKeys.value)
  const ids = moduleIds(mod)
  const allOn = ids.every(id => s.has(id))
  for (const id of ids) {
    if (allOn) s.delete(id)
    else s.add(id)
  }
  accessKeys.value = Array.from(s)
}
// Toggle every id inside one group (Sales / POS, Catalog, …). Skips plan-locked
// modules so "Select all" only flips what the plan actually unlocks.
function toggleAccessGroup(group) {
  const s = new Set(accessKeys.value)
  const ids = group.modules
    .filter(m => !isModulePlanLocked(m))
    .flatMap(m => moduleIds(m))
  if (!ids.length) return
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
  // Exclude plan-locked module ids from the count so a group only made up of
  // unlocked-but-checked modules reads as 'all' rather than 'some' just because
  // some sibling POS module is off-limits under this plan.
  const ids = group.modules
    .filter(m => !isModulePlanLocked(m))
    .flatMap(m => moduleIds(m))
  if (!ids.length) return 'none'
  const on = ids.filter(id => s.has(id)).length
  if (on === 0) return 'none'
  if (on === ids.length) return 'all'
  return 'some'
}
function isModuleActive(mod) {
  return accessTemplate.isModuleActive(accessKeys.value, mod)
}
function selectAllAccess() {
  // "Select all" respects the plan cap — locked module ids never enter the
  // saved set even from the top-level shortcut.
  const locked = lockedNavIdSet.value
  accessKeys.value = accessTemplate.allNavigationIds.filter(id => !locked.has(id))
}
function clearAllAccess() {
  accessKeys.value = []
}
async function submitAccess() {
  if (!accessUser.value?.uuid) return
  accessSaving.value = true
  accessLoadError.value = ''
  try {
    // Send one item for every navigation_id in the template — granted rows
    // get has_access: true, revoked rows get has_access: false. The server
    // needs the full picture so deactivations persist.
    const granted = new Set(accessKeys.value)
    const items = accessTemplate.allNavigationIds.map(id => ({
      navigation_id: id,
      has_access:   granted.has(id)
    }))
    await userAccessApi.saveUserAccess(accessUser.value.uuid, items)
    // Mirror to localStorage so the modal remembers the selection until the
    // GET user-access endpoint is available.
    saveUserAccess(accessUser.value.uuid, accessKeys.value)
    flash(`Access saved for ${accessUser.value.username}`)
    showAccess.value = false
  } catch (e) {
    accessLoadError.value = e?.message || 'Failed to save access'
  } finally {
    accessSaving.value = false
  }
}

// Live counts per user for the row-action label (uses computed via the
// getters below so it stays reactive to save/clear).
function accessCount(u) {
  return loadUserAccess(u.uuid).length
}

// ─── Row menu ───
function actionsFor(u) {
  const isActive = u.status === 'active'
  const isSelf   = u.uuid === auth.user?.uuid
  const items = []
  if (auth.canDo('user management', 'edit user'))
    items.push({ label: 'Edit user', icon: 'edit', onClick: () => openEdit(u) })
  if (auth.canDo('user management', 'change password'))
    items.push({ label: 'Change password', icon: 'password', onClick: () => openPassword(u) })
  if (auth.canDo('user management', 'assign access'))
    items.push({ label: 'Assign access', icon: 'edit', onClick: () => openAccess(u) })
  if (auth.canDo('user management', 'activate/deactivate user'))
    items.push({
      label: isActive ? 'Deactivate user' : 'Activate user',
      icon:  isActive ? 'deactivate' : 'activate',
      variant: isActive ? 'danger' : 'success',
      disabled: isSelf && isActive,
      onClick: () => askToggleStatus(u)
    })
  if (auth.canDo('user management', 'delete user')) {
    if (items.length) items.push({ divider: true })
    items.push({
      label: 'Delete user', icon: 'trash', variant: 'danger',
      disabled: isSelf,
      onClick: () => askDelete(u)
    })
  }
  return items
}
</script>

<template>
  <div class="flex h-full flex-col gap-4">
    <div class="card flex flex-1 min-h-0 flex-col overflow-hidden">
      <div class="card-header">
        <div>
          <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">Users</div>
          <div class="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
            {{ filtered.length }} of {{ users.total }} shown
            <span v-if="users.loading" class="ml-1 text-brand-600">· loading…</span>
          </div>
        </div>
        <MobileFilterBar>
          <input
            v-model="search"
            @keyup.enter="onSearchEnter"
            placeholder="Search name, username, email… (Enter)"
            class="input w-full sm:w-64"
          />
          <select v-model="roleFilter" @change="onFilterChange" class="input w-full sm:w-40">
            <option value="">All roles</option>
            <option v-for="r in ROLES" :key="r.value" :value="r.value">{{ r.label }}</option>
          </select>
          <select v-model="statusFilter" @change="onFilterChange" class="input w-full sm:w-36">
            <option value="">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <button class="btn-secondary" @click="loadUsers" :disabled="users.loading" title="Refresh">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
          </button>
          <template #action>
            <button v-if="auth.canDo('user management', 'add user')" class="btn-primary" @click="openAdd">+ Add User</button>
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
          v-if="users.loading && !users.items.length"
          :rows="8"
          label="Loading users…"
          :columns="['avatar','lines','wide','bar','pill','dot']"
        />
        <table class="table" v-else-if="filtered.length">
          <thead class="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800 shadow-[inset_0_-1px_0_theme(colors.slate.100)]">
            <tr>
              <th>Name</th>
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
                    <div class="font-medium text-slate-800 dark:text-slate-100">
                      {{ u.name }}
                      <span v-if="u.uuid === auth.user?.uuid" class="ml-1 badge-info">You</span>
                    </div>
                    <div v-if="u.status !== 'active'" class="text-[10px] font-semibold uppercase tracking-wider text-rose-600">
                      Sign-in disabled
                    </div>
                  </div>
                </div>
              </td>
              <td class="font-mono text-xs">{{ u.username }}</td>
              <td class="hidden md:table-cell text-slate-600 dark:text-slate-300">{{ u.email || '—' }}</td>
              <td><span class="badge-info">{{ roleLabel(u.role) }}</span></td>
              <td>
                <span class="badge" :class="u.status === 'active' ? 'badge-success' : 'badge-danger'">
                  <span class="mr-1 inline-block h-1.5 w-1.5 rounded-full"
                        :class="u.status === 'active' ? 'bg-emerald-500' : 'bg-rose-500'"></span>
                  {{ u.status === 'active' ? 'Active' : 'Inactive' }}
                </span>
              </td>
              <td class="hidden lg:table-cell text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                {{ formatDateTime(u.last_logindate) }}
              </td>
              <td class="hidden md:table-cell text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{{ formatDateTime(u.created_at) }}</td>
              <td class="text-right">
                <RowActionMenu :actions="actionsFor(u)" />
              </td>
            </tr>
          </tbody>
        </table>
        <EmptyState v-else-if="!users.loading" title="No users found" message="Try adjusting your search or filters, or add a new user." />
      </div>
    </div>

    <!-- Add / Edit — three stacked sections so mobile and desktop both read
         cleanly. Password fields are hidden in Edit mode (change-password
         lives on its own action). Error banner sits at the top so it's
         visible without scrolling the modal body. -->
    <Modal :show="showForm" :title="editing ? 'Edit User' : 'Add User'" size="lg" @close="showForm = false">
      <form id="userForm" @submit.prevent="submit" class="space-y-5">
        <!-- Error banner, top-of-form so long lab-fields don't push it out of view -->
        <div v-if="formError" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ formError }}
        </div>

        <!-- ─── Section 1: Identity ─── -->
        <fieldset class="space-y-3">
          <legend class="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500">Identity</legend>
          <div>
            <label class="label">Full name <span class="text-rose-500">*</span></label>
            <input v-model="form.name" required maxlength="255" class="input" placeholder="Juan Dela Cruz" />
          </div>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label class="label">Role <span class="text-rose-500">*</span></label>
              <select v-model="form.role" class="input">
                <option v-for="r in ROLES" :key="r.value" :value="r.value">{{ r.label }}</option>
              </select>
            </div>
            <div>
              <label class="label">Email <span class="text-slate-400 dark:text-slate-500">(optional)</span></label>
              <input type="email" v-model="form.email" maxlength="255" class="input" placeholder="jdcruz@lab.local" />
            </div>
          </div>
        </fieldset>

        <!-- ─── Section 2: Login credentials ─── -->
        <fieldset class="space-y-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60 p-4">
          <legend class="px-1 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500">Login credentials</legend>
          <div>
            <label class="label">Username <span class="text-rose-500">*</span></label>
            <div class="relative">
              <input v-model="form.username" :disabled="!!editing" required minlength="3" maxlength="100"
                     autocomplete="off" class="input font-mono lowercase pr-9"
                     :placeholder="editing ? '' : 'jdcruz'"
                     @input="resetUsernameStatus"
                     @blur="checkUsername" />
              <span v-if="!editing && usernameStatus !== 'idle' && usernameStatus !== 'too_short'"
                    class="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                <!-- spinner -->
                <svg v-if="usernameStatus === 'checking'" class="h-4 w-4 animate-spin text-slate-400 dark:text-slate-500"
                     viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" d="M12 3a9 9 0 019 9"/>
                </svg>
                <!-- available (green check) -->
                <svg v-else-if="usernameStatus === 'available'" class="h-4 w-4 text-emerald-600 dark:text-emerald-400"
                     viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <!-- taken (red x) -->
                <svg v-else-if="usernameStatus === 'taken'" class="h-4 w-4 text-rose-600 dark:text-rose-400"
                     viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
                <!-- error (amber warning) -->
                <svg v-else-if="usernameStatus === 'error'" class="h-4 w-4 text-amber-600 dark:text-amber-400"
                     viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </span>
            </div>
            <p class="mt-1 text-[11px]"
               :class="!editing && usernameStatus === 'taken'
                       ? 'text-rose-600 dark:text-rose-400'
                       : !editing && usernameStatus === 'available'
                         ? 'text-emerald-700 dark:text-emerald-400'
                         : 'text-slate-500 dark:text-slate-400'">
              <template v-if="editing">Username cannot be changed after creation.</template>
              <template v-else-if="usernameStatus === 'checking'">Checking availability…</template>
              <template v-else-if="usernameStatus === 'available'">✓ Username is available.</template>
              <template v-else-if="usernameStatus === 'taken'">Username already taken — try another.</template>
              <template v-else-if="usernameStatus === 'error'">Couldn't check availability. You can still submit — the server will validate.</template>
              <template v-else>Lowercase letters, digits, or dots. Minimum 3 characters.</template>
            </p>
          </div>
          <div v-if="!editing" class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label class="label">Password <span class="text-rose-500">*</span></label>
              <input type="password" v-model="form.password" required minlength="6"
                     autocomplete="new-password" class="input" placeholder="At least 6 characters" />
            </div>
            <div>
              <label class="label">Confirm password <span class="text-rose-500">*</span></label>
              <input type="password" v-model="form.confirm_password" required minlength="6"
                     autocomplete="new-password" class="input" placeholder="Re-type password" />
            </div>
          </div>
          <div v-else class="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-[11px] text-slate-600 dark:text-slate-300">
            Passwords are changed from the row action <b>Change password</b>.
          </div>
        </fieldset>

        <!-- ─── Section 3: Lab report fields ─── -->
        <fieldset class="space-y-3 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
          <legend class="px-1 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500">
            Lab report fields <span class="ml-1 text-slate-400 dark:text-slate-500 normal-case tracking-normal">(optional)</span>
          </legend>
          <p class="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500">
            Only used when the user signs a lab report as the medtech / signatory.
          </p>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label class="label">License #</label>
              <input v-model="form.license_number" maxlength="100"
                     class="input font-mono" placeholder="00112233" />
              <p class="mt-1 text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500">Printed under the signature.</p>
            </div>
            <div>
              <label class="label">Name displayed on lab result</label>
              <input v-model="form.lab_display_name" maxlength="255"
                     class="input" placeholder="Juan D. Cruz, RMT" />
              <p class="mt-1 text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500">Falls back to Full name when blank.</p>
            </div>
          </div>
        </fieldset>
      </form>
      <template #footer>
        <button class="btn-secondary" :disabled="submitting" @click="showForm = false">Cancel</button>
        <button class="btn-primary" :disabled="submitting" form="userForm" type="submit">
          {{ submitting ? 'Saving…' : (editing ? 'Save changes' : 'Create user') }}
        </button>
      </template>
    </Modal>

    <!-- Change password -->
    <Modal :show="showPassword" title="Change Password" size="sm" @close="showPassword = false">
      <div v-if="passwordUser" class="mb-3 rounded-md bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm">
        <div class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 dark:text-slate-500">Account</div>
        <div class="font-semibold text-slate-800 dark:text-slate-100">
          {{ passwordUser.name }} <span class="font-mono text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">· {{ passwordUser.username }}</span>
        </div>
        <div v-if="passwordUser.last_change_password" class="mt-1 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
          Last changed: {{ formatDateTime(passwordUser.last_change_password) }}
        </div>
      </div>

      <form id="pwForm" @submit.prevent="submitPassword" class="space-y-3">
        <div>
          <label class="label">New password</label>
          <input type="password" v-model="passwordForm.new" required minlength="6" autocomplete="new-password" class="input" />
          <p class="mt-1 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">Minimum 6 characters.</p>
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
        <button class="btn-primary" :disabled="passwordBusy" form="pwForm" type="submit">
          {{ passwordBusy ? 'Saving…' : 'Update password' }}
        </button>
      </template>
    </Modal>

    <!-- Confirm activate/deactivate -->
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

    <!-- Confirm delete -->
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
             class="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
          Loading access template…
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs">
          <div class="text-slate-600 dark:text-slate-300">
            <b>{{ accessKeys.length }}</b> access item{{ accessKeys.length === 1 ? '' : 's' }} selected
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn-ghost !text-xs" @click="selectAllAccess">Select all</button>
            <button type="button" class="btn-ghost !text-xs" @click="clearAllAccess">Clear all</button>
          </div>
        </div>

        <div class="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
          <div v-for="group in accessTree" :key="group.key"
               class="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <!-- Group header -->
            <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-3 py-2">
              <div class="min-w-0">
                <div class="text-sm font-semibold text-slate-800 dark:text-slate-100 capitalize">{{ group.label }}</div>
              </div>
              <label class="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <input type="checkbox"
                       class="h-4 w-4 rounded border-slate-300"
                       :checked="groupState(group) === 'all'"
                       :indeterminate.prop="groupState(group) === 'some'"
                       @change="toggleAccessGroup(group)" />
                <span class="font-semibold">All</span>
              </label>
            </div>

            <!-- Modules -->
            <div class="divide-y divide-slate-100 dark:divide-slate-800">
              <div v-for="mod in group.modules" :key="mod.key" class="p-3"
                   :class="isModulePlanLocked(mod) && 'opacity-60'">
                <!-- Simple module: one checkbox row -->
                <label v-if="!Array.isArray(mod.actions)"
                       class="flex items-start gap-2 rounded-md px-2 py-1 text-sm text-slate-700 dark:text-slate-200"
                       :class="isModulePlanLocked(mod) ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800'">
                  <input type="checkbox"
                         class="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 disabled:cursor-not-allowed"
                         :checked="accessSet.has(mod.navigation_id)"
                         :disabled="isModulePlanLocked(mod)"
                         @change="toggleAccess(mod.navigation_id)" />
                  <span class="min-w-0 flex-1">
                    <span class="block font-medium capitalize leading-tight text-slate-800 dark:text-slate-100">
                      {{ mod.label }}
                      <span v-if="isModulePlanLocked(mod)"
                            class="ml-1 rounded bg-rose-50 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-rose-700"
                            title="Not included in the current subscription plan.">
                        Requires plan upgrade
                      </span>
                    </span>
                    <span v-if="mod.remarks" class="block text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500">{{ mod.remarks }}</span>
                  </span>
                  <span class="font-mono text-[10px] text-slate-400 dark:text-slate-500">#{{ mod.navigation_id }}</span>
                </label>

                <!-- Container module: header + indented sub-actions -->
                <template v-else>
                  <div class="mb-2 flex items-center gap-2">
                    <label class="inline-flex items-center gap-2"
                           :class="isModulePlanLocked(mod) ? 'cursor-not-allowed' : 'cursor-pointer'">
                      <input type="checkbox"
                             class="h-4 w-4 rounded border-slate-300 disabled:cursor-not-allowed"
                             :checked="moduleState(mod) === 'all'"
                             :indeterminate.prop="moduleState(mod) === 'some'"
                             :disabled="isModulePlanLocked(mod)"
                             @change="toggleAccessModule(mod)" />
                      <span class="text-sm font-semibold capitalize text-slate-800 dark:text-slate-100">{{ mod.label }}</span>
                    </label>
                    <span v-if="isModulePlanLocked(mod)"
                          class="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700"
                          title="Not included in the current subscription plan.">
                      Requires plan upgrade
                    </span>
                    <span v-if="!isModulePlanLocked(mod) && isModuleActive(mod)"
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
                           class="flex items-start gap-2 rounded-md px-2 py-1 text-sm text-slate-700 dark:text-slate-200"
                           :class="isModulePlanLocked(mod) ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800'">
                      <input type="checkbox"
                             class="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 disabled:cursor-not-allowed"
                             :checked="accessSet.has(a.navigation_id)"
                             :disabled="isModulePlanLocked(mod)"
                             @change="toggleAccess(a.navigation_id)" />
                      <span class="min-w-0 flex-1">
                        <span class="block capitalize leading-tight">{{ a.label }}</span>
                        <span v-if="a.remarks" class="block text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500">{{ a.remarks }}</span>
                      </span>
                      <span class="font-mono text-[10px] text-slate-400 dark:text-slate-500">#{{ a.navigation_id }}</span>
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
