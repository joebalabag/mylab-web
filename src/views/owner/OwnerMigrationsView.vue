<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useOwnerStore } from '../../stores/owner'
import Modal from '../../components/Modal.vue'
import SkeletonRows from '../../components/SkeletonRows.vue'
import EmptyState from '../../components/EmptyState.vue'
import { number } from '../../utils/format'
import * as ownerMeApi from '../../api/ownerMe'

const owner = useOwnerStore()
const route = useRoute()
const router = useRouter()

const loading = ref(false)
const tenants = ref([])
const selectedUuid = ref('')

async function load() {
  loading.value = true
  try {
    const rows = await ownerMeApi.listMyTenants()
    tenants.value = Array.isArray(rows) ? rows : []
    const fromQuery = String(route.query.tenant || '')
    selectedUuid.value = (fromQuery && tenants.value.find(t => t.tenant_uuid === fromQuery))
      ? fromQuery
      : (tenants.value[0]?.tenant_uuid || '')
    if (selectedUuid.value) await loadCounts()
  } finally {
    loading.value = false
  }
}
onMounted(load)

const recordCountsReal = ref(null)
async function loadCounts() {
  if (!selectedUuid.value) { recordCountsReal.value = null; return }
  try {
    recordCountsReal.value = await ownerMeApi.migrationRecordCounts(selectedUuid.value)
  } catch (_) {
    recordCountsReal.value = null
  }
}

watch(selectedUuid, (v) => {
  if (!v) return
  if (String(route.query.tenant || '') !== v) {
    router.replace({ query: { ...route.query, tenant: v } })
  }
  loadCounts()
})

const selected = computed(() => tenants.value.find(t => t.tenant_uuid === selectedUuid.value) || null)

// Record counts come from GET /owner/me/tenants/:uuid/migration/record-counts
// and are shaped to this view's expectations. Backend returns:
//   { tenant_uuid, transactions: { table_name: n, ... }, patients, catalog: { ... } }
const recordCounts = computed(() => {
  const r = recordCountsReal.value
  if (!r) return null
  return {
    transactions: {
      lab_reports:   Number(r.transactions?.lab_reports              || 0),
      payments:      Number(r.transactions?.payments                 || 0),
      requisitions:  Number(r.transactions?.patient_requisitions     || 0),
      patient_cases: Number(r.transactions?.patient_cases            || 0),
    },
    patients: Number(r.patients || 0),
    catalog: {
      test_items:      Number(r.catalog?.test_items       || 0),
      item_categories: Number(r.catalog?.item_categories  || 0),
      item_groups:     Number(r.catalog?.item_groups      || 0),
      item_packages:   Number(r.catalog?.item_packages    || 0),
      discounts:       Number(r.catalog?.discounts        || 0),
      doctors:         Number(r.catalog?.doctors          || 0),
    },
  }
})

/* ─── Action modals ─── */
const action = ref({ show: false, kind: '', title: '', body: '', danger: true })
const password = ref('')
const submitting = ref(false)
const actionError = ref('')

// Copy-catalog needs an additional "source tenant" pick. The source list is
// scoped to the owner's OTHER tenants only — super-admin's version lets them
// pick any tenant in the platform; owner is bound to their own set.
const copySource = ref('')
const copyTables = ref({
  test_items: true,
  item_categories: true,
  item_groups: true,
  item_packages: false,
  discounts: false,
  doctors: false
})
const copySources = computed(() =>
  tenants.value.filter(t => t.tenant_uuid !== selectedUuid.value)
)

function openAction(kind) {
  action.value = {
    show: true,
    kind,
    title: titleFor(kind),
    body: bodyFor(kind),
    danger: kind !== 'copy-catalog'
  }
  password.value = ''
  actionError.value = ''
  if (kind === 'copy-catalog') copySource.value = copySources.value[0]?.tenant_uuid || ''
}
function closeAction() {
  if (submitting.value) return
  action.value = { show: false, kind: '', title: '', body: '', danger: true }
}
async function submitAction() {
  actionError.value = ''
  if (!password.value) { actionError.value = 'Password is required.'; return }
  if (action.value.kind === 'copy-catalog') {
    if (!copySource.value) { actionError.value = 'Pick a source tenant.'; return }
    const picked = Object.entries(copyTables.value).filter(([, v]) => v).map(([k]) => k)
    if (!picked.length) { actionError.value = 'Pick at least one catalog table to copy.'; return }
  }
  submitting.value = true
  try {
    const target = selectedUuid.value
    switch (action.value.kind) {
      case 'delete-transactions':
        await ownerMeApi.migrationDeleteTransactions(target, password.value); break
      case 'delete-lookup':
        await ownerMeApi.migrationDeleteLookupData(target, password.value); break
      case 'delete-patients':
        await ownerMeApi.migrationDeletePatientRecords(target, password.value); break
      case 'copy-catalog': {
        const picked = Object.entries(copyTables.value).filter(([, v]) => v).map(([k]) => k)
        await ownerMeApi.migrationCopyCatalog(target, {
          password: password.value,
          source_tenant_uuid: copySource.value,
          tables: picked,
        })
        break
      }
    }
    flash(`"${action.value.title}" completed on ${selected.value.display_name}`)
    closeAction()
    await loadCounts()
  } catch (e) {
    actionError.value = e?.message || 'Action failed'
  } finally {
    submitting.value = false
  }
}

