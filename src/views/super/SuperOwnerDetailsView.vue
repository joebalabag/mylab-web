<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Modal from '../../components/Modal.vue'
import ConfirmDialog from '../../components/ConfirmDialog.vue'
import EmptyState from '../../components/EmptyState.vue'
import SkeletonRows from '../../components/SkeletonRows.vue'
import TenantCreateModal from '../../components/TenantCreateModal.vue'
import { formatDateTime } from '../../utils/format'
import * as ownersApi from '../../api/owners'

const route  = useRoute()
const router = useRouter()

const loading   = ref(false)
const loadError = ref('')

const owner    = ref(null)
const tenants  = ref([])
const unassigned = ref([])

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const uuid = route.params.uuid
    const [o, assigned, unassignedRows] = await Promise.all([
      ownersApi.viewOwner(uuid),
      ownersApi.listAssignedTenants(uuid),
      ownersApi.listUnassignedTenants(),
    ])
    if (!o) { loadError.value = 'Owner not found.'; return }
    owner.value   = o
    tenants.value = Array.isArray(assigned) ? assigned : []
    unassigned.value = Array.isArray(unassignedRows) ? unassignedRows : []
  } catch (e) {
    loadError.value = e?.message || 'Failed to load owner'
  } finally {
    loading.value = false
  }
}

onMounted(load)

/* ─── Profile edit state ─── */
const form = ref({
  name: '', business_name: '', email: '', phone: '', status: 'active'
})
const profileSaving = ref(false)
const profileError  = ref('')
const profileDirty  = computed(() => {
  if (!owner.value) return false
  return (
    form.value.name          !== (owner.value.name          || '') ||
    form.value.business_name !== (owner.value.business_name || '') ||
    form.value.email         !== (owner.value.email         || '') ||
    form.value.phone         !== (owner.value.phone         || '') ||
    form.value.status        !== (owner.value.status        || '')
  )
})

// Hydrate form whenever owner lands
function hydrateForm() {
  if (!owner.value) return
  form.value = {
    name:          owner.value.name          || '',
    business_name: owner.value.business_name || '',
    email:         owner.value.email         || '',
    phone:         owner.value.phone         || '',
    status:        owner.value.status        || 'active'
  }
}

// Re-hydrate once mock load resolves
watch(owner, hydrateForm, { immediate: true })

async function saveProfile() {
  profileError.value = ''
  const f = form.value
  if (!f.name.trim())  { profileError.value = 'Name is required.';  return }
  if (!f.email.trim()) { profileError.value = 'Email is required.'; return }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) {
    profileError.value = 'Email format looks invalid.'; return
  }
  profileSaving.value = true
  try {
    // Status changes go through a dedicated endpoint so the backend can
    // enforce side-effects (e.g. logging the operator). Profile update
    // only covers name/business_name/email/phone.
    const payloads = []
    payloads.push(ownersApi.updateOwner(owner.value.uuid, {
      name: f.name.trim(),
      business_name: f.business_name.trim() || null,
      email: f.email.trim().toLowerCase() || null,
      phone: f.phone.trim() || null,
    }))
    if (f.status !== owner.value.status) {
      payloads.push(ownersApi.setOwnerStatus(owner.value.uuid, f.status))
    }
    await Promise.all(payloads)
    Object.assign(owner.value, {
      name: f.name.trim(),
      business_name: f.business_name.trim(),
      email: f.email.trim().toLowerCase(),
      phone: f.phone.trim(),
      status: f.status
    })
    flash('Profile saved')
  } catch (e) {
    profileError.value = e?.message || 'Failed to save profile'
  } finally {
    profileSaving.value = false
  }
}

function resetFormToSource() { hydrateForm() }

/* ─── Flash ─── */
const flashMsg = ref('')
let flashTimer = null
function flash(m) {
  flashMsg.value = m
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => flashMsg.value = '', 2500)
}

