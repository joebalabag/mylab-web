<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useSuperAdminStore } from '../../stores/superAdmin'
import Modal from '../../components/Modal.vue'
import ConfirmDialog from '../../components/ConfirmDialog.vue'
import EmptyState from '../../components/EmptyState.vue'
import RowActionMenu from '../../components/RowActionMenu.vue'
import SkeletonRows from '../../components/SkeletonRows.vue'
import { formatDate } from '../../utils/format'

const superAdmin = useSuperAdminStore()

const search = ref('')
const roleFilter = ref('')
const statusFilter = ref('')

// Mobile-only collapse — hide the filter row by default on phones so the
// users table lands above the fold. Tablet/desktop always show it inline.
const filtersOpen = ref(false)
const filtersSummary = computed(() => {
  const parts = []
  if (search.value.trim()) parts.push(`"${search.value.trim()}"`)
  if (roleFilter.value)    parts.push(roleFilter.value === 'super_admin' ? 'MyLab' : 'Support')
  if (statusFilter.value)  parts.push(statusFilter.value === 'active' ? 'Active' : 'Inactive')
  return parts.length ? parts.join(' · ') : 'All users'
})

const loading = ref(false)
const loadError = ref('')

const isActive = (u) => u.status ? u.status === 'active' : !!u.active

async function reload() {
  loadError.value = ''
  loading.value = true
  try {
    await superAdmin.fetchAllFromApi({
      keywords: search.value.trim() || undefined,
      role: roleFilter.value || undefined,
      status: statusFilter.value ? [statusFilter.value] : undefined
    })
  } catch (e) {
    loadError.value = e?.message || 'Failed to load super admin users'
  } finally {
    loading.value = false
  }
}

onMounted(reload)

let searchTimer = null
watch(search, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(reload, 300)
})
watch([roleFilter, statusFilter], reload)

const rows = computed(() => superAdmin.items)

const flashMsg = ref('')
let flashTimer = null
function flash(m) {
  flashMsg.value = m
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => flashMsg.value = '', 2200)
}

const emptyForm = () => ({
  username: '',
  name: '',
  email: '',
  role: 'super_admin',
  password: '',
  confirm_password: '',
  status: 'active'
})

const showForm = ref(false)
const editing = ref(null)
const form = ref(emptyForm())
const formError = ref('')
const saving = ref(false)

function openAdd() {
  editing.value = null
  form.value = emptyForm()
  formError.value = ''
  showForm.value = true
}
function openEdit(u) {
  editing.value = u
  form.value = {
    username: u.username || '',
    name: u.name || '',
    email: u.email || '',
    role: u.role || 'super_admin',
    password: '',
    confirm_password: '',
    status: u.status || (u.active ? 'active' : 'inactive')
  }
  formError.value = ''
  showForm.value = true
}

async function submit() {
  formError.value = ''
  const uname = form.value.username.trim()
  if (!uname) { formError.value = 'Username is required'; return }
  if (!editing.value && !form.value.password) {
    formError.value = 'Password is required for new users'
    return
  }
  if (form.value.password) {
    if (form.value.password.length < 6) {
      formError.value = 'Password must be at least 6 characters'
      return
    }
    if (form.value.password !== form.value.confirm_password) {
      formError.value = 'Passwords do not match'
      return
    }
  }

  const payload = {
    name: form.value.name.trim(),
    email: form.value.email.trim(),
    role: form.value.role
  }
  if (!editing.value) payload.username = uname
  if (form.value.password) {
    payload.password = form.value.password
    payload.confirm_password = form.value.confirm_password
  }

  saving.value = true
  try {
    if (editing.value) {
      await superAdmin.updateViaApi(editing.value.uuid, payload)
      flash(`Updated ${uname}`)
    } else {
      await superAdmin.createViaApi(payload)
      flash(`Created ${uname}`)
    }
    showForm.value = false
  } catch (e) {
    formError.value = e?.message || 'Save failed'
  } finally {
    saving.value = false
  }
}

const confirmStatus = ref({ show: false, user: null, nextStatus: null })
function askToggleStatus(u) {
  if (u.uuid === superAdmin.currentUser?.uuid && isActive(u)) {
    flash('You cannot deactivate your own account')
    return
  }
  confirmStatus.value = { show: true, user: u, nextStatus: isActive(u) ? 'inactive' : 'active' }
}
async function doToggleStatus() {
  const { user, nextStatus } = confirmStatus.value
  try {
    await superAdmin.setStatusViaApi(user.uuid, nextStatus)
    flash(`${user.username} is now ${nextStatus}`)
  } catch (e) {
    flash(e?.message || 'Failed to update status')
  }
  confirmStatus.value = { show: false, user: null, nextStatus: null }
}

