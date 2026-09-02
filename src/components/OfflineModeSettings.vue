<script setup>
// Company-settings section for offline mode. Two responsibilities:
//   1. Enable / disable offline mode on THIS station (per-device switch,
//      stored in localStorage — a different browser starts fresh).
//   2. Admin: list registered offline devices for the tenant and let an
//      admin revoke one (a stolen laptop, decommissioned station).
//
// Enabling triggers a background bootstrap. The progress bar below the
// button surfaces per-table progress so the operator sees the app is
// alive during the initial big pull.

import { computed, onMounted, ref } from 'vue'
import { useOfflineStore } from '../stores/offline'
import { useAuthStore } from '../stores/auth'
import { listOfflineDevices, revokeOfflineDevice } from '../api/offline'
import ConfirmDialog from './ConfirmDialog.vue'

const offline = useOfflineStore()
const auth = useAuthStore()

const label = ref('')
const busy = ref(false)
const toast = ref({ msg: '', tone: 'emerald' })
const devices = ref([])
const loadingDevices = ref(false)

const canManage = computed(() => {
  const role = String(auth.role || '').toLowerCase()
  return role === 'admin' || role === 'manager'
})

async function refreshDevices() {
  if (!canManage.value) return
  loadingDevices.value = true
  try {
    devices.value = await listOfflineDevices()
  } catch (e) {
    toast.value = { msg: e?.message || 'Could not load devices', tone: 'rose' }
  } finally {
    loadingDevices.value = false
  }
}

onMounted(refreshDevices)

async function enable() {
  if (busy.value) return
  busy.value = true
  try {
    await offline.enableOnThisStation({ device_label: label.value.trim() || null })
    toast.value = { msg: 'Offline mode ready on this station.', tone: 'emerald' }
    await refreshDevices()
  } catch (e) {
    toast.value = { msg: e?.message || 'Enable failed', tone: 'rose' }
  } finally {
    busy.value = false
  }
}

async function disable() {
  if (busy.value) return
  busy.value = true
  try {
    await offline.disableOnThisStation()
    toast.value = { msg: 'Offline mode disabled on this station.', tone: 'emerald' }
  } finally {
    busy.value = false
  }
}

// Debug / recovery. Blows away the local cache AND the "this station is
// registered" markers so the next initialize() cycle behaves as if the
// browser had never enabled offline mode. Confirmed via the app's own
// modal (not window.confirm) so it matches the rest of the destructive
// actions in the app and picks up dark-mode styling.
const showResetConfirm = ref(false)
const resetMessage = computed(() => {
  const pending = offline.pendingCount
  return pending
    ? `Reset will discard ${pending} unsynced record(s) queued on this station. Continue?`
    : 'Reset the local offline cache on this station? A fresh download will start immediately.'
})

function openResetConfirm() { showResetConfirm.value = true }
function closeResetConfirm() { showResetConfirm.value = false }

async function resetStation() {
  showResetConfirm.value = false
  if (busy.value) return
  busy.value = true
  try {
    await offline.resetThisStation({ reinitialize: true })
    toast.value = { msg: 'Station reset — re-registering and downloading a fresh cache.', tone: 'emerald' }
    await refreshDevices()
  } catch (e) {
    toast.value = { msg: e?.message || 'Reset failed', tone: 'rose' }
  } finally {
    busy.value = false
  }
}

async function revoke(row) {
  if (!canManage.value) return
  const reason = window.prompt('Revoke reason (optional)') || ''
  try {
    await revokeOfflineDevice(row.uuid, reason)
    toast.value = { msg: `Revoked ${row.device_label || row.device_id}`, tone: 'emerald' }
    await refreshDevices()
  } catch (e) {
    toast.value = { msg: e?.message || 'Revoke failed', tone: 'rose' }
  }
}

function fmt(iso) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString() } catch (_) { return iso }
}
</script>

