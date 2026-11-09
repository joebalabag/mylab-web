<script setup>
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as ownerMeApi from '../../api/ownerMe'
import { setReportsTenantOverride } from '../../api/reports'
import { useTenantStore } from '../../stores/tenant'

/* ─── Report catalog ─── */
// Same lineup as SuperTenantReportsView — each entry maps to a lazy-loaded
// report view in src/views/reports/*. All of these endpoints accept owner
// tokens via setReportsTenantOverride (see reports.controller.ts scope()).
const REPORTS = [
  { key: 'summary',             label: 'Summary',               loader: () => import('../reports/SummaryReportView.vue') },
  { key: 'monthly-sales',       label: 'Monthly Sales',         loader: () => import('../reports/MonthlySalesReportView.vue') },
  { key: 'monthly-tests',       label: 'Monthly Tests',         loader: () => import('../reports/MonthlyTestReportView.vue') },
  { key: 'daily-sales',         label: 'Daily Sales',           loader: () => import('../reports/DailySalesReportView.vue') },
  { key: 'daily-tests',         label: 'Daily Tests',           loader: () => import('../reports/DailyTestReportView.vue') },
  { key: 'daily-detailed',      label: 'Daily Detailed Sales',  loader: () => import('../reports/DailyDetailedSalesReportView.vue') },
  { key: 'cashier-sales',       label: 'Cashier Sales',         loader: () => import('../reports/CashierSalesReportView.vue') },
  { key: 'voids',               label: 'Voids',                 loader: () => import('../reports/VoidReportView.vue') },
  { key: 'discounts',           label: 'Discounts',             loader: () => import('../reports/DiscountReportView.vue') },
  { key: 'expenses',            label: 'Expenses',              loader: () => import('../reports/ExpenseReportView.vue') },
  { key: 'payment-summary',     label: 'Payment Summary',       loader: () => import('../reports/PaymentSummaryReportView.vue') },
  { key: 'arrangements',        label: 'Arrangements',          loader: () => import('../reports/ArrangementsReportView.vue') },
  { key: 'test-analytics',      label: 'Test Analytics',        loader: () => import('../reports/TestAnalyticsReportView.vue') },
]

const asyncComponents = Object.fromEntries(
  REPORTS.map(r => [r.key, defineAsyncComponent(r.loader)])
)

const route = useRoute()
const router = useRouter()

/* ─── Tenant list (owner-scoped) ─── */
const tenants = ref([])
const tenantsLoading = ref(false)
const tenantsError = ref('')

async function loadTenants() {
  tenantsLoading.value = true
  tenantsError.value = ''
  try {
    const rows = await ownerMeApi.listMyTenants()
    const list = Array.isArray(rows) ? rows : []
    tenants.value = list.slice().sort((a, b) =>
      String(a.display_name || a.store_code || '').localeCompare(String(b.display_name || b.store_code || ''))
    )
  } catch (e) {
    tenantsError.value = e?.message || 'Failed to load tenants'
  } finally {
    tenantsLoading.value = false
  }
}

/* ─── Selection ─── */
// Owned-tenants use `tenant_uuid` as the key (from the join). The embedded
// report views and setReportsTenantOverride expect a tenant uuid — same
// thing. We keep a local alias so the template reads cleanly.
const selectedUuid = ref('')
const activeKey = ref(REPORTS[0].key)

const selectedTenant = computed(() =>
  tenants.value.find(t => t.tenant_uuid === selectedUuid.value) || null
)

/* ─── Tenant-store display override ─── */
// The embedded report views read useTenantStore().current.name to label
// print headers. In the owner console that store is either empty or holds
// a stale staff tenant from a prior session — both wrong. Patch the display
// fields in memory while on this view and restore on leave. No localStorage
// write, so other tabs aren't disturbed.
const tenantStore = useTenantStore()
let originalCurrent = null

function applyTenantOverride(t) {
  if (!originalCurrent) {
    try { originalCurrent = JSON.parse(JSON.stringify(tenantStore.current || {})) }
    catch (_) { originalCurrent = { ...(tenantStore.current || {}) } }
  }
  if (!t) {
    if (originalCurrent) tenantStore.$patch({ current: { ...originalCurrent } })
    return
  }
  tenantStore.$patch({
    current: {
      ...(originalCurrent || tenantStore.current || {}),
      uuid:      t.tenant_uuid,
      name:      t.display_name || t.store_code || '',
      legalName: t.legal_name   || '',
      code:      t.store_code   || '',
      logo:      t.company_logo || '',
    },
  })
}

watch(selectedTenant, (t) => {
  setReportsTenantOverride(t?.tenant_uuid || null)
  applyTenantOverride(t)
})

// Sync the selected tenant into the URL so refreshing or deep-linking lands
// back on the same tenant+tab.
watch(selectedUuid, (v) => {
  if (!v) return
  if (String(route.query.tenant || '') !== v) {
    router.replace({ query: { ...route.query, tenant: v } })
  }
})

