<script setup>
import { computed, ref, watch } from 'vue'
import Modal from './Modal.vue'
import PasswordConfirmDialog from './PasswordConfirmDialog.vue'
import * as tenantsApi from '../api/tenants'

const props = defineProps({
  show: Boolean,
  tenant: { type: Object, default: null },
  // All tenants (minus the target) for the copy-catalog source picker.
  // Caller already has this list loaded on SuperTenantsView, so we just
  // reuse it instead of fetching again.
  allTenants: { type: Array, default: () => [] }
})
const emit = defineEmits(['close', 'done'])

const copyableTables = tenantsApi.COPYABLE_CATALOG_TABLES

// Copy-catalog form state. Password lives in the PasswordConfirmDialog;
// the modal only tracks the catalog-specific inputs (source + tables).
const copySource = ref('')
const copyTables = ref([])

// Per-section inline result/error — populated after the password dialog
// closes and the API call either resolves or rejects.
const txMessage = ref('')
const txError   = ref('')
const prMessage = ref('')
const prError   = ref('')
const copyMessage = ref('')
const copyError   = ref('')

// Password-dialog + in-flight state. `pending` identifies which action
// triggered the dialog so the submit handler knows which API to call.
// `running` drives the full-modal progress overlay once password is
// confirmed and the backend starts work.
const pending = ref(null) // 'delete-transactions' | 'delete-patient-records' | 'copy-catalog'
const running = ref(null) // same enum while the API call is in flight
const passwordBusy = ref(false)
const passwordError = ref('')

// Reset everything whenever the modal is reopened for a different tenant.
watch(() => props.show, (now) => {
  if (!now) return
  copySource.value = ''
  copyTables.value = []
  txMessage.value = ''
  txError.value = ''
  prMessage.value = ''
  prError.value = ''
  copyMessage.value = ''
  copyError.value = ''
  pending.value = null
  running.value = null
  passwordBusy.value = false
  passwordError.value = ''
})

const sourceCandidates = computed(() =>
  (props.allTenants || []).filter((t) => t?.uuid && t.uuid !== props.tenant?.uuid),
)

const pendingConfig = computed(() => {
  switch (pending.value) {
    case 'delete-transactions':
      return {
        title: 'Confirm: Delete transactions',
        message: `Enter your password to delete lab results, payments, requisitions, and patient cases for ${props.tenant?.display_name || 'this tenant'}. Patient master records will be kept.`,
        confirmText: 'Delete transactions',
        danger: true,
      }
    case 'delete-patient-records':
      return {
        title: 'Confirm: Delete patient records',
        message: `Enter your password to delete every patient on ${props.tenant?.display_name || 'this tenant'}. All of their transactions will be deleted in the same operation.`,
        confirmText: 'Delete patient records',
        danger: true,
      }
    case 'copy-catalog':
      return {
        title: 'Confirm: Copy catalog',
        message: `Enter your password to copy the selected catalog tables into ${props.tenant?.display_name || 'this tenant'}.`,
        confirmText: 'Copy catalog',
        danger: false,
      }
    default:
      return { title: '', message: '', confirmText: 'Confirm', danger: true }
  }
})

const runningLabel = computed(() => {
  switch (running.value) {
    case 'delete-transactions':   return 'Deleting transactions…'
    case 'delete-patient-records': return 'Deleting patient records and transactions…'
    case 'copy-catalog':          return 'Copying catalog…'
    default:                      return ''
  }
})

const copyFormValid = computed(() => !!copySource.value && copyTables.value.length > 0)

function formatCounts(counts) {
  if (!counts || typeof counts !== 'object') return ''
  const rows = Object.entries(counts).filter(([, n]) => Number(n) > 0)
  if (!rows.length) return 'Nothing to delete.'
  return rows.map(([t, n]) => `${t}: ${n}`).join(', ')
}

function extractErrorMessage(err) {
  return err?.response?.data?.message || err?.data?.message || err?.message || 'Request failed.'
}

// Dialog triggers — button clicks only open the password dialog. The
// actual API call happens in `confirmPassword` once the user types the
// password and clicks confirm.
function askDeleteTransactions() {
  txMessage.value = ''
  txError.value = ''
  passwordError.value = ''
  pending.value = 'delete-transactions'
}
function askDeletePatientRecords() {
  prMessage.value = ''
  prError.value = ''
  passwordError.value = ''
  pending.value = 'delete-patient-records'
}
function askCopyCatalog() {
  if (!copyFormValid.value) return
  copyMessage.value = ''
  copyError.value = ''
  passwordError.value = ''
  pending.value = 'copy-catalog'
}