/* ─── Assign tenant modal ─── */
const showAssign    = ref(false)
const assignPick    = ref('')
const assignSaving  = ref(false)
const assignError   = ref('')
function openAssign() {
  assignPick.value = ''
  assignError.value = ''
  showAssign.value = true
}
function closeAssign() {
  if (assignSaving.value) return
  showAssign.value = false
}
async function submitAssign() {
  assignError.value = ''
  if (!assignPick.value) { assignError.value = 'Pick a tenant to assign.'; return }
  assignSaving.value = true
  try {
    await ownersApi.assignTenant(owner.value.uuid, assignPick.value)
    const idx = unassigned.value.findIndex(t => t.tenant_uuid === assignPick.value)
    if (idx >= 0) {
      const t = unassigned.value.splice(idx, 1)[0]
      tenants.value.push(t)
      if (owner.value) owner.value.tenant_count = tenants.value.length
    }
    showAssign.value = false
    flash('Tenant assigned')
  } catch (e) {
    assignError.value = e?.message || 'Failed to assign tenant'
  } finally {
    assignSaving.value = false
  }
}

/* ─── Unassign confirm ─── */
const confirmUnassign = ref({ show: false, tenant: null })
function askUnassign(t) { confirmUnassign.value = { show: true, tenant: t } }
async function doUnassign() {
  const t = confirmUnassign.value.tenant
  confirmUnassign.value = { show: false, tenant: null }
  if (!t) return
  try {
    await ownersApi.unassignTenant(owner.value.uuid, t.tenant_uuid)
    const i = tenants.value.findIndex(x => x.tenant_uuid === t.tenant_uuid)
    if (i >= 0) tenants.value.splice(i, 1)
    unassigned.value.push({ ...t })
    if (owner.value) owner.value.tenant_count = tenants.value.length
    flash(`"${t.display_name}" unassigned`)
  } catch (e) {
    flash(e?.message || 'Failed to unassign tenant')
  }
}

/* ─── Password reset confirm ─── */
const confirmReset = ref(false)
async function doResetPassword() {
  confirmReset.value = false
  if (!owner.value) return
  try {
    await ownersApi.requestOwnerPasswordReset(owner.value.uuid)
    flash(`Password-reset email sent to ${owner.value.email}`)
  } catch (e) {
    flash(e?.message || 'Failed to send reset email')
  }
}

function goBack() { router.push({ name: 'super-owners' }) }

const showNewTenant = ref(false)
function openNewTenant() { showNewTenant.value = true }
function closeNewTenant() { showNewTenant.value = false }
function onTenantCreated(t) {
  // Local mock: append to assigned list so the owner sees the new branch immediately.
  if (!t) return
  tenants.value.push({
    tenant_uuid: t.uuid || t.tenant_uuid || ('t-new-' + Math.random().toString(36).slice(2, 8)),
    display_name: t.display_name,
    store_code:   t.store_code,
    branch:       t.branch || '',
    status:       t.status || 'active'
  })
  if (owner.value) owner.value.tenant_count = tenants.value.length
  showNewTenant.value = false
  flash(`Tenant "${t.display_name}" created & assigned`)
}
</script>