onMounted(async () => {
  await loadTenants()
  const fromQuery = String(route.query.tenant || '')
  if (fromQuery && tenants.value.find(t => t.tenant_uuid === fromQuery)) {
    selectedUuid.value = fromQuery
  } else if (tenants.value.length === 1) {
    // Single-tenant owners don't benefit from a "pick one" step.
    selectedUuid.value = tenants.value[0].tenant_uuid
  }
})

onBeforeUnmount(() => {
  setReportsTenantOverride(null)
  if (originalCurrent) {
    tenantStore.$patch({ current: { ...originalCurrent } })
    originalCurrent = null
  }
})

function selectReport(key) { activeKey.value = key }
function clearSelection() { selectedUuid.value = '' }

/* ─── Keying ─── */
// Combining tenant + report in the key forces the child to remount whenever
// either changes — re-fires the initial API call with the fresh tenant_uuid
// override. Same trick Super uses; simpler than threading props everywhere.
const slotKey = computed(() => `${selectedUuid.value || '-'}::${activeKey.value}`)
</script>

<template>
  <div class="flex min-w-0 flex-col gap-4 sm:h-full">
    <!-- Tenant selector -->
    <div class="card shrink-0">
      <div class="card-body flex flex-wrap items-end gap-3">
        <div class="min-w-[16rem] flex-1">
          <label class="label">Tenant</label>
          <select v-model="selectedUuid" class="input" :disabled="tenantsLoading">
            <option value="">— Select a tenant —</option>
            <option v-for="t in tenants" :key="t.tenant_uuid" :value="t.tenant_uuid">
              {{ t.display_name || t.store_code || t.tenant_uuid }}
              <template v-if="t.store_code"> · {{ t.store_code }}</template>
              <template v-if="t.branch"> / {{ t.branch }}</template>
            </option>
          </select>
        </div>

        <div v-if="selectedTenant" class="min-w-0 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <div class="font-semibold truncate">{{ selectedTenant.display_name }}</div>
          <div class="font-mono text-[10px] text-amber-600">
            {{ selectedTenant.store_code || selectedTenant.tenant_uuid }}
          </div>
        </div>

        <div class="ml-auto flex items-center gap-2">
          <button v-if="selectedUuid"
                  class="btn-secondary !text-xs"
                  @click="clearSelection"
                  title="Clear tenant selection">
            Clear
          </button>
          <button class="btn-secondary"
                  :disabled="tenantsLoading"
                  @click="loadTenants"
                  title="Refresh tenant list">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
          </button>
        </div>
      </div>
      <div v-if="tenantsLoading" class="border-t border-slate-100 bg-slate-50 px-4 py-1.5 text-xs text-amber-700">Loading tenants…</div>
      <div v-if="tenantsError" class="border-t border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-700">
        {{ tenantsError }}
      </div>
    </div>

    <!-- Report tabs -->
    <div class="card flex min-w-0 flex-col sm:flex-1 sm:min-h-0 sm:overflow-hidden">
      <div class="shrink-0 border-b border-slate-100 px-4">
        <nav class="-mb-px flex flex-wrap gap-x-4 gap-y-1">
          <button v-for="r in REPORTS" :key="r.key"
                  class="border-b-2 py-3 text-sm font-medium whitespace-nowrap"
                  :class="activeKey === r.key
                          ? 'border-amber-500 text-amber-700'
                          : 'border-transparent text-slate-500 hover:text-slate-700'"
                  :disabled="!selectedUuid"
                  @click="selectReport(r.key)">
            {{ r.label }}
          </button>
        </nav>
      </div>

      <!-- Report body — only mounts once a tenant is picked. Keyed on
           `tenant::report` so switching either forces a clean remount and
           fresh API call with the correct tenant_uuid override. -->
      <div class="min-w-0 sm:min-h-0 sm:flex-1 sm:overflow-auto">
        <div v-if="!selectedUuid" class="flex h-full min-h-[20rem] flex-col items-center justify-center gap-2 p-10 text-center">
          <svg viewBox="0 0 24 24" class="h-10 w-10 text-slate-300" fill="none" stroke="currentColor" stroke-width="1.5"
               stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
            <line x1="9" y1="17" x2="9" y2="13"/>
            <line x1="13" y1="17" x2="13" y2="11"/>
            <line x1="17" y1="17" x2="17" y2="14"/>
          </svg>
          <div class="text-sm font-semibold text-slate-700">Select a tenant to view its reports</div>
          <div class="text-xs text-slate-500">
            Choose one of your branches from the dropdown above. All reports available to that tenant's account will be viewable here.
          </div>
        </div>

        <div v-else class="h-full p-4">
          <component :is="asyncComponents[activeKey]" :key="slotKey" />
        </div>
      </div>
    </div>
  </div>
</template>