async function confirmPassword(password) {
  if (!pending.value || !props.tenant?.uuid) return
  const action = pending.value
  passwordBusy.value = true
  passwordError.value = ''
  try {
    // Close dialog + flip into the full-modal "running" overlay for the
    // slower part of the work. Password dialog closes right away so the
    // user sees the progress bar immediately.
    pending.value = null
    running.value = action

    if (action === 'delete-transactions') {
      const resp = await tenantsApi.migrationDeleteTransactions(props.tenant.uuid, password)
      const deleted = resp?.data?.deleted || resp?.deleted || {}
      txMessage.value = `Transactions deleted — ${formatCounts(deleted)}`
      emit('done', { action, deleted })
    } else if (action === 'delete-patient-records') {
      const resp = await tenantsApi.migrationDeletePatientRecords(props.tenant.uuid, password)
      const deleted = resp?.data?.deleted || resp?.deleted || {}
      prMessage.value = `Patient records (and all transactions) deleted — ${formatCounts(deleted)}`
      emit('done', { action, deleted })
    } else if (action === 'copy-catalog') {
      const resp = await tenantsApi.migrationCopyCatalog(
        props.tenant.uuid,
        password,
        copySource.value,
        copyTables.value,
      )
      const inserted = resp?.data?.inserted || resp?.inserted || {}
      copyMessage.value = `Copied — ${formatCounts(inserted)}`
      emit('done', { action, inserted })
    }
  } catch (e) {
    const msg = extractErrorMessage(e)
    if (action === 'delete-transactions') txError.value = msg
    if (action === 'delete-patient-records') prError.value = msg
    if (action === 'copy-catalog') copyError.value = msg
  } finally {
    passwordBusy.value = false
    running.value = null
  }
}

function cancelPassword() {
  if (passwordBusy.value) return
  pending.value = null
}

function toggleTable(name) {
  const i = copyTables.value.indexOf(name)
  if (i === -1) copyTables.value.push(name)
  else copyTables.value.splice(i, 1)
}

function selectAllTables() { copyTables.value = [...copyableTables] }
function clearAllTables() { copyTables.value = [] }

// Block main-modal close while an action is actually in flight so the
// user doesn't accidentally dismiss and lose the in-progress state.
function onMainClose() {
  if (running.value) return
  emit('close')
}
</script>

