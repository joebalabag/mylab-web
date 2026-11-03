<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import * as auditApi from '../api/auditLogs'
import EmptyState from '../components/EmptyState.vue'
import SkeletonRows from '../components/SkeletonRows.vue'
import { formatDateTime } from '../utils/format'

const _pad = (n) => String(n).padStart(2, '0')
const _localISO = (d) => `${d.getFullYear()}-${_pad(d.getMonth() + 1)}-${_pad(d.getDate())}`
const todayISO = () => _localISO(new Date())
const daysAgoISO = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return _localISO(d) }

const ACTIONS = [
  { v: '', label: 'All actions' },
  { v: 'create',                   label: 'Create' },
  { v: 'update',                   label: 'Update' },
  { v: 'delete',                   label: 'Delete' },
  { v: 'login',                    label: 'Login (success)' },
  { v: 'login_failed',             label: 'Login (failed)' },
  { v: 'password_reset_request',   label: 'Password reset — request' },
  { v: 'password_reset_complete',  label: 'Password reset — complete' },
]

/* ─── Filters ─── */
const dateFrom    = ref(daysAgoISO(1))
const dateTo      = ref(todayISO())
const action      = ref('')
const entityType  = ref('')
const keywords    = ref('')
const pageNumber  = ref(1)
const pageSize    = ref(50)

/* ─── Data ─── */
const rows   = ref([])
const total  = ref(0)
const loading = ref(false)
const errorMsg = ref('')
const expanded = ref(new Set())

async function load() {
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await auditApi.listAuditLogs({
      date_from: dateFrom.value,
      date_to:   dateTo.value,
      action:    action.value || undefined,
      entity_type: entityType.value || undefined,
      keywords:  keywords.value || undefined,
      page_number: pageNumber.value,
      page_size: pageSize.value,
    })
    rows.value  = Array.isArray(res?.results) ? res.results : []
    total.value = Number(res?.total || 0)
  } catch (e) {
    errorMsg.value = e?.message || 'Failed to load audit logs'
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch([dateFrom, dateTo, action, entityType, pageNumber], load)
// pageSize bump should snap back to page 1 — otherwise you can end up on a
// page beyond pageCount (e.g. page 10/2 after switching 25→200 rows per page)
// and the UI shows an empty table until you click Prev.
watch(pageSize, () => {
  if (pageNumber.value !== 1) pageNumber.value = 1 // triggers the watcher above → load
  else load()
})
let searchTimer = null
watch(keywords, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { pageNumber.value = 1; load() }, 300)
})

function toggle(uuid) {
  if (expanded.value.has(uuid)) expanded.value.delete(uuid)
  else expanded.value.add(uuid)
  expanded.value = new Set(expanded.value)
}

function actionBadgeClass(a) {
  if (a === 'create') return 'badge-success'
  if (a === 'update') return 'badge-warn'
  if (a === 'delete') return 'badge-danger'
  if (a === 'login')  return 'badge-info'
  if (a === 'login_failed') return 'badge-danger'
  return 'badge-neutral'
}

function changesPreview(ch) {
  if (!ch) return ''
  if (ch.diff) {
    const keys = Object.keys(ch.diff)
    if (!keys.length) return '(no field changes)'
    return keys.slice(0, 4).join(', ') + (keys.length > 4 ? `, +${keys.length - 4} more` : '')
  }
  if (ch.after) return 'Created with ' + Object.keys(ch.after).length + ' fields'
  if (ch.before) return 'Deleted (snapshot available)'
  return ''
}

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
</script>

