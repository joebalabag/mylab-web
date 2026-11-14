<script setup>
import { computed, onMounted, ref } from 'vue'
import { useOwnerStore } from '../../stores/owner'
import Modal from '../../components/Modal.vue'
import ConfirmDialog from '../../components/ConfirmDialog.vue'
import EmptyState from '../../components/EmptyState.vue'
import SkeletonRows from '../../components/SkeletonRows.vue'
import RowActionMenu from '../../components/RowActionMenu.vue'
import { formatDateTime } from '../../utils/format'
import * as ownerMeApi from '../../api/ownerMe'

const owner = useOwnerStore()

const loading = ref(false)
const users   = ref([])
const tenants = ref([])
const search       = ref('')
const tenantFilter = ref('')
const statusFilter = ref('')
const roleFilter   = ref('')

async function load() {
  loading.value = true
  try {
    const [tenantRows, userRows] = await Promise.all([
      ownerMeApi.listMyTenants(),
      ownerMeApi.listUsers(),
    ])
    tenants.value = Array.isArray(tenantRows) ? tenantRows : []
    users.value = Array.isArray(userRows) ? userRows : []
  } finally {
    loading.value = false
  }
}
onMounted(load)

const tenantByUuid = computed(() => {
  const m = {}
  for (const t of tenants.value) m[t.tenant_uuid] = t
  return m
})

const roles = computed(() => {
  const s = new Set(users.value.map(u => u.role).filter(Boolean))
  return Array.from(s).sort()
})

const filtered = computed(() => {
  const term = search.value.trim().toLowerCase()
  return users.value.filter(u => {
    if (tenantFilter.value && u.tenant_uuid !== tenantFilter.value) return false
    if (statusFilter.value && u.status !== statusFilter.value) return false
    if (roleFilter.value && u.role !== roleFilter.value) return false
    if (!term) return true
    return (
      u.username?.toLowerCase().includes(term) ||
      u.name?.toLowerCase().includes(term) ||
      u.email?.toLowerCase().includes(term)
    )
  })
})

const flashMsg = ref('')
let flashTimer = null
function flash(m) {
  flashMsg.value = m
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => flashMsg.value = '', 2500)
}

/* ─── Create / edit modal ─── */
const showForm   = ref(false)
const editing    = ref(null)
const formError  = ref('')
const submitting = ref(false)
const emptyForm = () => ({
  tenant_uuid: tenantFilter.value || tenants.value[0]?.tenant_uuid || '',
  username: '',
  name: '',
  email: '',
  role: 'medtech',
  status: 'active',
  password: '',
  password_confirm: ''
})
const form = ref(emptyForm())

function openAdd() {
  editing.value = null
  form.value = emptyForm()
  formError.value = ''
  showForm.value = true
}
function openEdit(u) {
  editing.value = u
  form.value = {
    tenant_uuid: u.tenant_uuid,
    username:    u.username || '',
    name:        u.name || '',
    email:       u.email || '',
    role:        u.role || 'medtech',
    status:      u.status || 'active',
    password:    '',
    password_confirm: ''
  }
  formError.value = ''
  showForm.value = true
}
function closeForm() {
  if (submitting.value) return
  showForm.value = false
}
async function submitForm() {
  formError.value = ''
  const f = form.value
  if (!f.tenant_uuid)     { formError.value = 'Tenant is required.';   return }
  if (!f.username.trim()) { formError.value = 'Username is required.'; return }
  if (!f.name.trim())     { formError.value = 'Name is required.';     return }
  if (!editing.value) {
    if (!f.password || f.password.length < 8) {
      formError.value = 'Password must be at least 8 characters.'; return
    }
    if (f.password !== f.password_confirm) {
      formError.value = 'Password confirmation does not match.'; return
    }
  } else if (f.password && f.password !== f.password_confirm) {
    formError.value = 'Password confirmation does not match.'; return
  }
  submitting.value = true
  try {
    if (editing.value) {
      const updated = await ownerMeApi.updateUser(editing.value.uuid, {
        name: f.name.trim(),
        email: f.email.trim() || null,
        role: f.role,
      })
      // Tenant reassignment and status/password changes have their own
      // endpoints — this PATCH only covers profile fields.
      Object.assign(editing.value, {
        name:  updated?.name  ?? f.name.trim(),
        email: updated?.email ?? f.email.trim(),
        role:  updated?.role  ?? f.role,
      })
      // If the user flipped status in the same form, apply it separately.
      if (editing.value.status !== f.status) {
        await ownerMeApi.setUserStatus(editing.value.uuid, f.status)
        editing.value.status = f.status
      }
    } else {
      const created = await ownerMeApi.createUser({
        tenant_uuid: f.tenant_uuid,
        username: f.username.trim(),
        password: f.password,
        confirm_password: f.password_confirm,
        name: f.name.trim(),
        email: f.email.trim() || undefined,
        role: f.role,
      })
      users.value.unshift({
        ...created,
        // Hydrate the Tenant column fallback (the list endpoint attaches
        // tenant_display_name/store_code; create doesn't, so re-fetch the
        // display name from the local tenants array).
        tenant_display_name: tenants.value.find(t => t.tenant_uuid === f.tenant_uuid)?.display_name,
        tenant_store_code:   tenants.value.find(t => t.tenant_uuid === f.tenant_uuid)?.store_code,
      })
    }
    showForm.value = false
    flash(editing.value ? `Updated user ${f.username.trim()}` : `Created user ${f.username.trim()}`)
  } catch (e) {
    formError.value = e?.message || 'Failed to save user'
  } finally {
    submitting.value = false
  }
}

