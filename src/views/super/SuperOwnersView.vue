<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Modal from '../../components/Modal.vue'
import ConfirmDialog from '../../components/ConfirmDialog.vue'
import EmptyState from '../../components/EmptyState.vue'
import SkeletonRows from '../../components/SkeletonRows.vue'
import RowActionMenu from '../../components/RowActionMenu.vue'
import { formatDateTime } from '../../utils/format'
import * as ownersApi from '../../api/owners'

const router = useRouter()

const search       = ref('')
const statusFilter = ref('')
const filtersOpen  = ref(false)
const loading      = ref(false)
const listError    = ref('')

// Backing store — once backend is wired this becomes a Pinia store call.
const owners = ref([])

async function loadOwners() {
  loading.value = true
  listError.value = ''
  try {
    const res = await ownersApi.listOwners({
      keywords: search.value.trim() || undefined,
      status: statusFilter.value ? [statusFilter.value] : []
    })
    const rows = Array.isArray(res?.results) ? res.results : (Array.isArray(res) ? res : [])
    owners.value = rows
  } catch (e) {
    listError.value = e?.message || 'Failed to load owners'
  } finally {
    loading.value = false
  }
}

onMounted(loadOwners)

const filtered = computed(() => {
  const term = search.value.trim().toLowerCase()
  return owners.value.filter(o => {
    if (statusFilter.value && o.status !== statusFilter.value) return false
    if (!term) return true
    return (
      o.name?.toLowerCase().includes(term) ||
      o.business_name?.toLowerCase().includes(term) ||
      o.email?.toLowerCase().includes(term) ||
      o.phone?.toLowerCase().includes(term)
    )
  })
})

const filtersSummary = computed(() => {
  const parts = []
  if (search.value.trim()) parts.push(`"${search.value.trim()}"`)
  if (statusFilter.value)  parts.push(statusFilter.value === 'active' ? 'Active' : 'Inactive')
  return parts.length ? parts.join(' · ') : 'All owners'
})

const flashMsg = ref('')
let flashTimer = null
function flash(m) {
  flashMsg.value = m
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => flashMsg.value = '', 2500)
}

/* ─── Create modal ─── */
const showForm   = ref(false)
const formError  = ref('')
const submitting = ref(false)
const emptyForm  = () => ({
  username: '',
  name: '',
  business_name: '',
  email: '',
  phone: '',
  password: '',
  password_confirm: '',
  status: 'active'
})
const form = ref(emptyForm())

function openAdd() {
  form.value = emptyForm()
  formError.value = ''
  showForm.value = true
}
function closeAdd() {
  if (submitting.value) return
  showForm.value = false
}
async function submitAdd() {
  formError.value = ''
  const f = form.value
  if (!f.username.trim() || f.username.trim().length < 3) {
    formError.value = 'Username must be at least 3 characters.'; return
  }
  if (!f.name.trim())          { formError.value = 'Name is required.';          return }
  if (!f.email.trim())         { formError.value = 'Email is required.';         return }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) {
    formError.value = 'Email format looks invalid.'; return
  }
  if (!f.password || f.password.length < 8) {
    formError.value = 'Password must be at least 8 characters.'; return
  }
  if (f.password !== f.password_confirm) {
    formError.value = 'Password confirmation does not match.'; return
  }
  submitting.value = true
  try {
    const created = await ownersApi.createOwner({
      username: f.username.trim().toLowerCase(),
      password: f.password,
      confirm_password: f.password_confirm,
      name: f.name.trim(),
      business_name: f.business_name.trim() || undefined,
      email: f.email.trim().toLowerCase(),
      phone: f.phone.trim() || undefined,
    })
    // Backend returns the fresh row (sans passphrase/keycode via $formatJson).
    // Status gets honored on create, but let the form choice win visually.
    const row = { ...created, status: f.status, tenant_count: 0 }
    owners.value.unshift(row)
    showForm.value = false
    flash(`Owner "${f.name.trim()}" created`)
  } catch (e) {
    formError.value = e?.message || 'Failed to create owner'
  } finally {
    submitting.value = false
  }
}