function titleFor(kind) {
  return ({
    'delete-transactions': 'Delete all transactions',
    'delete-lookup':       'Delete look-up / catalog data',
    'delete-patients':     'Delete patient records',
    'copy-catalog':        'Copy catalog from another tenant'
  }[kind] || 'Migration action')
}
function bodyFor(kind) {
  const t = selected.value?.display_name || '(tenant)'
  return ({
    'delete-transactions': `All lab reports, payments, requisitions, and patient cases in &ldquo;${t}&rdquo; will be removed. Patient master records are kept.`,
    'delete-lookup':       `Test items, categories, groups, packages, discounts, and doctors in &ldquo;${t}&rdquo; will be removed.`,
    'delete-patients':     `Patient master records AND every transaction linked to them in &ldquo;${t}&rdquo; will be removed.`,
    'copy-catalog':        `Copy selected catalog tables from a source tenant into &ldquo;${t}&rdquo;. Refused if the target already has rows for any selected table.`
  }[kind] || '')
}

const flashMsg = ref('')
let flashTimer = null
function flash(m) {
  flashMsg.value = m
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => flashMsg.value = '', 2500)
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <div class="text-xs uppercase tracking-widest text-slate-500">Dangerous operations</div>
        <div class="text-xl font-bold text-slate-800">Migrations</div>
      </div>
    </div>

    <transition name="fade">
      <div v-if="flashMsg" class="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
        {{ flashMsg }}
      </div>
    </transition>

    <SkeletonRows v-if="loading && !tenants.length" :rows="4" />

    <EmptyState
      v-else-if="!tenants.length"
      title="No tenants available"
      message="You need at least one assigned tenant before running migrations."
    />

    <template v-else>
      <!-- Tenant picker -->
      <div class="card p-4">
        <label class="label">Target tenant</label>
        <select v-model="selectedUuid" class="input sm:w-96">
          <option v-for="t in tenants" :key="t.tenant_uuid" :value="t.tenant_uuid">
            {{ t.display_name }} · {{ t.store_code }}{{ t.branch ? ' / ' + t.branch : '' }}
          </option>
        </select>
        <p class="mt-2 text-[11px] text-slate-500">
          Each action below re-verifies your owner password before touching data, so a hijacked session alone cannot wipe a tenant.
        </p>
      </div>

      <!-- Record snapshot -->
      <div v-if="recordCounts" class="card overflow-hidden">
        <div class="card-header">
          <div>
            <div class="text-sm font-semibold text-slate-800">Current record counts</div>
            <div class="text-xs text-slate-500">Preview of rows each action would touch</div>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-x-4 gap-y-3 p-4 sm:grid-cols-4 lg:grid-cols-5">
          <div v-for="(val, key) in {
                 'Lab Reports':     recordCounts.transactions.lab_reports,
                 'Payments':        recordCounts.transactions.payments,
                 'Requisitions':    recordCounts.transactions.requisitions,
                 'Patient Cases':   recordCounts.transactions.patient_cases,
                 'Patients':        recordCounts.patients,
                 'Test Items':      recordCounts.catalog.test_items,
                 'Item Categories': recordCounts.catalog.item_categories,
                 'Item Groups':     recordCounts.catalog.item_groups,
                 'Item Packages':   recordCounts.catalog.item_packages,
                 'Doctors':         recordCounts.catalog.doctors,
                 'Discounts':       recordCounts.catalog.discounts
               }"
               :key="key">
            <div class="text-[10px] font-semibold uppercase tracking-widest text-slate-500">{{ key }}</div>
            <div class="mt-0.5 text-lg font-bold text-slate-800 tabular-nums">{{ number(val) }}</div>
          </div>
        </div>
      </div>

      <!-- Action cards -->
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <button
          class="group card p-4 text-left transition hover:border-rose-300 hover:bg-rose-50/40"
          @click="openAction('delete-transactions')"
        >
          <div class="flex items-center gap-2">
            <span class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
              <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6"/>
              </svg>
            </span>
            <div class="min-w-0">
              <div class="font-semibold text-slate-800">Delete transactions</div>
              <div class="text-[11px] text-rose-600">Keeps patient master records</div>
            </div>
          </div>
          <p class="mt-2 text-xs text-slate-600">
            Lab reports, payments, requisitions, patient cases.
          </p>
        </button>

        <button
          class="group card p-4 text-left transition hover:border-rose-300 hover:bg-rose-50/40"
          @click="openAction('delete-lookup')"
        >
          <div class="flex items-center gap-2">
            <span class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
              <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <line x1="8" y1="6" x2="21" y2="6"/>
                <line x1="8" y1="12" x2="21" y2="12"/>
                <line x1="8" y1="18" x2="21" y2="18"/>
                <path d="M3 6l1 1 2-2"/><path d="M3 12l1 1 2-2"/><path d="M3 18l1 1 2-2"/>
              </svg>
            </span>
            <div class="min-w-0">
              <div class="font-semibold text-slate-800">Delete look-up data</div>
              <div class="text-[11px] text-rose-600">Keeps doctors &amp; discounts</div>
            </div>
          </div>
          <p class="mt-2 text-xs text-slate-600">
            Test items, categories, groups, packages.
          </p>
        </button>

        <button
          class="group card p-4 text-left transition hover:border-rose-300 hover:bg-rose-50/40"
          @click="openAction('delete-patients')"
        >
          <div class="flex items-center gap-2">
            <span class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
              <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <line x1="17" y1="8" x2="23" y2="14"/>
                <line x1="23" y1="8" x2="17" y2="14"/>
              </svg>
            </span>
            <div class="min-w-0">
              <div class="font-semibold text-slate-800">Delete patient records</div>
              <div class="text-[11px] text-rose-600">AND their transactions</div>
            </div>
          </div>
          <p class="mt-2 text-xs text-slate-600">
            Removes patient masters and every row linked to them.
          </p>
        </button>

        <button
          class="group card p-4 text-left transition hover:border-indigo-300 hover:bg-indigo-50/40"
          @click="openAction('copy-catalog')"
        >
          <div class="flex items-center gap-2">
            <span class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
              <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2"/>
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
            </span>
            <div class="min-w-0">
              <div class="font-semibold text-slate-800">Copy catalog from another tenant</div>
              <div class="text-[11px] text-indigo-600">Scoped to your tenants only</div>
            </div>
          </div>
          <p class="mt-2 text-xs text-slate-600">
            Mirror test items, categories, groups and more from one of your other branches.
          </p>
        </button>
      </div>
    </template>

    <!-- Action modal (shared for all four) -->
    <Modal :show="action.show" @close="closeAction" :title="action.title" size="md">
      <div class="space-y-4">
        <div v-if="action.danger" class="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
          <svg viewBox="0 0 24 24" class="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <div>
            <b>This cannot be undone.</b> Re-verify your owner password to proceed.
          </div>
        </div>

        <p class="text-sm text-slate-700" v-html="action.body"></p>

        <template v-if="action.kind === 'copy-catalog'">
          <label class="block">
            <span class="label">Copy from (owner's tenants only)</span>
            <select v-model="copySource" class="input">
              <option value="" disabled>— Pick a source tenant —</option>
              <option v-for="s in copySources" :key="s.tenant_uuid" :value="s.tenant_uuid">
                {{ s.display_name }} · {{ s.store_code }}{{ s.branch ? ' / ' + s.branch : '' }}
              </option>
            </select>
          </label>
          <fieldset class="rounded-lg border border-slate-200 p-3">
            <legend class="px-1 text-xs font-semibold text-slate-600">Tables to copy</legend>
            <div class="grid grid-cols-2 gap-2 text-sm">
              <label v-for="(_v, k) in copyTables" :key="k" class="inline-flex items-center gap-2">
                <input type="checkbox" v-model="copyTables[k]" class="h-4 w-4 rounded border-slate-300" />
                <span>{{ k.replace(/_/g, ' ') }}</span>
              </label>
            </div>
          </fieldset>
        </template>

        <label class="block">
          <span class="label">Confirm your owner password</span>
          <input v-model="password" type="password" class="input" placeholder="Current password" required autocomplete="current-password" />
        </label>

        <div v-if="actionError" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ actionError }}
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" :disabled="submitting" @click="closeAction">Cancel</button>
        <button
          :class="action.danger ? 'btn !bg-rose-600 !text-white hover:!bg-rose-700' : 'btn-primary'"
          :disabled="submitting"
          @click="submitAction"
        >
          {{ submitting ? 'Running…' : (action.danger ? 'Yes, proceed' : 'Copy') }}
        </button>
      </template>
    </Modal>
  </div>
</template>