const confirmDelete = ref({ show: false, user: null })
function askDelete(u) {
  if (u.uuid === superAdmin.currentUser?.uuid) {
    flash('You cannot delete your own account')
    return
  }
  confirmDelete.value = { show: true, user: u }
}
async function doDelete() {
  const u = confirmDelete.value.user
  try {
    await superAdmin.removeViaApi(u.uuid)
    flash(`Deleted ${u.username}`)
  } catch (e) {
    flash(e?.message || 'Failed to delete')
  }
  confirmDelete.value = { show: false, user: null }
}

const showPasswordDlg = ref(false)
const passwordUser = ref(null)
const passwordForm = ref({ new: '', confirm: '' })
const passwordError = ref('')
const passwordSaving = ref(false)

function openPassword(u) {
  passwordUser.value = u
  passwordForm.value = { new: '', confirm: '' }
  passwordError.value = ''
  showPasswordDlg.value = true
}
async function submitPassword() {
  passwordError.value = ''
  const { new: np, confirm: cp } = passwordForm.value
  if (np.length < 6) { passwordError.value = 'Password must be at least 6 characters'; return }
  if (np !== cp)     { passwordError.value = 'Passwords do not match'; return }
  passwordSaving.value = true
  try {
    await superAdmin.resetPasswordViaApi(passwordUser.value.uuid, np, cp)
    showPasswordDlg.value = false
    flash(`Password updated for ${passwordUser.value.username}`)
  } catch (e) {
    passwordError.value = e?.message || 'Failed to update password'
  } finally {
    passwordSaving.value = false
  }
}
</script>

