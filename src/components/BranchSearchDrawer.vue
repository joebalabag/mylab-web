<script setup>
/**
 * Phase 3 — Branch Result Search drawer.
 *
 * Opens from LaboratoryView.vue. Lets a lab user in one branch pull up a
 * FINAL lab report created in another branch of the same lab chain (same
 * owner). Writes stay in the user's home branch; this drawer is READ-ONLY
 * (view, print, email the other branch's result).
 *
 * "Branch" here means another tenant owned by the same owner as the
 * caller's home tenant. The tenant's own `branch` column is the geographic
 * location label (e.g. "Alabang") and is used only for display.
 *
 * In mock mode:
 *   - Home tenant is taken from MOCK_LAB_HOME_TENANT_UUID.
 *   - Branch list + results come from branchesForHome() and
 *     searchBranchLabReports() in src/mocks/owners.js.
 *
 * When Phase 3 backend ships (3.5–3.10):
 *   - Home tenant is implicit via the JWT (user.tenant_uuid).
 *   - /lab-report/branches returns the dropdown options.
 *   - /lab-report/cross-tenant-search returns the result set.
 *   - view / print / pdf / resend-email endpoints loosen their guards so
 *     the row actions below work verbatim with the branch's lab-report uuid.
 */
import { computed, ref, watch } from 'vue'
import * as labBranchesApi from '../api/labBranches'
import { useAuthStore } from '../stores/auth'
import SkeletonRows from './SkeletonRows.vue'
import EmptyState from './EmptyState.vue'
import { formatDateTime, todayISO } from '../utils/format'

// The sibling-branch list is cached in the auth store at login time (see
// stores/auth.js refreshBranches). Read from the cache instead of making
// another /lab-report/branches call each time the drawer opens — opening
// is now instant.
const auth = useAuthStore()

const props = defineProps({
  show: Boolean
})
const emit = defineEmits(['close', 'view', 'print', 'email'])

const branches = ref([])
const tenantFilter = ref('')
const keywords = ref('')
const dateFrom = ref('')
const dateTo = ref('')
const loading = ref(false)
const searched = ref(false)
const results = ref([])
const flashMsg = ref('')
let flashTimer = null
function flash(m) {
  flashMsg.value = m
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => flashMsg.value = '', 2500)
}

function hydrate() {
  tenantFilter.value = ''
  keywords.value = ''
  // Default the date range to today — widen manually for older reports.
  const today = todayISO()
  dateFrom.value = today
  dateTo.value = today
  results.value = []
  searched.value = false
  // Read from the auth-store cache (populated once at login). Owners can
  // force a re-probe by logging out and back in if their branch set
  // changes mid-session.
  branches.value = Array.isArray(auth.branches) ? auth.branches : []
}

// Re-seed every time the drawer opens.
watch(() => props.show, (open) => {
  if (open) hydrate()
})

const hasBranches = computed(() => branches.value.length > 0)

async function runSearch() {
  if (!hasBranches.value) return
  loading.value = true
  try {
    const res = await labBranchesApi.crossTenantSearch({
      tenant_uuid: tenantFilter.value || undefined,
      keywords: keywords.value || undefined,
      date_from: dateFrom.value || undefined,
      date_to: dateTo.value || undefined,
      page_number: 0,
      page_size: 0,
    })
    // Backend returns PagedResult<LabReportWithMeta>. Shape each row into
    // the existing table's expectations (patient_name, tenant badge, etc.).
    const rows = Array.isArray(res?.results) ? res.results : (Array.isArray(res) ? res : [])
    const branchByUuid = Object.fromEntries(branches.value.map(b => [b.tenant_uuid, b]))
    results.value = rows.map((r) => {
      // `test_items_summary` is a cached comma-joined string on lab_reports
      // (migration 20260805000600). Falls back to a live join of the items
      // array for older rows that haven't been backfilled.
      const itemsSummary = r.test_items_summary
        || (Array.isArray(r.items)
            ? r.items.map((i) => i.test_item_name).filter(Boolean).join(', ')
            : '')
      return {
        ...r,
        patient_name: [
          r.patient_last_name,
          [r.patient_first_name, r.patient_middle_name ? r.patient_middle_name.charAt(0) + '.' : '']
            .filter(Boolean).join(' '),
        ].filter(Boolean).join(', '),
        tenant: branchByUuid[r.tenant_uuid] || null,
        test_name: r.item_category_name || '—',
        test_items_summary: itemsSummary,
      }
    })
    searched.value = true
  } finally {
    loading.value = false
  }
}
function clearFilters() {
  hydrate()
}