/* ─── Toggle status ─── */
const confirmStatus = ref({ show: false, user: null, target: '' })
function askToggleStatus(u) {
  confirmStatus.value = {
    show: true,
    user: u,
    target: u.status === 'active' ? 'inactive' : 'active'
  }
}
async function doToggleStatus() {
  const { user, target } = confirmStatus.value
  confirmStatus.value = { show: false, user: null, target: '' }
  if (!user) return
  try {
    await ownerMeApi.setUserStatus(user.uuid, target)
    const row = users.value.find(x => x.uuid === user.uuid)
    if (row) row.status = target
    flash(`User "${user.username}" set to ${target}`)
  } catch (e) {
    flash(e?.message || 'Failed to update status')
  }
}

/* ─── Reset password ─── */
const confirmReset = ref({ show: false, user: null })
function askResetPassword(u) { confirmReset.value = { show: true, user: u } }
async function doResetPassword() {
  const { user } = confirmReset.value
  confirmReset.value = { show: false, user: null }
  if (!user) return
  // The owner-side user password reset endpoint isn't in Phase 2 scope —
  // super-admin still handles tenant-user password resets. Surface the
  // guidance in the existing flash so operators know to escalate.
  flash('Password resets for tenant users are handled by platform admin — ping support.')
}
</script>

