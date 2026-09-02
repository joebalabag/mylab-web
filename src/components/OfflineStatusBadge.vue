<script setup>
// Live status pill for the top bar. Three visual states drive it:
//   green  → Online, nothing pending
//   amber  → Offline OR pending outbox items
//   red    → Sync errors OR clock skew warning
// Clicking opens a dropdown panel with the last sync timestamp, pending
// count, recent errors, and a "Sync now" button.
//
// The badge is intentionally lightweight — heavy sync work lives in the
// syncEngine and the offline store. This component only reads reactive
// state and dispatches user actions.

import { computed, ref, onBeforeUnmount, onMounted } from 'vue'
import { useOfflineStore } from '../stores/offline'
import { useAuthStore } from '../stores/auth'

const offline = useOfflineStore()
const auth = useAuthStore()
const open = ref(false)
const items = ref([])
const busy = ref(false)

// Any authenticated tenant user is a candidate; the badge just hides when
// there's no session (e.g. login screen). Whether the station has actually
// enabled offline mode is a separate condition surfaced inside the panel.
const visible = computed(() => !!auth.isAuthenticated)

const tone = computed(() => {
  if (offline.errorCount) return 'error'
  if (!offline.isOnline)  return 'offline'
  if (offline.pendingCount) return 'warn'
  return 'ok'
})

const label = computed(() => {
  if (offline.syncing) return 'Syncing…'
  if (!offline.isOnline) return offline.pendingCount ? `Offline · ${offline.pendingCount}` : 'Offline'
  if (offline.errorCount) return `Sync errors · ${offline.errorCount}`
  if (offline.pendingCount) return `Pending · ${offline.pendingCount}`
  return 'Online'
})

async function togglePanel() {
  open.value = !open.value
  if (open.value) await refreshList()
}

async function refreshList() {
  if (!offline.isEnabled) { items.value = []; return }
  try { items.value = await offline.listOutbox() } catch (_) { items.value = [] }
}

async function syncNow() {
  if (busy.value) return
  busy.value = true
  try { await offline.drainNow() } finally { busy.value = false; await refreshList() }
}

async function retryOne(id) {
  await offline.retry(id)
  await refreshList()
}

function onDocClick(e) {
  if (!e.target.closest('#offline-badge')) open.value = false
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))

function fmt(iso) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString() } catch (_) { return iso }
}
</script>

<template>
  <div v-if="visible" id="offline-badge" class="relative">
    <button
      type="button"
      class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition hover:brightness-95"
      :class="{
        'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-900/30 dark:text-emerald-300': tone === 'ok',
        'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-900/30 dark:text-amber-300': tone === 'warn' || tone === 'offline',
        'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-900/30 dark:text-rose-300': tone === 'error',
      }"
      :title="label"
      @click.stop="togglePanel"
    >
      <span
        class="inline-block h-2 w-2 rounded-full"
        :class="{
          'bg-emerald-500': tone === 'ok',
          'bg-amber-500': tone === 'warn' || tone === 'offline',
          'bg-rose-500': tone === 'error',
        }"
      />
      <span class="hidden sm:inline">{{ label }}</span>
    </button>

    <transition name="fade">
      <div v-if="open"
           class="absolute right-0 mt-2 w-80 max-w-[calc(100vw-1rem)] rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-800">
        <div class="mb-2 flex items-center justify-between">
          <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">Offline sync</div>
          <button
            type="button"
            class="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700"
            :disabled="busy || !offline.isOnline || !offline.isEnabled"
            @click="syncNow"
          >
            {{ offline.syncing ? 'Syncing…' : 'Sync now' }}
          </button>
        </div>

        <div v-if="!offline.isEnabled"
             class="rounded-md bg-slate-50 p-2 text-xs text-slate-600 dark:bg-slate-900/40 dark:text-slate-300">
          Offline mode is not enabled on this station. Turn it on from
          <span class="font-semibold">Settings → Offline mode</span>.
        </div>

        <template v-else>
          <dl class="grid grid-cols-2 gap-1 text-xs text-slate-600 dark:text-slate-300">
            <dt class="opacity-70">Status</dt>
            <dd class="text-right font-semibold">{{ offline.isOnline ? 'Online' : 'Offline' }}</dd>
            <dt class="opacity-70">Pending</dt>
            <dd class="text-right">{{ offline.pendingCount }}</dd>
            <dt class="opacity-70">Errors</dt>
            <dd class="text-right">{{ offline.errorCount }}</dd>
            <dt class="opacity-70">Conflicts</dt>
            <dd class="text-right">{{ offline.conflictCount }}</dd>
            <dt class="opacity-70">Last sync</dt>
            <dd class="text-right">{{ fmt(offline.lastSyncAt) }}</dd>
            <dt class="opacity-70">Last pull</dt>
            <dd class="text-right">{{ fmt(offline.lastPullAt) }}</dd>
            <dt v-if="offline.clockSkewSeconds != null" class="opacity-70">Clock skew</dt>
            <dd v-if="offline.clockSkewSeconds != null" class="text-right" :class="Math.abs(offline.clockSkewSeconds) > 300 ? 'text-rose-600 dark:text-rose-400' : ''">
              {{ offline.clockSkewSeconds }}s
            </dd>
          </dl>

          <div v-if="items.length" class="mt-3 max-h-56 overflow-auto rounded-md border border-slate-200 dark:border-slate-700">
            <div v-for="row in items.slice(0, 25)" :key="row.id"
                 class="flex items-center justify-between border-b border-slate-100 px-2 py-1 text-xs last:border-b-0 dark:border-slate-700">
              <div class="min-w-0">
                <div class="truncate font-mono text-slate-700 dark:text-slate-200">{{ row.entity_type }}</div>
                <div class="truncate text-[10px] text-slate-500 dark:text-slate-400">{{ fmt(row.created_at) }}</div>
                <div v-if="row.last_error" class="truncate text-[10px] text-rose-600 dark:text-rose-400" :title="row.last_error">{{ row.last_error }}</div>
              </div>
              <div class="ml-2 flex items-center gap-1">
                <span class="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                      :class="{
                        'bg-slate-100 text-slate-600 dark:bg-slate-900/40 dark:text-slate-300': row.status === 'pending' || row.status === 'syncing',
                        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300': row.status === 'done',
                        'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300': row.status === 'error',
                        'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300': row.status === 'conflict',
                      }">
                  {{ row.status }}
                </span>
                <button v-if="row.status === 'error' || row.status === 'conflict'"
                        type="button"
                        class="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700"
                        @click="retryOne(row.id)">
                  Retry
                </button>
              </div>
            </div>
          </div>
        </template>
      </div>
    </transition>
  </div>
</template>
