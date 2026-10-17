<script setup>
import { computed, ref, watch } from 'vue'
import Modal from './Modal.vue'
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

// Independent per-section state. Each section has its own password input,
// own submitting flag, own error/success — one section's failure does
// not interrupt the other two.
const txPassword = ref('')
const txSubmitting = ref(false)
const txMessage = ref('')
const txError = ref('')

const prPassword = ref('')
const prSubmitting = ref(false)
const prMessage = ref('')
const prError = ref('')

const copyPassword = ref('')
const copySource = ref('')
const copyTables = ref([])
const copySubmitting = ref(false)
const copyMessage = ref('')
const copyError = ref('')

// Reset everything whenever the modal is reopened for a different tenant.
watch(() => props.show, (now) => {
  if (!now) return
  txPassword.value = ''
  txSubmitting.value = false
  txMessage.value = ''
  txError.value = ''
  prPassword.value = ''
  prSubmitting.value = false
  prMessage.value = ''
  prError.value = ''
  copyPassword.value = ''
  copySource.value = ''
  copyTables.value = []
  copySubmitting.value = false
  copyMessage.value = ''
  copyError.value = ''
})

const sourceCandidates = computed(() =>
  (props.allTenants || []).filter((t) => t?.uuid && t.uuid !== props.tenant?.uuid),
)

function formatCounts(counts) {
  if (!counts || typeof counts !== 'object') return ''
  const rows = Object.entries(counts).filter(([, n]) => Number(n) > 0)
  if (!rows.length) return 'Nothing to delete.'
  return rows.map(([t, n]) => `${t}: ${n}`).join(', ')
}

function extractErrorMessage(err) {
  return err?.response?.data?.message || err?.data?.message || err?.message || 'Request failed.'
}

async function runDeleteTransactions() {
  if (!props.tenant?.uuid || !txPassword.value) return
  txSubmitting.value = true
  txMessage.value = ''
  txError.value = ''
  try {
    const resp = await tenantsApi.migrationDeleteTransactions(props.tenant.uuid, txPassword.value)
    const deleted = resp?.data?.deleted || resp?.deleted || {}
    txMessage.value = `Transactions deleted — ${formatCounts(deleted)}`
    txPassword.value = ''
    emit('done', { action: 'delete-transactions', deleted })
  } catch (e) {
    txError.value = extractErrorMessage(e)
  } finally {
    txSubmitting.value = false
  }
}

async function runDeletePatientRecords() {
  if (!props.tenant?.uuid || !prPassword.value) return
  prSubmitting.value = true
  prMessage.value = ''
  prError.value = ''
  try {
    const resp = await tenantsApi.migrationDeletePatientRecords(props.tenant.uuid, prPassword.value)
    const deleted = resp?.data?.deleted || resp?.deleted || {}
    prMessage.value = `Patient records (and all transactions) deleted — ${formatCounts(deleted)}`
    prPassword.value = ''
    emit('done', { action: 'delete-patient-records', deleted })
  } catch (e) {
    prError.value = extractErrorMessage(e)
  } finally {
    prSubmitting.value = false
  }
}

async function runCopyCatalog() {
  if (!props.tenant?.uuid || !copyPassword.value || !copySource.value || !copyTables.value.length) return
  copySubmitting.value = true
  copyMessage.value = ''
  copyError.value = ''
  try {
    const resp = await tenantsApi.migrationCopyCatalog(
      props.tenant.uuid,
      copyPassword.value,
      copySource.value,
      copyTables.value,
    )
    const inserted = resp?.data?.inserted || resp?.inserted || {}
    copyMessage.value = `Copied — ${formatCounts(inserted)}`
    copyPassword.value = ''
    emit('done', { action: 'copy-catalog', inserted })
  } catch (e) {
    copyError.value = extractErrorMessage(e)
  } finally {
    copySubmitting.value = false
  }
}

function toggleTable(name) {
  const i = copyTables.value.indexOf(name)
  if (i === -1) copyTables.value.push(name)
  else copyTables.value.splice(i, 1)
}

function selectAllTables() { copyTables.value = [...copyableTables] }
function clearAllTables() { copyTables.value = [] }
</script>

<template>
  <Modal :show="show" :title="`Tenant Migration — ${tenant?.display_name || ''}`" size="xl" @close="emit('close')">
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
          <div>
            <label class="label">Your password</label>
            <input v-model="txPassword" type="password" class="input" :disabled="txSubmitting" autocomplete="current-password" />
          </div>
          <div v-if="txError" class="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">{{ txError }}</div>
          <div v-if="txMessage" class="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">{{ txMessage }}</div>
          <div class="flex justify-end">
            <button type="button" class="btn-danger" :disabled="!txPassword || txSubmitting" @click="runDeleteTransactions">
              <span v-if="txSubmitting">Deleting…</span>
              <span v-else>Delete transactions</span>
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
          <div>
            <label class="label">Your password</label>
            <input v-model="prPassword" type="password" class="input" :disabled="prSubmitting" autocomplete="current-password" />
          </div>
          <div v-if="prError" class="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">{{ prError }}</div>
          <div v-if="prMessage" class="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">{{ prMessage }}</div>
          <div class="flex justify-end">
            <button type="button" class="btn-danger" :disabled="!prPassword || prSubmitting" @click="runDeletePatientRecords">
              <span v-if="prSubmitting">Deleting…</span>
              <span v-else>Delete patient records + transactions</span>
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
            <select v-model="copySource" class="input" :disabled="copySubmitting">
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
                  :disabled="copySubmitting"
                  @change="toggleTable(t)"
                />
                <span class="font-mono">{{ t }}</span>
              </label>
            </div>
            <div class="mt-1 text-[11px] text-slate-500">
              Codes are unique per tenant — if a child table (e.g. <code>test_items</code>) is selected without its parent (<code>item_categories</code>, <code>item_groups</code>), the server rejects with a clear error.
            </div>
          </div>

          <div>
            <label class="label">Your password</label>
            <input v-model="copyPassword" type="password" class="input" :disabled="copySubmitting" autocomplete="current-password" />
          </div>

          <div v-if="copyError" class="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">{{ copyError }}</div>
          <div v-if="copyMessage" class="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">{{ copyMessage }}</div>

          <div class="flex justify-end">
            <button
              type="button"
              class="btn-primary"
              :disabled="!copyPassword || !copySource || !copyTables.length || copySubmitting"
              @click="runCopyCatalog"
            >
              <span v-if="copySubmitting">Copying…</span>
              <span v-else>Copy catalog</span>
            </button>
          </div>
        </div>
      </section>
    </div>

    <template #footer>
      <button type="button" class="btn-secondary" @click="emit('close')">Close</button>
    </template>
  </Modal>
</template>
