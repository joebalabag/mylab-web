<script setup>
import { computed, ref, watch } from 'vue'
import Modal from './Modal.vue'
import PasswordConfirmDialog from './PasswordConfirmDialog.vue'
import TenantPickerModal from './TenantPickerModal.vue'
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
const lookupTables = tenantsApi.LOOKUP_DATA_TABLES

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
const lkMessage = ref('')
const lkError   = ref('')
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

// "Check records" read-only preview state. Each section has its own
// busy flag so one preview spinner never blanks the other two. A single
// targetCounts cache is shared across sections (one GET returns every
// slice we need). sourceCounts applies to the copy-catalog section only.
const targetCounts = ref(null)
const targetCountsCheckedAt = ref('')
const sourceCounts = ref(null)
const sourceCountsCheckedAt = ref('')

const txCheckBusy = ref(false)
const txCheckError = ref('')
const prCheckBusy = ref(false)
const prCheckError = ref('')
const lkCheckBusy = ref(false)
const lkCheckError = ref('')
const copyCheckBusy = ref(false)
const copyCheckError = ref('')

// Expander state per section. All collapsed by default so the modal
// opens with just the section headers visible and the admin decides
// which one they're interested in.
const expanded = ref({ tx: false, pr: false, lk: false, copy: false })
function toggleSection(key) { expanded.value[key] = !expanded.value[key] }

// Source tenant picker modal — opened from the copy-catalog section.
// Tenant list grows unbounded over time; a dropdown stops scaling once
// the super-admin can't scan the list visually. The picker modal has
// its own search filter + table.
const sourcePickerOpen = ref(false)
function openSourcePicker() { sourcePickerOpen.value = true }
function closeSourcePicker() { sourcePickerOpen.value = false }
function onSourcePicked(t) {
  copySource.value = t?.uuid || ''
}
const copySourceTenant = computed(() => {
  if (!copySource.value) return null
  return (props.allTenants || []).find((t) => t?.uuid === copySource.value) || null
})

// Reset everything whenever the modal is reopened for a different tenant.
watch(() => props.show, (now) => {
  if (!now) return
  copySource.value = ''
  copyTables.value = []
  txMessage.value = ''
  txError.value = ''
  prMessage.value = ''
  prError.value = ''
  lkMessage.value = ''
  lkError.value = ''
  copyMessage.value = ''
  copyError.value = ''
  pending.value = null
  expanded.value = { tx: false, pr: false, lk: false, copy: false }
  running.value = null
  passwordBusy.value = false
  passwordError.value = ''
  targetCounts.value = null
  targetCountsCheckedAt.value = ''
  sourceCounts.value = null
  sourceCountsCheckedAt.value = ''
  txCheckError.value = ''
  prCheckError.value = ''
  lkCheckError.value = ''
  copyCheckError.value = ''
  sourcePickerOpen.value = false
})