<template>
  <div class="flex h-full flex-col gap-4">
    <div class="card flex flex-1 min-h-0 flex-col overflow-hidden">
      <div class="card-header">
        <div>
          <div class="text-sm font-semibold text-slate-800">Users across my branches</div>
          <div class="text-xs text-slate-500">
            {{ filtered.length }} shown
            <span v-if="loading" class="ml-1 text-teal-700">· loading…</span>
          </div>
        </div>
        <button class="btn-primary" @click="openAdd" :disabled="!tenants.length">
          <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New user
        </button>
      </div>

      <div class="grid gap-2 border-b border-slate-100 p-4 grid-cols-1 sm:grid-cols-4">
        <input v-model="search" class="input" placeholder="Search by name, username, email…" />
        <select v-model="tenantFilter" class="input">
          <option value="">All tenants</option>
          <option v-for="t in tenants" :key="t.tenant_uuid" :value="t.tenant_uuid">
            {{ t.display_name }} · {{ t.store_code }}
          </option>
        </select>
        <select v-model="roleFilter" class="input">
          <option value="">All roles</option>
          <option v-for="r in roles" :key="r" :value="r">{{ r }}</option>
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

      <div class="min-h-0 flex-1 overflow-auto">
        <SkeletonRows v-if="loading && !users.length" :rows="6" />
        <EmptyState
          v-else-if="!filtered.length"
          title="No users found"
          :message="search || tenantFilter || statusFilter || roleFilter ? 'Try clearing your filters.' : 'No users exist across your tenants yet.'"
        />
        <table v-else class="table">
          <thead class="sticky top-0 z-10 bg-slate-50 shadow-[inset_0_-1px_0_theme(colors.slate.100)]">
            <tr>
              <th class="text-left">User</th>
              <th class="text-left">Tenant</th>
              <th class="text-left hidden md:table-cell">Email</th>
              <th class="text-left">Role</th>
              <th class="text-left">Status</th>
              <th class="text-left hidden lg:table-cell">Last Login</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in filtered" :key="u.uuid" class="hover:bg-slate-50/60">
              <td>
                <div class="font-semibold text-slate-800">{{ u.name }}</div>
                <div class="text-[11px] text-slate-500 font-mono">@{{ u.username }}</div>
              </td>
              <td>
                <div class="text-sm font-medium text-slate-800">{{ u.tenant_display_name || tenantByUuid[u.tenant_uuid]?.display_name || '—' }}</div>
                <div class="text-[11px] text-slate-500 font-mono">{{ u.tenant_store_code || tenantByUuid[u.tenant_uuid]?.store_code }}</div>
              </td>
              <td class="hidden md:table-cell text-slate-700">{{ u.email || '—' }}</td>
              <td>
                <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-700">
                  {{ u.role }}
                </span>
              </td>
              <td>
                <span v-if="u.status === 'active'" class="badge-success">Active</span>
                <span v-else class="badge-muted">Inactive</span>
              </td>
              <td class="hidden lg:table-cell text-xs text-slate-500">
                {{ u.last_logindate ? formatDateTime(u.last_logindate) : '— never —' }}
              </td>
              <td class="text-right">
                <RowActionMenu :actions="[
                  { label: 'Edit',                icon: 'edit',     onClick: () => openEdit(u) },
                  { label: 'Send password reset', icon: 'password', onClick: () => askResetPassword(u) },
                  { divider: true },
                  { label: u.status === 'active' ? 'Deactivate' : 'Activate',
                    icon:    u.status === 'active' ? 'deactivate' : 'activate',
                    variant: u.status === 'active' ? 'danger'     : 'success',
                    onClick: () => askToggleStatus(u) }
                ]" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Add / Edit user modal -->
    <Modal :show="showForm" @close="closeForm" :title="editing ? `Edit ${editing.username}` : 'New user'" size="lg">
      <form class="space-y-4" @submit.prevent="submitForm">
        <div v-if="formError" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ formError }}
        </div>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label class="block sm:col-span-2">
            <span class="label">Tenant <span class="text-rose-500">*</span></span>
            <select v-model="form.tenant_uuid" class="input" required>
              <option value="" disabled>— Pick a tenant —</option>
              <option v-for="t in tenants" :key="t.tenant_uuid" :value="t.tenant_uuid">
                {{ t.display_name }} · {{ t.store_code }}{{ t.branch ? ' / ' + t.branch : '' }}
              </option>
            </select>
          </label>
          <label class="block">
            <span class="label">Username <span class="text-rose-500">*</span></span>
            <input v-model="form.username" class="input font-mono" autocomplete="off" required />
          </label>
          <label class="block">
            <span class="label">Full name <span class="text-rose-500">*</span></span>
            <input v-model="form.name" class="input" required />
          </label>
          <label class="block">
            <span class="label">Email</span>
            <input v-model="form.email" type="email" class="input" />
          </label>
          <label class="block">
            <span class="label">Role</span>
            <select v-model="form.role" class="input">
              <option value="manager">manager</option>
              <option value="cashier">cashier</option>
              <option value="medtech">medtech</option>
              <option value="pathologist">pathologist</option>
            </select>
          </label>
          <label class="block">
            <span class="label">
              Password
              <span v-if="!editing" class="text-rose-500">*</span>
              <span v-else class="ml-1 text-[10px] text-slate-500">(leave blank to keep)</span>
            </span>
            <input v-model="form.password" type="password" class="input" :required="!editing" placeholder="At least 8 characters" />
          </label>
          <label class="block">
            <span class="label">Confirm password</span>
            <input v-model="form.password_confirm" type="password" class="input" :required="!editing || !!form.password" />
          </label>
          <label class="block sm:col-span-2">
            <span class="label">Status</span>
            <select v-model="form.status" class="input">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
        </div>
      </form>
      <template #footer>
        <button class="btn-secondary" :disabled="submitting" @click="closeForm">Cancel</button>
        <button class="btn-primary" :disabled="submitting" @click="submitForm">
          {{ submitting ? 'Saving…' : (editing ? 'Save changes' : 'Create user') }}
        </button>
      </template>
    </Modal>

    <ConfirmDialog
      :show="confirmStatus.show"
      :title="`Set user to ${confirmStatus.target}?`"
      :message="confirmStatus.user
        ? `&quot;${confirmStatus.user.username}&quot; will be ${confirmStatus.target === 'active' ? 'able to log in' : 'blocked from logging in'}.`
        : ''"
      :danger="confirmStatus.target === 'inactive'"
      confirm-text="Apply"
      @close="confirmStatus = { show: false, user: null, target: '' }"
      @confirm="doToggleStatus"
    />

    <ConfirmDialog
      :show="confirmReset.show"
      title="Send password reset email?"
      :message="confirmReset.user
        ? `An email with a reset link will be sent to ${confirmReset.user.email || confirmReset.user.username}.`
        : ''"
      :danger="false"
      confirm-text="Send"
      @close="confirmReset = { show: false, user: null }"
      @confirm="doResetPassword"
    />
  </div>
</template>
