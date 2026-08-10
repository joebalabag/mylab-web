<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useTenantStore } from '../stores/tenant'
import { getSetupReadinessStatus } from '../api/setupReadiness'

const tenant = useTenantStore()

const loading = ref(false)
const error   = ref('')
const data    = ref(null)

async function reload() {
  loading.value = true
  error.value = ''
  try {
    data.value = await getSetupReadinessStatus()
  } catch (e) {
    error.value = e?.message || 'Failed to load setup status'
  } finally {
    loading.value = false
  }
}
onMounted(reload)

// Group the steps by category so the UI renders one card per phase.
// Readiness only covers one-time setup; operational activity lives on the
// Dashboard, not here.
const phases = computed(() => {
  const g = { setup: [], catalog: [] }
  for (const s of (data.value?.steps || [])) {
    (g[s.category] || g.setup).push(s)
  }
  return [
    { key: 'setup',   label: 'Setup',   description: 'Company profile, users, and signatory doctors.', steps: g.setup },
    { key: 'catalog', label: 'Catalog', description: 'What tests you offer — the billable menu.',      steps: g.catalog },
  ]
})

// Phase-level counters — used for the row header pill.
function phaseCount(phase) {
  const total = phase.steps.length
  const done = phase.steps.filter(s => s.done).length
  return { total, done, all: total > 0 && done === total }
}
</script>

<template>
  <div class="flex h-full flex-col gap-4 overflow-auto pb-8">
    <!-- ─── Header + progress ─────────────────────────────────────────── -->
    <div class="card">
      <div class="card-body">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">Setup Readiness</div>
            <div class="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
              Checklist of the one-time configuration <b>{{ tenant.current?.name || 'this laboratory' }}</b> needs
              before you can accept patients and process reports.
            </div>
          </div>
          <button class="btn-secondary !text-xs shrink-0" :disabled="loading" @click="reload">
            {{ loading ? 'Refreshing…' : 'Refresh' }}
          </button>
        </div>

        <div v-if="error" class="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ error }}
        </div>

        <!-- Progress bar (required steps) -->
        <div v-if="data" class="mt-4 space-y-2">
          <div class="flex flex-wrap items-baseline justify-between gap-2 text-xs">
            <div>
              <b class="text-base">{{ data.required_completed }}</b>
              <span class="text-slate-500 dark:text-slate-400 dark:text-slate-500"> of {{ data.required_total }} required steps done</span>
              <span class="ml-2 text-slate-400 dark:text-slate-500">· {{ data.completed }} of {{ data.total }} total (with optional)</span>
            </div>
            <span v-if="data.ready"
                  class="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-widest text-emerald-700">
              Ready to operate ✓
            </span>
            <span v-else
                  class="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-widest text-amber-700">
              {{ data.progress_pct }}% complete
            </span>
          </div>
          <div class="h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div class="h-full rounded-full transition-all"
                 :class="data.ready ? 'bg-emerald-500' : 'bg-brand-500'"
                 :style="{ width: `${data.progress_pct}%` }"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- ─── Ready banner ─────────────────────────────────────────────── -->
    <div v-if="data?.ready"
         class="card border-emerald-200 bg-emerald-50/60">
      <div class="card-body flex items-start gap-3">
        <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="3"
               stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <div>
          <div class="text-sm font-semibold text-emerald-800">You're ready to operate.</div>
          <div class="text-xs text-emerald-700">
            Every required setup step is complete. Optional items below can be added anytime.
          </div>
        </div>
      </div>
    </div>

    <!-- ─── Three-phase checklist ────────────────────────────────────── -->
    <div v-for="phase in phases" :key="phase.key" class="card">
      <div class="card-header flex items-baseline justify-between">
        <div>
          <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">{{ phase.label }}</div>
          <div class="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{{ phase.description }}</div>
        </div>
        <div v-if="data" class="text-xs">
          <span class="rounded-full px-2 py-0.5 font-bold"
                :class="phaseCount(phase).all
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'">
            {{ phaseCount(phase).done }} / {{ phaseCount(phase).total }}
          </span>
        </div>
      </div>
      <div class="card-body p-0">
        <div v-if="loading && !data" class="p-6 text-center text-xs text-slate-400 dark:text-slate-500">Loading…</div>
        <ul v-else class="divide-y divide-slate-100 dark:divide-slate-800">
          <li v-for="step in phase.steps" :key="step.key"
              class="flex items-start gap-3 p-3 hover:bg-slate-50/60 dark:hover:bg-slate-800/60">
            <!-- Status circle -->
            <div class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                 :class="step.done
                         ? 'bg-emerald-100 text-emerald-700'
                         : step.required
                           ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 ring-2 ring-slate-200 dark:ring-slate-700'
                           : 'bg-slate-50 dark:bg-slate-800 text-slate-300'">
              <svg v-if="step.done" viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="3"
                   stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              <span v-else class="text-[10px] font-bold">•</span>
            </div>

            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">{{ step.label }}</div>
                <span v-if="!step.required"
                      class="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500">
                  Optional
                </span>
                <span v-if="step.done" class="text-[11px] font-semibold text-emerald-700">
                  {{ step.detail }}
                </span>
                <span v-else-if="step.detail" class="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500">
                  {{ step.detail }}
                </span>
              </div>
              <div class="text-xs text-slate-600 dark:text-slate-300">{{ step.description }}</div>
            </div>

            <router-link :to="step.route"
                         class="btn-secondary !text-xs shrink-0"
                         :class="step.done && '!bg-white !text-slate-500 dark:!bg-slate-800 dark:!text-slate-400'">
              {{ step.done ? 'Review' : (step.required ? 'Set up' : 'Add') }} →
            </router-link>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