<template>
  <div class="flex min-w-0 flex-col gap-4 sm:h-full">
    <!-- Filters -->
    <div class="card shrink-0">
      <div class="card-body flex flex-wrap items-end gap-3">
        <div>
          <label class="label">From</label>
          <input v-model="dateFrom" type="date" class="input" />
        </div>
        <div>
          <label class="label">To</label>
          <input v-model="dateTo" type="date" class="input" />
        </div>
        <div>
          <label class="label">Action</label>
          <select v-model="action" class="input">
            <option v-for="a in ACTIONS" :key="a.v" :value="a.v">{{ a.label }}</option>
          </select>
        </div>
        <div>
          <label class="label">Entity type</label>
          <input v-model="entityType" type="text" placeholder="e.g. payment" class="input" />
        </div>
        <div class="flex-1 min-w-[180px]">
          <label class="label">Search</label>
          <input v-model="keywords" type="text" placeholder="Actor, summary…" class="input" />
        </div>
        <button class="btn-secondary" :disabled="loading" @click="load" title="Refresh">
          <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"/>
            <polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
        </button>
      </div>
      <div v-if="loading" class="border-t border-slate-100 bg-slate-50 px-4 py-1.5 text-xs text-brand-700">Loading…</div>
      <div v-if="errorMsg" class="border-t border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-700">
        {{ errorMsg }}
      </div>
    </div>

    <!-- Table -->
    <div class="card flex min-w-0 flex-col sm:flex-1 sm:min-h-0 sm:overflow-hidden">
      <div class="shrink-0 border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-600">
        {{ total }} event{{ total === 1 ? '' : 's' }} found
      </div>
      <div class="min-w-0 flex-1 overflow-auto">
        <SkeletonRows v-if="loading && !rows.length" :rows="8" :columns="['bar','pill','lines','bar','pill']" />
        <table v-else-if="rows.length" class="table">
          <thead>
            <tr>
              <th class="whitespace-nowrap">When</th>
              <th>Action</th>
              <th>Actor</th>
              <th>Entity</th>
              <th>Summary</th>
              <th>Changes</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="r in rows" :key="r.uuid">
              <tr @click="toggle(r.uuid)" class="cursor-pointer hover:bg-slate-50">
                <td class="whitespace-nowrap font-mono text-[11px] text-slate-600">{{ formatDateTime(r.created_at) }}</td>
                <td><span :class="actionBadgeClass(r.action)">{{ r.action }}</span></td>
                <td>
                  <div class="text-sm font-semibold text-slate-800">{{ r.actor_label || '—' }}</div>
                  <div class="text-[10px] uppercase tracking-widest text-slate-500">{{ r.actor_type }}</div>
                </td>
                <td>
                  <div class="text-sm text-slate-800">{{ r.entity_type || '—' }}</div>
                  <div v-if="r.entity_uuid" class="font-mono text-[10px] text-slate-500">{{ String(r.entity_uuid).slice(0,8) }}…</div>
                </td>
                <td class="max-w-[320px] text-sm text-slate-700">{{ r.summary || '—' }}</td>
                <td class="text-xs text-slate-500">{{ changesPreview(r.changes) }}</td>
              </tr>
              <tr v-if="expanded.has(r.uuid)" class="bg-slate-50">
                <td colspan="6" class="p-3">
                  <pre class="max-h-80 overflow-auto rounded bg-slate-900 p-3 text-[11px] text-slate-100">{{ JSON.stringify(r.changes, null, 2) }}</pre>
                  <div v-if="r.request_ip || r.user_agent" class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                    <span v-if="r.request_ip">IP: {{ r.request_ip }}</span>
                    <span v-if="r.user_agent" class="truncate max-w-[640px]">UA: {{ r.user_agent }}</span>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
        <EmptyState v-else title="No audit events" message="No events matched the filters. Widen the range or clear filters." />
      </div>
      <div v-if="rows.length" class="shrink-0 border-t border-slate-100 bg-slate-50 px-4 py-2">
        <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-slate-600">
          <div class="whitespace-nowrap">Page {{ pageNumber }} / {{ pageCount }} &middot; {{ total }} total</div>
          <div class="flex items-center gap-2">
            <label class="flex items-center gap-1.5 whitespace-nowrap">
              <span class="text-slate-500">Rows</span>
              <select v-model.number="pageSize" class="input text-xs">
                <option :value="25">25</option>
                <option :value="50">50</option>
                <option :value="100">100</option>
                <option :value="200">200</option>
              </select>
            </label>
            <button class="btn-secondary !text-xs" :disabled="pageNumber <= 1" @click="pageNumber = Math.max(1, pageNumber - 1)">Prev</button>
            <button class="btn-secondary !text-xs" :disabled="pageNumber >= pageCount" @click="pageNumber = Math.min(pageCount, pageNumber + 1)">Next</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