/* ─── Row actions ─── */
function viewDetails(o) {
  router.push({ name: 'super-owner-details', params: { uuid: o.uuid } })
}

const confirmStatus = ref({ show: false, owner: null, target: '' })
function askToggleStatus(o) {
  confirmStatus.value = {
    show: true,
    owner: o,
    target: o.status === 'active' ? 'inactive' : 'active'
  }
}
async function doToggleStatus() {
  const { owner, target } = confirmStatus.value
  confirmStatus.value = { show: false, owner: null, target: '' }
  if (!owner) return
  try {
    await ownersApi.setOwnerStatus(owner.uuid, target)
    const row = owners.value.find(x => x.uuid === owner.uuid)
    if (row) row.status = target
    flash(`Owner "${owner.name}" set to ${target}`)
  } catch (e) {
    flash(e?.message || 'Failed to update status')
  }
}

const confirmReset = ref({ show: false, owner: null })
function askResetPassword(o) { confirmReset.value = { show: true, owner: o } }
async function doResetPassword() {
  const { owner } = confirmReset.value
  confirmReset.value = { show: false, owner: null }
  if (!owner) return
  try {
    await ownersApi.requestOwnerPasswordReset(owner.uuid)
    flash(`Password-reset email sent to ${owner.email}`)
  } catch (e) {
    flash(e?.message || 'Failed to send reset email')
  }
}
</script>