/* ─── Row actions (view / print / email) ───
   The drawer only emits — LaboratoryView.vue reuses its existing Print
   Preview modal (LabReportPrintable) and resend-email handler to render
   the other branch's result. This keeps a single viewer/printer across the
   home-branch Laboratory list and cross-branch searches. */
function viewResult(row)  { emit('view',  row) }
function printResult(row) { emit('print', row) }
function emailResult(row) { emit('email', row) }
</script>

<template>
  <!-- Backdrop -->
  <transition name="fade">
    <div v-if="show"
         class="fixed inset-0 z-40 bg-slate-900/40"
         @click="emit('close')" />
  </transition>

  <!-- Drawer (right side) -->
  <transition name="slide-right">
    <aside
      v-if="show"
      class="fixed inset-y-0 right-0 z-50 flex w-full max-w-4xl flex-col border-l border-slate-200 bg-slate-50 shadow-2xl"
      role="dialog"
      aria-labelledby="branch-search-heading"
    >
      <!-- Header -->
      <header class="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <div class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="7"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </div>
        <div class="min-w-0 flex-1">
          <div id="branch-search-heading" class="text-sm font-semibold text-slate-800">
            Branch result search
          </div>
          <div class="text-[11px] text-slate-500">
            Search FINAL lab reports across the other branches of your lab chain. Writes stay in your home branch.
          </div>
        </div>
        <button class="btn-icon" aria-label="Close" @click="emit('close')">
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </header>

      <!-- No-branches empty state short-circuits the whole drawer -->
      <div v-if="!hasBranches" class="flex flex-1 items-center justify-center p-8">
        <EmptyState
          title="No other branches available"
          message="Your home branch isn't linked to an owner yet, or your owner has no other branches. Ask your owner to assign more tenants from the Owner Console."
        />
      </div>

      <template v-else>
        <!-- Filter form -->
        <section class="border-b border-slate-200 bg-white p-4">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label class="block">
              <span class="label">Branch</span>
              <select v-model="tenantFilter" class="input">
                <option value="">All branches ({{ branches.length }})</option>
                <option v-for="t in branches" :key="t.tenant_uuid" :value="t.tenant_uuid">
                  {{ t.display_name }}{{ t.branch ? ' · ' + t.branch : '' }}
                </option>
              </select>
            </label>
            <label class="block sm:col-span-1 lg:col-span-1">
              <span class="label">Finalized from</span>
              <input v-model="dateFrom" type="date" class="input" :max="dateTo || undefined" />
            </label>
            <label class="block sm:col-span-1 lg:col-span-1">
              <span class="label">Finalized to</span>
              <input v-model="dateTo" type="date" class="input" :min="dateFrom || undefined" />
            </label>
            <label class="block sm:col-span-2 lg:col-span-1">
              <span class="label">Patient name or lab #</span>
              <input
                v-model="keywords"
                class="input"
                placeholder="e.g. Reyes · ALP-2026-00912"
                @keyup.enter="runSearch"
              />
            </label>
          </div>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <button class="btn-primary" :disabled="loading" @click="runSearch">
              <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="7"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              {{ loading ? 'Searching…' : 'Search' }}
            </button>
            <button class="btn-secondary" :disabled="loading" @click="clearFilters">Clear</button>
            <div class="ml-auto text-[11px] text-slate-500">
              FINAL-only &middot; drafts and voided results are not visible across branches
            </div>
          </div>
        </section>

        <!-- Flash -->
        <transition name="fade">
          <div v-if="flashMsg" class="border-b border-emerald-100 bg-emerald-50 px-5 py-2 text-sm text-emerald-700">
            {{ flashMsg }}
          </div>
        </transition>

        <!-- Results -->
        <div class="min-h-0 flex-1 overflow-auto">
          <SkeletonRows v-if="loading" :rows="5" label="Searching branches…" />

          <EmptyState
            v-else-if="!searched"
            title="Ready when you are"
            message="Set a filter and hit Search. Dates default to today — widen manually for older reports."
          />

          <EmptyState
            v-else-if="!results.length"
            title="No matching finalized results"
            message="Widen the date range or clear the keyword — only FINAL reports in your other branches are searchable here."
          />

          <table v-else class="table">
            <thead class="sticky top-0 z-10 bg-slate-50 shadow-[inset_0_-1px_0_theme(colors.slate.100)]">
              <tr>
                <th class="text-left">Lab # &middot; Finalized</th>
                <th class="text-left">Patient</th>
                <th class="text-left">Test</th>
                <th class="text-left">Branch</th>
                <th class="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in results" :key="r.uuid" class="hover:bg-slate-50/60">
                <td class="whitespace-nowrap align-top">
                  <div class="font-mono text-sm font-semibold text-slate-800">{{ r.lab_number }}</div>
                  <div class="text-[11px] text-slate-500">{{ formatDateTime(r.finalized_at) }}</div>
                </td>
                <td class="align-top">
                  <div class="font-medium text-slate-800">{{ r.patient_name }}</div>
                </td>
                <td class="align-top max-w-[22rem]">
                  <div class="text-sm font-medium text-slate-800">{{ r.test_name }}</div>
                  <div
                    v-if="r.test_items_summary"
                    class="truncate text-[11px] text-slate-500"
                    :title="r.test_items_summary"
                  >
                    {{ r.test_items_summary }}
                  </div>
                </td>
                <td class="align-top">
                  <span class="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                    <svg viewBox="0 0 24 24" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="2"
                         stroke-linecap="round" stroke-linejoin="round">
                      <path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v10a1 1 0 001 1h14a1 1 0 001-1V9"/>
                    </svg>
                    {{ r.tenant?.display_name || r.tenant_uuid }}
                  </span>
                </td>
                <td class="text-right align-top">
                  <div class="inline-flex items-center gap-1">
                    <button class="btn-icon" title="View" @click="viewResult(r)">
                      <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                           stroke-linecap="round" stroke-linejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    </button>
                    <button class="btn-icon" title="Print" @click="printResult(r)">
                      <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                           stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="6 9 6 2 18 2 18 9"/>
                        <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
                        <rect x="6" y="14" width="12" height="8"/>
                      </svg>
                    </button>
                    <button class="btn-icon" title="Email to patient" @click="emailResult(r)">
                      <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                           stroke-linecap="round" stroke-linejoin="round">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                        <polyline points="22,6 12,13 2,6"/>
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Footer -->
        <footer class="border-t border-slate-200 bg-white px-5 py-3">
          <div class="flex items-center justify-between gap-3">
            <div class="text-[11px] text-slate-500">
              Print output uses the <b>originating branch's</b> branding (logo, header, signatories). Each view / print / email writes a cross-branch audit log entry.
            </div>
            <button class="btn-secondary" @click="emit('close')">Close</button>
          </div>
        </footer>
      </template>
    </aside>
  </transition>
</template>

<style scoped>
.slide-right-enter-active,
.slide-right-leave-active { transition: transform 240ms ease; }
.slide-right-enter-from,
.slide-right-leave-to { transform: translateX(100%); }
</style>