<template>
  <div class="flex h-full flex-col gap-4">
    <!-- Breadcrumb / back -->
    <div class="flex items-center gap-2 text-sm">
      <button class="inline-flex items-center gap-1 text-slate-600 hover:text-brand-700 hover:underline"
              @click="goBack">
        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Back to Owners
      </button>
      <span class="text-slate-300">/</span>
      <span class="font-semibold text-slate-800">{{ owner?.name || '…' }}</span>
    </div>

    <transition name="fade">
      <div v-if="flashMsg" class="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
        {{ flashMsg }}
      </div>
    </transition>

    <SkeletonRows v-if="loading && !owner" :rows="6" />
    <EmptyState
      v-else-if="loadError"
      title="Unavailable"
      :message="loadError"
    />

    <template v-else-if="owner">
      <div class="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-5">
        <!-- Profile panel -->
        <section class="card lg:col-span-2 flex flex-col overflow-hidden">
          <div class="card-header">
            <div>
              <div class="text-sm font-semibold text-slate-800">Profile</div>
              <div class="text-xs text-slate-500">Identity &amp; contact</div>
            </div>
            <span
              class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
              :class="owner.status === 'active'
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-slate-200 text-slate-600'">
              {{ owner.status }}
            </span>
          </div>

          <form class="flex-1 space-y-4 p-4" @submit.prevent="saveProfile">
            <div v-if="profileError" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {{ profileError }}
            </div>

            <div class="block">
              <span class="label">Username</span>
              <div class="relative">
                <input
                  :value="owner.username"
                  class="input font-mono pr-20 bg-slate-50 text-slate-700"
                  readonly
                />
                <span class="absolute inset-y-0 right-2 my-auto h-5 inline-flex items-center rounded bg-slate-200 px-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
                  Locked
                </span>
              </div>
              <p class="mt-1 text-[11px] text-slate-500">
                Username is set at creation and cannot be changed.
              </p>
            </div>
            <label class="block">
              <span class="label">Full name <span class="text-rose-500">*</span></span>
              <input v-model="form.name" class="input" required />
            </label>
            <label class="block">
              <span class="label">Business name</span>
              <input v-model="form.business_name" class="input" />
            </label>
            <label class="block">
              <span class="label">Email <span class="text-rose-500">*</span></span>
              <input v-model="form.email" type="email" class="input" required />
            </label>
            <label class="block">
              <span class="label">Phone</span>
              <input v-model="form.phone" class="input" />
            </label>
            <label class="block">
              <span class="label">Status</span>
              <select v-model="form.status" class="input">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>

            <!-- Read-only metadata -->
            <dl class="grid grid-cols-2 gap-x-3 gap-y-1 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
              <dt class="font-medium text-slate-500">Created</dt>
              <dd class="truncate">{{ formatDateTime(owner.created_at) }}</dd>
              <dt class="font-medium text-slate-500">Created by</dt>
              <dd class="truncate">{{ owner.created_by || '—' }}</dd>
              <dt class="font-medium text-slate-500">Last login</dt>
              <dd class="truncate">{{ owner.last_logindate ? formatDateTime(owner.last_logindate) : '— never —' }}</dd>
              <dt class="font-medium text-slate-500">Owner UUID</dt>
              <dd class="truncate font-mono">{{ owner.uuid }}</dd>
            </dl>

            <div class="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
              <button type="submit"
                      class="btn-primary"
                      :disabled="profileSaving || !profileDirty">
                <span v-if="profileSaving">Saving…</span>
                <span v-else>Save changes</span>
              </button>
              <button type="button"
                      class="btn-secondary"
                      :disabled="profileSaving || !profileDirty"
                      @click="resetFormToSource">
                Revert
              </button>
              <button type="button"
                      class="btn-ghost ml-auto !text-amber-700 hover:!bg-amber-50"
                      @click="confirmReset = true">
                Send password reset
              </button>
            </div>
          </form>
        </section>

        <!-- Assigned Tenants panel -->
        <section class="card lg:col-span-3 flex flex-col overflow-hidden">
          <div class="card-header">
            <div>
              <div class="text-sm font-semibold text-slate-800">Assigned Tenants</div>
              <div class="text-xs text-slate-500">
                {{ tenants.length }} tenant{{ tenants.length === 1 ? '' : 's' }} owned
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <button class="btn-secondary"
                      :disabled="!unassigned.length"
                      @click="openAssign"
                      title="Link an existing unassigned tenant to this owner">
                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                     stroke-linecap="round" stroke-linejoin="round">
                  <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
                  <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
                </svg>
                Assign existing
              </button>
              <button class="btn-primary"
                      @click="openNewTenant"
                      title="Create a new tenant and assign it to this owner">
                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                     stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                New tenant
              </button>
            </div>
          </div>

          <div class="min-h-0 flex-1 overflow-auto">
            <EmptyState
              v-if="!tenants.length"
              title="No tenants assigned"
              message="Assign a tenant from the dropdown above to link it to this owner."
            />
            <table v-else class="table">
              <thead class="sticky top-0 z-10 bg-slate-50 shadow-[inset_0_-1px_0_theme(colors.slate.100)]">
                <tr>
                  <th class="text-left">Tenant</th>
                  <th class="text-left">Store code</th>
                  <th class="text-left">Branch</th>
                  <th class="text-left">Status</th>
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="t in tenants" :key="t.tenant_uuid" class="hover:bg-slate-50/60">
                  <td class="whitespace-nowrap font-semibold text-slate-800">{{ t.display_name }}</td>
                  <td class="whitespace-nowrap">{{ t.store_code }}</td>
                  <td>{{ t.branch || '—' }}</td>
                  <td>
                    <span
                      class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
                      :class="t.status === 'active'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-200 text-slate-600'">
                      {{ t.status }}
                    </span>
                  </td>
                  <td class="text-right">
                    <button class="btn-ghost !text-rose-600 hover:!bg-rose-50"
                            @click="askUnassign(t)">
                      Unassign
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </template>

    <!-- Assign tenant modal -->
    <Modal :show="showAssign" @close="closeAssign" title="Assign a tenant" size="md">
      <form class="space-y-4" @submit.prevent="submitAssign">
        <div v-if="assignError" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ assignError }}
        </div>

        <p class="text-sm text-slate-600">
          Pick an unassigned tenant to link to <b>{{ owner?.name }}</b>. One tenant can have at most one owner.
        </p>

        <label class="block">
          <span class="label">Tenant</span>
          <select v-model="assignPick" class="input" :disabled="!unassigned.length">
            <option value="" disabled>— Pick a tenant —</option>
            <option v-for="t in unassigned" :key="t.tenant_uuid" :value="t.tenant_uuid">
              {{ t.display_name }} · {{ t.store_code }}{{ t.branch ? ' / ' + t.branch : '' }}
            </option>
          </select>
          <span v-if="!unassigned.length" class="mt-1 block text-xs text-slate-500">
            No unassigned tenants available right now.
          </span>
        </label>

        <div class="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
          <button type="button" class="btn-secondary" :disabled="assignSaving" @click="closeAssign">Cancel</button>
          <button type="submit" class="btn-primary" :disabled="assignSaving || !unassigned.length">
            <span v-if="assignSaving">Assigning…</span>
            <span v-else>Assign</span>
          </button>
        </div>
      </form>
    </Modal>

    <ConfirmDialog
      :show="confirmUnassign.show"
      title="Unassign tenant?"
      :message="confirmUnassign.tenant
        ? `&ldquo;${confirmUnassign.tenant.display_name}&rdquo; will no longer belong to this owner. The tenant itself is not deleted and can be reassigned later.`
        : ''"
      :danger="true"
      confirm-text="Unassign"
      @close="confirmUnassign = { show: false, tenant: null }"
      @confirm="doUnassign"
    />

    <ConfirmDialog
      :show="confirmReset"
      title="Send password reset email?"
      :message="owner ? `An email with a reset link will be sent to ${owner.email}.` : ''"
      :danger="false"
      confirm-text="Send"
      @close="confirmReset = false"
      @confirm="doResetPassword"
    />

    <!-- New Tenant modal — identical UI to SuperTenantsView's create flow,
         with Assign to Owner locked to this owner. -->
    <TenantCreateModal
      :show="showNewTenant"
      :preset-owner-uuid="owner?.uuid || ''"
      @close="closeNewTenant"
      @created="onTenantCreated"
    />
  </div>
</template>