<template>
  <div class="flex h-full flex-col gap-4">
    <div class="card flex flex-1 min-h-0 flex-col overflow-hidden">
      <div class="card-header">
        <div>
          <div class="text-sm font-semibold text-slate-800">Owners</div>
          <div class="text-xs text-slate-500">
            {{ filtered.length }} shown
            <span v-if="loading" class="ml-1 text-brand-600">· loading…</span>
              </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button class="btn-secondary !px-3" @click="loadOwners" :disabled="loading" title="Refresh">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
          </button>
          <button class="btn-primary" @click="openAdd">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New Owner
          </button>
        </div>
      </div>

      <!-- Mobile filter collapse, matches SuperTenantsView pattern -->
      <button
        type="button"
        class="flex w-full items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2 text-left text-sm text-slate-700 sm:hidden"
        :aria-expanded="filtersOpen"
        aria-controls="super-owners-filters"
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
        id="super-owners-filters"
        class="gap-2 border-b border-slate-100 p-4 grid-cols-1 sm:grid-cols-2"
        :class="filtersOpen ? 'grid' : 'hidden sm:grid'"
      >
        <input
          v-model="search"
          class="input"
          placeholder="Search by name, business, email, phone…"
        />
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

      <div v-if="listError" class="border-b border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-700">
        {{ listError }}
      </div>

      <div class="min-h-0 flex-1 overflow-auto">
        <SkeletonRows v-if="loading && !owners.length" :rows="6" />
        <EmptyState
          v-else-if="!filtered.length"
          title="No owners found"
          :message="search || statusFilter ? 'Try clearing your filters.' : 'Click &ldquo;New Owner&rdquo; to provision one.'"
        />
        <table v-else class="table">
          <thead class="sticky top-0 z-10 bg-slate-50 shadow-[inset_0_-1px_0_theme(colors.slate.100)]">
            <tr>
              <th class="text-left">Name</th>
              <th class="text-left">Business</th>
              <th class="text-left">Contact</th>
              <th class="text-right">Tenants</th>
              <th class="text-left">Status</th>
              <th class="text-left">Last Login</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="o in filtered" :key="o.uuid" class="hover:bg-slate-50/60">
              <td class="whitespace-nowrap">
                <button class="text-left font-semibold text-slate-800 hover:text-brand-700 hover:underline"
                        @click="viewDetails(o)">
                  {{ o.name }}
                </button>
                <div class="text-[11px] text-slate-500">
                  via {{ o.created_by }} · {{ formatDateTime(o.created_at) }}
                </div>
              </td>
              <td>{{ o.business_name || '—' }}</td>
              <td>
                <div class="text-slate-800">{{ o.email }}</div>
                <div class="text-[11px] text-slate-500">{{ o.phone || '—' }}</div>
              </td>
              <td class="text-right font-semibold tabular-nums">{{ o.tenant_count }}</td>
              <td>
                <span
                  class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
                  :class="o.status === 'active'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-200 text-slate-600'">
                  {{ o.status }}
                </span>
              </td>
              <td class="whitespace-nowrap text-xs text-slate-600">
                {{ o.last_logindate ? formatDateTime(o.last_logindate) : '— never —' }}
              </td>
              <td class="text-right">
                <RowActionMenu
                  :actions="[
                    { label: 'View details',        icon: 'eye',      onClick: () => viewDetails(o) },
                    { label: 'Send password reset', icon: 'password', onClick: () => askResetPassword(o) },
                    { divider: true },
                    { label: o.status === 'active' ? 'Deactivate' : 'Activate',
                      icon:    o.status === 'active' ? 'deactivate' : 'activate',
                      variant: o.status === 'active' ? 'danger'     : 'success',
                      onClick: () => askToggleStatus(o) }
                  ]"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Create Owner modal -->
    <Modal :show="showForm" @close="closeAdd" title="New Owner" size="lg">
      <form class="space-y-4" @submit.prevent="submitAdd">
        <div v-if="formError" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ formError }}
        </div>

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label class="block">
            <span class="label">Username <span class="text-rose-500">*</span></span>
            <input v-model="form.username" class="input font-mono" placeholder="juan" required autocomplete="off" />
          </label>
          <label class="block">
            <span class="label">Full name <span class="text-rose-500">*</span></span>
            <input v-model="form.name" class="input" placeholder="e.g. Juan Dela Cruz" required />
          </label>
          <label class="block">
            <span class="label">Business name</span>
            <input v-model="form.business_name" class="input" placeholder="Lab chain / holding company" />
          </label>
          <label class="block">
            <span class="label">Email <span class="text-rose-500">*</span></span>
            <input v-model="form.email" type="email" class="input" placeholder="owner@example.com" required />
          </label>
          <label class="block">
            <span class="label">Phone</span>
            <input v-model="form.phone" class="input" placeholder="+63 9xx xxx xxxx" />
          </label>
          <label class="block">
            <span class="label">Password <span class="text-rose-500">*</span></span>
            <input v-model="form.password" type="password" class="input" placeholder="At least 8 characters" required />
          </label>
          <label class="block">
            <span class="label">Confirm password <span class="text-rose-500">*</span></span>
            <input v-model="form.password_confirm" type="password" class="input" required />
          </label>
          <label class="block sm:col-span-2">
            <span class="label">Status</span>
            <select v-model="form.status" class="input">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
        </div>

        <div class="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
          <button type="button" class="btn-secondary" :disabled="submitting" @click="closeAdd">Cancel</button>
          <button type="submit" class="btn-primary" :disabled="submitting">
            <span v-if="submitting">Saving…</span>
            <span v-else>Create Owner</span>
          </button>
        </div>
      </form>
    </Modal>

    <ConfirmDialog
      :show="confirmStatus.show"
      :title="`Set owner to ${confirmStatus.target}?`"
      :message="confirmStatus.owner
        ? `&ldquo;${confirmStatus.owner.name}&rdquo; will be ${confirmStatus.target === 'active' ? 'able to log in' : 'blocked from logging in'}. Assigned tenants are not affected.`
        : ''"
      :danger="confirmStatus.target === 'inactive'"
      confirm-text="Apply"
      @close="confirmStatus = { show: false, owner: null, target: '' }"
      @confirm="doToggleStatus"
    />

    <ConfirmDialog
      :show="confirmReset.show"
      title="Send password reset email?"
      :message="confirmReset.owner
        ? `An email with a reset link will be sent to ${confirmReset.owner.email}.`
        : ''"
      :danger="false"
      confirm-text="Send"
      @close="confirmReset = { show: false, owner: null }"
      @confirm="doResetPassword"
    />
  </div>
</template>