<template>
  <div class="flex h-full flex-col gap-4">
    <div class="card flex flex-1 min-h-0 flex-col overflow-hidden">
      <div class="card-header">
        <div>
          <div class="text-sm font-semibold text-slate-800">MyLab Admin</div>
          <div class="text-xs text-slate-500">{{ rows.length }} record{{ rows.length === 1 ? '' : 's' }}</div>
        </div>
        <button class="btn-primary" @click="openAdd">
          <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New User
        </button>
      </div>

      <!-- Mobile-only collapse toggle. sm:hidden so tablet/desktop always
           show the filter row inline. Matches the ReportsView pattern. -->
      <button
        type="button"
        class="flex w-full items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2 text-left text-sm text-slate-700 sm:hidden"
        :aria-expanded="filtersOpen"
        aria-controls="super-users-filters"
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

      <div
        id="super-users-filters"
        class="gap-2 border-b border-slate-100 p-4 grid-cols-1 sm:grid-cols-3"
        :class="filtersOpen ? 'grid' : 'hidden sm:grid'"
      >
        <input v-model="search" class="input" placeholder="Search by username, name, email…" />
        <select v-model="roleFilter" class="input">
          <option value="">All roles</option>
          <option value="super_admin">MyLab</option>
          <option value="support">Support</option>
        </select>
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
      <div v-if="loadError" class="border-b border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-700">
        {{ loadError }}
      </div>

      <div class="min-h-0 flex-1 overflow-auto">
      <table class="table">
        <thead class="sticky top-0 z-10 bg-slate-50 shadow-[inset_0_-1px_0_theme(colors.slate.100)]">
          <tr>
            <th>User</th>
            <th>Email</th>
            <th>Role</th>
            <th>Created</th>
            <th>Status</th>
            <th class="w-14 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          <SkeletonRows v-if="loading && !rows.length" :rows="4" :cols="6" />
          <tr v-else-if="!rows.length">
            <td colspan="6" class="py-8">
              <EmptyState title="No users found" message="Adjust filters or create a new super admin." />
            </td>
          </tr>
          <tr v-for="u in rows" :key="u.uuid">
            <td>
              <div class="flex items-center gap-2">
                <div class="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-600 text-xs font-bold text-white">
                  {{ (u.name || u.username || '?').slice(0,1).toUpperCase() }}
                </div>
                <div>
                  <div class="font-semibold text-slate-800">{{ u.name || u.username }}</div>
                  <div class="text-xs text-slate-500 font-mono">@{{ u.username }}</div>
                </div>
                <span v-if="u.uuid === superAdmin.currentUser?.uuid" class="badge-info">You</span>
              </div>
            </td>
            <td class="text-slate-700">{{ u.email || '—' }}</td>
            <td>
              <span class="chip">{{ u.role }}</span>
            </td>
            <td class="text-slate-600">{{ formatDate(u.created_at || u.createdAt) }}</td>
            <td>
              <span v-if="isActive(u)" class="badge-success">Active</span>
              <span v-else class="badge-danger">Inactive</span>
            </td>
            <td class="text-right">
              <RowActionMenu :actions="[
                { label: 'Edit', icon: 'edit', onClick: () => openEdit(u) },
                { label: 'Change password', icon: 'password', onClick: () => openPassword(u) },
                { label: isActive(u) ? 'Deactivate' : 'Activate',
                  icon: isActive(u) ? 'deactivate' : 'activate',
                  variant: isActive(u) ? 'danger' : 'success',
                  disabled: u.uuid === superAdmin.currentUser?.uuid && isActive(u),
                  onClick: () => askToggleStatus(u) },
                { divider: true },
                { label: 'Delete', icon: 'trash', variant: 'danger',
                  disabled: u.uuid === superAdmin.currentUser?.uuid,
                  onClick: () => askDelete(u) }
              ]" />
            </td>
          </tr>
        </tbody>
      </table>
      </div>
    </div>

    <!-- Add / Edit Modal -->
    <Modal :show="showForm" :title="editing ? 'Edit MyLab User' : 'New MyLab User'" size="md" @close="showForm = false">
      <form class="space-y-3" @submit.prevent="submit">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label class="label">Username *</label>
            <input v-model="form.username" class="input font-mono" required autocomplete="off"
                   :disabled="!!editing" />
          </div>
          <div>
            <label class="label">Role</label>
            <select v-model="form.role" class="input">
              <option value="super_admin">MyLab</option>
              <option value="support">Support</option>
            </select>
          </div>
          <div class="sm:col-span-2">
            <label class="label">Full name</label>
            <input v-model="form.name" class="input" />
          </div>
          <div class="sm:col-span-2">
            <label class="label">Email</label>
            <input v-model="form.email" type="email" class="input" />
          </div>
          <div>
            <label class="label">
              {{ editing ? 'New password' : 'Password *' }}
            </label>
            <input v-model="form.password" type="password" class="input"
                   :required="!editing" autocomplete="new-password"
                   :placeholder="editing ? 'Leave blank to keep current' : ''" />
          </div>
          <div>
            <label class="label">Confirm password</label>
            <input v-model="form.confirm_password" type="password" class="input"
                   :required="!editing || !!form.password" autocomplete="new-password" />
          </div>
        </div>
        <div v-if="formError" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ formError }}
        </div>
      </form>
      <template #footer>
        <button class="btn-secondary" :disabled="saving" @click="showForm = false">Cancel</button>
        <button class="btn-primary" :disabled="saving" @click="submit">
          {{ saving ? 'Saving…' : (editing ? 'Save Changes' : 'Create User') }}
        </button>
      </template>
    </Modal>

    <!-- Change password -->
    <Modal :show="showPasswordDlg" title="Change Password" size="sm" @close="showPasswordDlg = false">
      <div v-if="passwordUser" class="mb-2 text-sm text-slate-600">
        Set a new password for <b>@{{ passwordUser.username }}</b>.
      </div>
      <form class="space-y-3" @submit.prevent="submitPassword">
        <div>
          <label class="label">New password</label>
          <input v-model="passwordForm.new" type="password" class="input" required minlength="6" autocomplete="new-password" />
        </div>
        <div>
          <label class="label">Confirm new password</label>
          <input v-model="passwordForm.confirm" type="password" class="input" required minlength="6" autocomplete="new-password" />
        </div>
        <div v-if="passwordError" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ passwordError }}
        </div>
      </form>
      <template #footer>
        <button class="btn-secondary" :disabled="passwordSaving" @click="showPasswordDlg = false">Cancel</button>
        <button class="btn-primary" :disabled="passwordSaving" @click="submitPassword">
          {{ passwordSaving ? 'Saving…' : 'Update Password' }}
        </button>
      </template>
    </Modal>

    <ConfirmDialog
      :show="confirmStatus.show"
      :title="confirmStatus.nextStatus === 'active' ? 'Activate User?' : 'Deactivate User?'"
      :message="confirmStatus.user
        ? `${confirmStatus.user.username} will ${confirmStatus.nextStatus === 'active' ? 'be able to sign in again' : 'no longer be able to sign in'}.`
        : ''"
      :confirm-text="confirmStatus.nextStatus === 'active' ? 'Activate' : 'Deactivate'"
      :danger="confirmStatus.nextStatus !== 'active'"
      @close="confirmStatus = { show: false, user: null, nextStatus: null }"
      @confirm="doToggleStatus"
    />
    <ConfirmDialog
      :show="confirmDelete.show"
      title="Delete User?"
      :message="confirmDelete.user
        ? `This will permanently remove @${confirmDelete.user.username}. This cannot be undone.`
        : ''"
      confirm-text="Delete"
      @close="confirmDelete = { show: false, user: null }"
      @confirm="doDelete"
    />
  </div>
</template>