<template>
  <div class="card">
    <div class="card-header">
      <div>
        <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">Offline mode</div>
        <div class="text-xs text-slate-500 dark:text-slate-400">
          Let this station keep working through internet outages. Data auto-syncs when connection returns.
        </div>
      </div>
    </div>

    <div class="card-body space-y-4">
      <!-- This-station toggle -->
      <div class="rounded-md border border-slate-200 p-3 dark:border-slate-700">
        <div class="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">This station</div>

        <div v-if="!offline.isEnabled" class="space-y-2">
          <div class="text-xs text-slate-600 dark:text-slate-300">
            Enabling downloads the last 60 days of patient / case / payment / lab-report data plus reference tables
            (test items, doctors, discounts). Expect a few minutes on first run.
          </div>
          <div class="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label class="flex-1 text-xs">
              <span class="label">Station name (optional)</span>
              <input v-model="label" type="text" class="input" placeholder="e.g. Front counter laptop" :disabled="busy" />
            </label>
            <button type="button" class="btn-primary" :disabled="busy" @click="enable">
              {{ busy ? 'Enabling…' : 'Enable offline mode' }}
            </button>
          </div>
        </div>

        <div v-else class="space-y-2 text-xs text-slate-600 dark:text-slate-300">
          <div class="flex items-center gap-2">
            <span class="inline-block h-2 w-2 rounded-full bg-emerald-500"></span>
            <span class="font-semibold text-slate-800 dark:text-slate-100">Enabled on this station</span>
          </div>
          <dl class="grid grid-cols-2 gap-1">
            <dt class="opacity-70">Device ID</dt>
            <dd class="text-right font-mono">{{ offline.device_id?.slice(0, 8) }}…</dd>
            <dt class="opacity-70">Last sync</dt>
            <dd class="text-right">{{ fmt(offline.lastSyncAt) }}</dd>
            <dt class="opacity-70">Last pull</dt>
            <dd class="text-right">{{ fmt(offline.lastPullAt) }}</dd>
            <dt class="opacity-70">Bootstrapped</dt>
            <dd class="text-right">{{ fmt(offline.lastBootstrapAt) }}</dd>
          </dl>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn-secondary !text-xs" :disabled="busy" @click="disable">
              Disable on this station
            </button>
            <button
              type="button"
              class="rounded-md border border-rose-200 bg-white px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/60 dark:bg-transparent dark:text-rose-300 dark:hover:bg-rose-900/20"
              :disabled="busy"
              :title="'Wipes local cache + re-registers this browser as a fresh station. Handy for testing the first-login flow.'"
              @click="openResetConfirm"
            >
              Reset this station
            </button>
          </div>
        </div>

        <div v-if="offline.bootstrapProgress"
             class="mt-2 rounded-md bg-slate-50 p-2 text-xs text-slate-600 dark:bg-slate-900/40 dark:text-slate-300">
          <div v-if="offline.bootstrapProgress.stage === 'downloading'">Downloading initial data…</div>
          <div v-else-if="offline.bootstrapProgress.stage === 'writing'">
            Writing <span class="font-mono">{{ offline.bootstrapProgress.table }}</span>
            ({{ offline.bootstrapProgress.count }} rows)
          </div>
          <div v-else-if="offline.bootstrapProgress.stage === 'done'">Done.</div>
        </div>

        <div v-if="toast.msg" class="mt-2 text-xs" :class="toast.tone === 'emerald' ? 'text-emerald-700' : 'text-rose-700'">
          {{ toast.msg }}
        </div>
      </div>

      <!-- Admin: device registry -->
      <div v-if="canManage" class="rounded-md border border-slate-200 p-3 dark:border-slate-700">
        <div class="mb-2 flex items-center justify-between">
          <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">Registered stations</div>
          <button type="button" class="btn-ghost !text-xs" :disabled="loadingDevices" @click="refreshDevices">Refresh</button>
        </div>

        <div v-if="loadingDevices" class="text-xs text-slate-500">Loading…</div>
        <div v-else-if="!devices.length" class="text-xs text-slate-500">No stations have enabled offline mode yet.</div>

        <div v-else class="max-h-64 overflow-auto">
          <table class="w-full text-xs">
            <thead class="text-left text-slate-500 dark:text-slate-400">
              <tr>
                <th class="py-1">Station</th>
                <th class="py-1">Device ID</th>
                <th class="py-1">Last sync</th>
                <th class="py-1"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in devices" :key="d.uuid" class="border-t border-slate-100 dark:border-slate-800">
                <td class="py-1">
                  <div class="font-semibold text-slate-800 dark:text-slate-100">{{ d.device_label || '—' }}</div>
                  <div class="truncate text-[10px] text-slate-500 dark:text-slate-400">{{ d.user_agent }}</div>
                </td>
                <td class="py-1 font-mono">{{ d.device_id.slice(0, 8) }}…</td>
                <td class="py-1">{{ fmt(d.last_sync_at) }}</td>
                <td class="py-1 text-right">
                  <span v-if="d.revoked_at" class="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">Revoked</span>
                  <button v-else
                          type="button"
                          class="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200"
                          @click="revoke(d)">
                    Revoke
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <ConfirmDialog
      :show="showResetConfirm"
      title="Reset this station"
      :message="resetMessage"
      confirm-text="Reset"
      @close="closeResetConfirm"
      @confirm="resetStation"
    />
  </div>
</template>