// Whenever the copy-source changes, drop any cached source counts so the
// "Check records" button re-fetches against the new source on next click.
watch(copySource, () => {
  sourceCounts.value = null
  sourceCountsCheckedAt.value = ''
})

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
    case 'delete-lookup-data':
      return {
        title: 'Confirm: Delete look-up data',
        message: `Enter your password to delete the catalog (item groups, categories, test items, components, packages, package items) for ${props.tenant?.display_name || 'this tenant'}. Doctors and discounts are kept.`,
        confirmText: 'Delete look-up data',
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
    case 'delete-lookup-data':    return 'Deleting look-up data…'
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

function nowStamp() {
  const d = new Date()
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// Shared target-tenant counts fetcher. Each section's "Check records"
// button sets its own busy/error flags around this call so one section
// can preview while another one is already showing a stale (or no) cache.
async function fetchTargetCounts() {
  const resp = await tenantsApi.migrationRecordCounts(props.tenant.uuid)
  const data = resp?.data || resp
  targetCounts.value = data
  targetCountsCheckedAt.value = nowStamp()
}

async function checkTxRecords() {
  if (!props.tenant?.uuid) return
  txCheckBusy.value = true
  txCheckError.value = ''
  try { await fetchTargetCounts() }
  catch (e) { txCheckError.value = extractErrorMessage(e) }
  finally { txCheckBusy.value = false }
}

async function checkPrRecords() {
  if (!props.tenant?.uuid) return
  prCheckBusy.value = true
  prCheckError.value = ''
  try { await fetchTargetCounts() }
  catch (e) { prCheckError.value = extractErrorMessage(e) }
  finally { prCheckBusy.value = false }
}

async function checkLkRecords() {
  if (!props.tenant?.uuid) return
  lkCheckBusy.value = true
  lkCheckError.value = ''
  try { await fetchTargetCounts() }
  catch (e) { lkCheckError.value = extractErrorMessage(e) }
  finally { lkCheckBusy.value = false }
}

// Copy section needs both: target counts (to show the 409 preflight
// state) and source counts (to show what's available to copy). If source
// isn't picked yet we only fetch target.
async function checkCopyRecords() {
  if (!props.tenant?.uuid) return
  copyCheckBusy.value = true
  copyCheckError.value = ''
  try {
    await fetchTargetCounts()
    if (copySource.value) {
      const resp = await tenantsApi.migrationRecordCounts(copySource.value)
      const data = resp?.data || resp
      sourceCounts.value = data
      sourceCountsCheckedAt.value = nowStamp()
    }
  } catch (e) {
    copyCheckError.value = extractErrorMessage(e)
  } finally {
    copyCheckBusy.value = false
  }
}

const copyBlockingTables = computed(() => {
  if (!targetCounts.value?.catalog) return []
  return copyTables.value.filter((t) => (targetCounts.value.catalog[t] || 0) > 0)
})

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
function askDeleteLookupData() {
  lkMessage.value = ''
  lkError.value = ''
  passwordError.value = ''
  pending.value = 'delete-lookup-data'
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
    } else if (action === 'delete-lookup-data') {
      const resp = await tenantsApi.migrationDeleteLookupData(props.tenant.uuid, password)
      const deleted = resp?.data?.deleted || resp?.deleted || {}
      lkMessage.value = `Look-up data deleted — ${formatCounts(deleted)}`
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

    // Refresh the counts panel so the admin sees the post-op state (all
    // zeros after a delete, source totals after a copy) without having
    // to click Check records again. Swallow any refresh error — the
    // primary success message must stay intact.
    try { await fetchTargetCounts() } catch (_e) { /* ignore */ }
  } catch (e) {
    const msg = extractErrorMessage(e)
    if (action === 'delete-transactions') txError.value = msg
    if (action === 'delete-patient-records') prError.value = msg
    if (action === 'delete-lookup-data') lkError.value = msg
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
          <button type="button"
                  class="flex w-full items-start gap-3 border-b border-slate-100 dark:border-slate-800 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  :class="{ 'border-b-0': !expanded.tx }"
                  @click="toggleSection('tx')">
            <svg viewBox="0 0 24 24" class="mt-0.5 h-4 w-4 shrink-0 text-slate-500 transition-transform" :class="{ 'rotate-90': expanded.tx }"
                 fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            <div class="flex-1">
              <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">Delete transactions</div>
              <div class="mt-0.5 text-xs text-slate-500">
                Purges lab results, payments, requisitions, and patient cases for this tenant. Patient master records are kept.
              </div>
            </div>
          </button>
          <div v-show="expanded.tx" class="space-y-3 px-4 py-3">
            <div v-if="txError" class="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">{{ txError }}</div>
            <div v-if="txMessage" class="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">{{ txMessage }}</div>

            <!-- Check records preview — fetches current counts so admin
                 sees exactly what will be deleted before confirming. -->
            <div v-if="targetCounts" class="rounded border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800 p-2 text-xs">
              <div class="mb-1 flex items-center justify-between">
                <span class="font-semibold text-slate-700 dark:text-slate-200">Current counts on target</span>
                <span v-if="targetCountsCheckedAt" class="text-[10px] text-slate-500">as of {{ targetCountsCheckedAt }}</span>
              </div>
              <div class="grid grid-cols-2 gap-x-4 gap-y-0.5">
                <div v-for="(n, t) in targetCounts.transactions" :key="t" class="flex justify-between">
                  <span class="font-mono text-slate-600 dark:text-slate-300">{{ t }}</span>
                  <span :class="n > 0 ? 'font-semibold text-slate-800 dark:text-slate-100' : 'text-slate-400'">{{ n }}</span>
                </div>
              </div>
            </div>
            <div v-if="txCheckError" class="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">{{ txCheckError }}</div>

            <!-- Details note so admin isn't guessing what the FK cascade covers. -->
            <div class="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-[11px] text-slate-600 dark:text-slate-300">
              <div class="mb-1 font-semibold text-slate-700 dark:text-slate-200">Notes</div>
              <ul class="list-disc space-y-0.5 pl-4">
                <li>Delete order (FK-safe, children first): <code>lab_result_values</code> → <code>lab_report_items</code> → <code>lab_reports</code> → <code>payment_items</code> → <code>payments</code> → <code>patient_requisition_items</code> → <code>patient_requisitions</code> → <code>patient_cases</code>.</li>
                <li>Runs inside a single DB transaction — a failure mid-way rolls everything back.</li>
                <li><code>patients</code> master records are <strong>not</strong> touched. Use the next section to also remove patients.</li>
              </ul>
            </div>

            <div class="flex justify-between">
              <button type="button" class="btn-secondary" :disabled="txCheckBusy" @click="checkTxRecords">
                <span v-if="txCheckBusy">Checking…</span>
                <span v-else>Check records</span>
              </button>
              <button type="button" class="btn-danger" @click="askDeleteTransactions">
                Delete transactions
              </button>
            </div>
          </div>
        </section>

        <!-- Section 2 — delete patient records (cascades through transactions) -->
        <section class="rounded-lg border border-rose-200 dark:border-rose-700/40">
          <button type="button"
                  class="flex w-full items-start gap-3 border-b border-rose-100 dark:border-rose-700/40 px-4 py-3 text-left hover:bg-rose-50/50 dark:hover:bg-rose-900/20"
                  :class="{ 'border-b-0': !expanded.pr }"
                  @click="toggleSection('pr')">
            <svg viewBox="0 0 24 24" class="mt-0.5 h-4 w-4 shrink-0 text-rose-600 transition-transform" :class="{ 'rotate-90': expanded.pr }"
                 fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            <div class="flex-1">
              <div class="text-sm font-semibold text-rose-700 dark:text-rose-300">Delete patient records</div>
              <div class="mt-0.5 text-xs text-rose-700/90 dark:text-rose-300/90">
                Deletes every patient on this tenant. <span class="font-semibold">All of their transactions (lab results, payments, requisitions, patient cases) are also deleted</span> in the same transaction — patient rows cannot be removed while they still have records pointing at them.
              </div>
            </div>
          </button>
          <div v-show="expanded.pr" class="space-y-3 px-4 py-3">
            <div v-if="prError" class="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">{{ prError }}</div>
            <div v-if="prMessage" class="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">{{ prMessage }}</div>

            <div v-if="targetCounts" class="rounded border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800 p-2 text-xs">
              <div class="mb-1 flex items-center justify-between">
                <span class="font-semibold text-slate-700 dark:text-slate-200">Current counts on target</span>
                <span v-if="targetCountsCheckedAt" class="text-[10px] text-slate-500">as of {{ targetCountsCheckedAt }}</span>
              </div>
              <div class="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-0.5">
                <span class="font-mono font-semibold text-rose-700">patients</span>
                <span :class="targetCounts.patients > 0 ? 'font-semibold text-rose-700' : 'text-slate-400'">{{ targetCounts.patients }}</span>
              </div>
              <div class="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5">
                <div v-for="(n, t) in targetCounts.transactions" :key="t" class="flex justify-between">
                  <span class="font-mono text-slate-600 dark:text-slate-300">{{ t }}</span>
                  <span :class="n > 0 ? 'font-semibold text-slate-800 dark:text-slate-100' : 'text-slate-400'">{{ n }}</span>
                </div>
              </div>
            </div>
            <div v-if="prCheckError" class="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">{{ prCheckError }}</div>

            <div class="rounded border border-rose-200 bg-rose-50/50 dark:border-rose-700/40 dark:bg-rose-900/20 p-2 text-[11px] text-rose-800 dark:text-rose-200">
              <div class="mb-1 font-semibold">Notes</div>
              <ul class="list-disc space-y-0.5 pl-4">
                <li><strong>Cascading delete:</strong> every transaction table is purged first (same order as the section above), then <code>patients</code> is deleted. Both halves run in one DB transaction, so a failure anywhere rolls back the entire operation.</li>
                <li>Response includes a <code>patients: N</code> row at the end confirming how many master records were removed.</li>
                <li>Historical reports that were already printed stay on paper, but their underlying rows are gone. Make sure the tenant isn't actively using the system when you run this.</li>
              </ul>
            </div>

            <div class="flex justify-between">
              <button type="button" class="btn-secondary" :disabled="prCheckBusy" @click="checkPrRecords">
                <span v-if="prCheckBusy">Checking…</span>
                <span v-else>Check records</span>
              </button>
              <button type="button" class="btn-danger" @click="askDeletePatientRecords">
                Delete patient records + transactions
              </button>
            </div>
          </div>
        </section>

        <!-- Section 3 — delete look-up / catalog data -->
        <section class="rounded-lg border border-slate-200 dark:border-slate-700">
          <button type="button"
                  class="flex w-full items-start gap-3 border-b border-slate-100 dark:border-slate-800 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  :class="{ 'border-b-0': !expanded.lk }"
                  @click="toggleSection('lk')">
            <svg viewBox="0 0 24 24" class="mt-0.5 h-4 w-4 shrink-0 text-slate-500 transition-transform" :class="{ 'rotate-90': expanded.lk }"
                 fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            <div class="flex-1">
              <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">Delete look-up data</div>
              <div class="mt-0.5 text-xs text-slate-500">
                Purges the catalog (item groups, categories, test items, components, packages, package items) for this tenant. Doctors and discounts are kept.
              </div>
            </div>
          </button>
          <div v-show="expanded.lk" class="space-y-3 px-4 py-3">
            <div v-if="lkError" class="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">{{ lkError }}</div>
            <div v-if="lkMessage" class="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">{{ lkMessage }}</div>

            <div v-if="targetCounts" class="rounded border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800 p-2 text-xs">
              <div class="mb-1 flex items-center justify-between">
                <span class="font-semibold text-slate-700 dark:text-slate-200">Current counts on target (look-up only)</span>
                <span v-if="targetCountsCheckedAt" class="text-[10px] text-slate-500">as of {{ targetCountsCheckedAt }}</span>
              </div>
              <div class="grid grid-cols-2 gap-x-4 gap-y-0.5">
                <div v-for="t in lookupTables" :key="t" class="flex justify-between">
                  <span class="font-mono text-slate-600 dark:text-slate-300">{{ t }}</span>
                  <span :class="(targetCounts.catalog?.[t] || 0) > 0 ? 'font-semibold text-slate-800 dark:text-slate-100' : 'text-slate-400'">
                    {{ targetCounts.catalog?.[t] ?? 0 }}
                  </span>
                </div>
              </div>
            </div>
            <div v-if="lkCheckError" class="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">{{ lkCheckError }}</div>

            <div class="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-[11px] text-slate-600 dark:text-slate-300">
              <div class="mb-1 font-semibold text-slate-700 dark:text-slate-200">Notes</div>
              <ul class="list-disc space-y-0.5 pl-4">
                <li>Delete order (FK-safe, children first): <code>item_package_items</code> → <code>item_packages</code> → <code>test_item_components</code> → <code>test_items</code> → <code>item_categories</code> → <code>item_groups</code>.</li>
                <li>Runs inside a single DB transaction — a failure mid-way rolls everything back.</li>
                <li><code>doctors</code> and <code>discounts</code> are <strong>not</strong> touched (they often outlive a catalog rebuild). If you need those gone too, remove them separately.</li>
                <li>Historical lab reports snapshot catalog FKs (<code>lab_report_items.test_item_uuid</code>, <code>lab_result_values.test_item_component_uuid</code>, <code>lab_report_items.item_package_uuid</code>). If any live reports still reference these rows under <code>ON DELETE RESTRICT</code>, the transaction rolls back — purge transactions / patient records first and retry.</li>
                <li>Typical use: run this before "Copy catalog" to seed a fresh catalog from a source tenant without stepping on duplicate codes.</li>
              </ul>
            </div>

            <div class="flex justify-between">
              <button type="button" class="btn-secondary" :disabled="lkCheckBusy" @click="checkLkRecords">
                <span v-if="lkCheckBusy">Checking…</span>
                <span v-else>Check records</span>
              </button>
              <button type="button" class="btn-danger" @click="askDeleteLookupData">
                Delete look-up data
              </button>
            </div>
          </div>
        </section>

        <!-- Section 4 — copy catalog from source tenant -->
        <section class="rounded-lg border border-slate-200 dark:border-slate-700">
          <button type="button"
                  class="flex w-full items-start gap-3 border-b border-slate-100 dark:border-slate-800 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  :class="{ 'border-b-0': !expanded.copy }"
                  @click="toggleSection('copy')">
            <svg viewBox="0 0 24 24" class="mt-0.5 h-4 w-4 shrink-0 text-slate-500 transition-transform" :class="{ 'rotate-90': expanded.copy }"
                 fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            <div class="flex-1">
              <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">Copy catalog from another tenant</div>
              <div class="mt-0.5 text-xs text-slate-500">
                Copies the selected catalog tables from a source tenant into this one. Refused if any selected table on this tenant already has rows — purge those first (above or via a data script).
              </div>
            </div>
          </button>
          <div v-show="expanded.copy" class="space-y-3 px-4 py-3">
            <div>
              <label class="label">Source tenant</label>
              <button type="button"
                      class="input flex w-full items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800/60"
                      @click="openSourcePicker">
                <span v-if="copySourceTenant" class="flex min-w-0 items-baseline gap-2">
                  <span class="truncate font-semibold text-slate-800 dark:text-slate-100">{{ copySourceTenant.display_name }}</span>
                  <span class="shrink-0 font-mono text-xs text-slate-500">{{ copySourceTenant.store_code }}</span>
                </span>
                <span v-else class="text-slate-500">— pick a source tenant —</span>
                <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="11" cy="11" r="7"/>
                  <path d="m21 21-4.3-4.3"/>
                </svg>
              </button>
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

            <!-- Preview panel: side-by-side counts for target (what's
                 already here, drives the 409 preflight) and source (what
                 would be inserted). Blocking rows highlighted in rose
                 so admin sees the clash before clicking Copy. -->
            <div v-if="targetCounts" class="rounded border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800 p-2 text-xs">
              <div class="mb-1 flex items-center justify-between">
                <span class="font-semibold text-slate-700 dark:text-slate-200">Catalog row counts</span>
                <span class="text-[10px] text-slate-500">
                  target as of {{ targetCountsCheckedAt || '—' }}<span v-if="sourceCountsCheckedAt"> · source as of {{ sourceCountsCheckedAt }}</span>
                </span>
              </div>
              <div class="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-0.5">
                <div class="text-[10px] font-semibold uppercase text-slate-500">Table</div>
                <div class="text-[10px] font-semibold uppercase text-slate-500 text-right">Target</div>
                <div class="text-[10px] font-semibold uppercase text-slate-500 text-right">Source</div>
                <template v-for="t in copyableTables" :key="t">
                  <span class="font-mono text-slate-600 dark:text-slate-300">{{ t }}</span>
                  <span class="text-right"
                        :class="(targetCounts.catalog?.[t] || 0) > 0 && copyTables.includes(t) ? 'font-semibold text-rose-700' : (targetCounts.catalog?.[t] || 0) > 0 ? 'font-semibold text-slate-800 dark:text-slate-100' : 'text-slate-400'">
                    {{ targetCounts.catalog?.[t] ?? 0 }}
                  </span>
                  <span class="text-right"
                        :class="(sourceCounts?.catalog?.[t] || 0) > 0 ? 'font-semibold text-slate-800 dark:text-slate-100' : 'text-slate-400'">
                    {{ sourceCounts ? (sourceCounts.catalog?.[t] ?? 0) : '—' }}
                  </span>
                </template>
              </div>
              <div v-if="copyBlockingTables.length" class="mt-2 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] text-rose-700">
                Copy will be refused — target already has rows in: {{ copyBlockingTables.join(', ') }}. Purge those first.
              </div>
            </div>
            <div v-if="copyCheckError" class="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">{{ copyCheckError }}</div>

            <div class="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-[11px] text-slate-600 dark:text-slate-300">
              <div class="mb-1 font-semibold text-slate-700 dark:text-slate-200">Notes</div>
              <ul class="list-disc space-y-0.5 pl-4">
                <li>Every row's primary key is <strong>remapped</strong> on insert (fresh UUIDs) and tenant-scoped FKs (<code>item_group_uuid</code>, <code>item_category_uuid</code>, <code>test_item_uuid</code>, <code>item_package_uuid</code>, <code>signatory_doctor_uuid</code>) are relinked to the target tenant's new rows — no shared ids with the source.</li>
                <li>The <code>code</code> column is unique per tenant. Server <strong>refuses with 409</strong> if any selected table already has rows on the target (would collide with the unique constraint and leave partial state).</li>
                <li>Dependency chain inside this copy: <code>item_groups</code> ← <code>item_categories</code> ← <code>test_items</code> ← <code>test_item_components</code>; and <code>item_packages</code> ← <code>item_package_items</code> (which also references <code>test_items</code>). Picking a child without its parent fails with a clear error naming the missing dependency.</li>
                <li><code>created_at</code> / <code>updated_at</code> reset to <strong>now</strong> on insert so the audit trail reflects when the copy happened, not when the source rows were originally made.</li>
              </ul>
            </div>

            <div class="flex justify-between">
              <button type="button" class="btn-secondary" :disabled="copyCheckBusy" @click="checkCopyRecords">
                <span v-if="copyCheckBusy">Checking…</span>
                <span v-else>Check records</span>
              </button>
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

  <TenantPickerModal
    :show="sourcePickerOpen"
    :tenants="allTenants"
    :exclude-uuids="tenant?.uuid ? [tenant.uuid] : []"
    :selected-uuid="copySource"
    title="Pick source tenant"
    @close="closeSourcePicker"
    @select="onSourcePicked"
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