<template>
  <Modal :show="show" :title="`Tenant Migration — ${tenant?.display_name || ''}`" size="xl" @close="onMainClose">
    <div class="relative">
      <!-- Full-modal progress overlay while any action is running. Covers
           every section so the user can't accidentally start a second
           action while the first is still in flight. -->
      <div v-if="running"
           class="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-lg bg-white/85 dark:bg-slate-900/85 backdrop-blur-sm">
        <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">{{ runningLabel }}</div>
        <!-- Indeterminate progress bar: backend doesn't stream progress,
             so we show a sliding gradient to signal "working, not stuck". -->
        <div class="relative h-1.5 w-64 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div class="absolute inset-y-0 w-1/3 animate-indeterminate rounded-full bg-brand-600"></div>
        </div>
        <div class="text-xs text-slate-500">Please don't close this window.</div>
      </div>

      <div class="space-y-6">
        <!-- Target banner so super-admin can't lose track of which tenant
             they're about to wipe when scrolling. -->
        <div class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <div class="font-semibold">Target tenant</div>
          <div class="mt-0.5 flex flex-wrap items-baseline gap-2">
            <span class="text-sm font-bold">{{ tenant?.display_name || '—' }}</span>
            <span class="font-mono">{{ tenant?.store_code || '' }}</span>
            <span class="text-amber-700">· {{ tenant?.uuid || '' }}</span>
          </div>
        </div>

        <!-- Section 1 — delete transactions only -->
        <section class="rounded-lg border border-slate-200 dark:border-slate-700">
          <div class="border-b border-slate-100 dark:border-slate-800 px-4 py-3">
            <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">Delete transactions</div>
            <div class="mt-0.5 text-xs text-slate-500">
              Purges lab results, payments, requisitions, and patient cases for this tenant. Patient master records are kept.
            </div>
          </div>
          <div class="space-y-3 px-4 py-3">
            <div v-if="txError" class="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">{{ txError }}</div>
            <div v-if="txMessage" class="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">{{ txMessage }}</div>
            <div class="flex justify-end">
              <button type="button" class="btn-danger" @click="askDeleteTransactions">
                Delete transactions
              </button>
            </div>
          </div>
        </section>

        <!-- Section 2 — delete patient records (cascades through transactions) -->
        <section class="rounded-lg border border-rose-200 dark:border-rose-700/40">
          <div class="border-b border-rose-100 dark:border-rose-700/40 px-4 py-3">
            <div class="text-sm font-semibold text-rose-700 dark:text-rose-300">Delete patient records</div>
            <div class="mt-0.5 text-xs text-rose-700/90 dark:text-rose-300/90">
              Deletes every patient on this tenant. <span class="font-semibold">All of their transactions (lab results, payments, requisitions, patient cases) are also deleted</span> in the same transaction — patient rows cannot be removed while they still have records pointing at them.
            </div>
          </div>
          <div class="space-y-3 px-4 py-3">
            <div v-if="prError" class="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">{{ prError }}</div>
            <div v-if="prMessage" class="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">{{ prMessage }}</div>
            <div class="flex justify-end">
              <button type="button" class="btn-danger" @click="askDeletePatientRecords">
                Delete patient records + transactions
              </button>
            </div>
          </div>
        </section>

        <!-- Section 3 — copy catalog from source tenant -->
        <section class="rounded-lg border border-slate-200 dark:border-slate-700">
          <div class="border-b border-slate-100 dark:border-slate-800 px-4 py-3">
            <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">Copy catalog from another tenant</div>
            <div class="mt-0.5 text-xs text-slate-500">
              Copies the selected catalog tables from a source tenant into this one. Refused if any selected table on this tenant already has rows — purge those first (above or via a data script).
            </div>
          </div>
          <div class="space-y-3 px-4 py-3">
            <div>
              <label class="label">Source tenant</label>
              <select v-model="copySource" class="input">
                <option value="">— pick a source tenant —</option>
                <option v-for="t in sourceCandidates" :key="t.uuid" :value="t.uuid">
                  {{ t.display_name }} ({{ t.store_code }})
                </option>
              </select>
            </div>

            <div>
              <div class="mb-1 flex items-center justify-between">
                <label class="label !mb-0">Tables to copy</label>
                <div class="flex gap-2 text-xs">
                  <button type="button" class="text-brand-600 hover:underline" @click="selectAllTables">Select all</button>
                  <button type="button" class="text-slate-500 hover:underline" @click="clearAllTables">Clear</button>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-2 rounded-md border border-slate-200 dark:border-slate-700 p-2">
                <label v-for="t in copyableTables" :key="t" class="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    :checked="copyTables.includes(t)"
                    @change="toggleTable(t)"
                  />
                  <span class="font-mono">{{ t }}</span>
                </label>
              </div>
              <div class="mt-1 text-[11px] text-slate-500">
                Codes are unique per tenant — if a child table (e.g. <code>test_items</code>) is selected without its parent (<code>item_categories</code>, <code>item_groups</code>), the server rejects with a clear error.
              </div>
            </div>

            <div v-if="copyError" class="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">{{ copyError }}</div>
            <div v-if="copyMessage" class="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">{{ copyMessage }}</div>

            <div class="flex justify-end">
              <button
                type="button"
                class="btn-primary"
                :disabled="!copyFormValid"
                @click="askCopyCatalog"
              >
                Copy catalog
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>

    <template #footer>
      <button type="button" class="btn-secondary" :disabled="!!running" @click="emit('close')">Close</button>
    </template>
  </Modal>

  <PasswordConfirmDialog
    :show="!!pending"
    :title="pendingConfig.title"
    :message="pendingConfig.message"
    :confirm-text="pendingConfig.confirmText"
    :danger="pendingConfig.danger"
    :busy="passwordBusy"
    @close="cancelPassword"
    @confirm="confirmPassword"
  />
</template>

<style scoped>
@keyframes indeterminate {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(300%); }
}
.animate-indeterminate {
  animation: indeterminate 1.2s ease-in-out infinite;
}
</style>
