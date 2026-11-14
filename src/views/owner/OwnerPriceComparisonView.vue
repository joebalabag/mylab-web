<script setup>
import { computed, onMounted, ref } from 'vue'
import { useOwnerStore } from '../../stores/owner'
import Modal from '../../components/Modal.vue'
import SkeletonRows from '../../components/SkeletonRows.vue'
import EmptyState from '../../components/EmptyState.vue'
import { money } from '../../utils/format'
import * as ownerMeApi from '../../api/ownerMe'

const owner = useOwnerStore()

const loading = ref(false)
const data = ref({ tenants: [], rows: [] })
const search = ref('')
const groupFilter    = ref('')
const categoryFilter = ref('')
const onlyGaps = ref(false)

async function load() {
  loading.value = true
  try {
    const result = await ownerMeApi.compareCatalog()
    data.value = result && typeof result === 'object' ? result : { tenants: [], rows: [] }
  } finally {
    loading.value = false
  }
}
onMounted(load)

const groups = computed(() => {
  const s = new Set(data.value.rows.map(r => r.item_group).filter(Boolean))
  return Array.from(s).sort()
})
// Category options respect the currently-selected group so the dropdowns
// don't offer combinations that produce zero rows.
const categories = computed(() => {
  const s = new Set()
  for (const r of data.value.rows) {
    if (groupFilter.value && r.item_group !== groupFilter.value) continue
    if (r.category) s.add(r.category)
  }
  return Array.from(s).sort()
})

const rows = computed(() => {
  const term = search.value.trim().toLowerCase()
  return data.value.rows.filter(r => {
    if (onlyGaps.value && !r.has_gap) return false
    if (groupFilter.value    && r.item_group !== groupFilter.value) return false
    if (categoryFilter.value && r.category   !== categoryFilter.value) return false
    if (!term) return true
    return r.item_code.toLowerCase().includes(term)
        || r.name.toLowerCase().includes(term)
        || r.category?.toLowerCase().includes(term)
        || r.item_group?.toLowerCase().includes(term)
  }).sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }))
})

const gapsCount = computed(() => data.value.rows.filter(r => r.has_gap).length)

/* ─── Edit prices modal ─── */
// `addEnabled[tenant_uuid]` tracks the "add this listing" checkboxes for
// tenants that currently have no row for this item — unchecked means the
// price input stays disabled and the tenant is skipped on save.
const edit = ref({ show: false, row: null, draft: {}, addEnabled: {}, saving: false, error: '' })
function openEdit(row) {
  // Seed draft prices per tenant. Tenants without an existing listing
  // start disabled; the owner must tick the checkbox to opt into the
  // clone-and-add path.
  const draft = {}
  const addEnabled = {}
  for (const t of data.value.tenants) {
    const v = row.prices[t.tenant_uuid]
    draft[t.tenant_uuid] = v != null ? String(v) : ''
    if (v == null) addEnabled[t.tenant_uuid] = false
  }
  edit.value = { show: true, row, draft, addEnabled, saving: false, error: '' }
}
function closeEdit() {
  if (edit.value.saving) return
  edit.value = { show: false, row: null, draft: {}, addEnabled: {}, saving: false, error: '' }
}
// Tenants in the modal that currently list this item — used both to pick a
// clone source server-side and to decide whether the "add" checkboxes have
// anything to copy from.
const sourceTenantCount = computed(() => {
  if (!edit.value.row) return 0
  return data.value.tenants.filter(t => edit.value.row.prices[t.tenant_uuid] != null).length
})
const anyAddChecked = computed(() => Object.values(edit.value.addEnabled || {}).some(Boolean))
function isNotListed(uuid) {
  return edit.value.row && edit.value.row.prices[uuid] == null
}
function isInputEnabled(uuid) {
  if (!isNotListed(uuid)) return true
  return !!edit.value.addEnabled[uuid]
}
async function saveEdit() {
  const { row, draft, addEnabled } = edit.value
  if (!row) return
  // Guard against junk input before touching storage
  for (const [uuid, v] of Object.entries(draft)) {
    if (v === '' || v == null) continue
    // Ignore not-listed tenants whose checkbox is off — they won't be sent.
    if (isNotListed(uuid) && !addEnabled[uuid]) continue
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0) {
      edit.value.error = `Price for ${data.value.tenants.find(t => t.tenant_uuid === uuid)?.store_code || uuid} is not a valid non-negative number.`
      return
    }
  }
  // Checked-to-add tenants must also have a price typed in.
  for (const [uuid, enabled] of Object.entries(addEnabled || {})) {
    if (!enabled) continue
    const v = draft[uuid]
    if (v === '' || v == null) {
      edit.value.error = `Type a price for ${data.value.tenants.find(t => t.tenant_uuid === uuid)?.store_code || uuid} or uncheck "Add this item" for that tenant.`
      return
    }
  }
  // Build the two maps up-front so we can short-circuit an empty save
  // without firing a wasted PATCH.
  const prices = {}
  const add = {}
  for (const [uuid, v] of Object.entries(draft)) {
    if (v === '' || v == null) continue
    const num = Number(v)
    if (isNotListed(uuid)) {
      if (addEnabled[uuid]) add[uuid] = num
    } else {
      prices[uuid] = num
    }
  }
  if (Object.keys(prices).length === 0 && Object.keys(add).length === 0) {
    edit.value.error = 'Nothing to save. Edit at least one price or tick an "add" checkbox.'
    return
  }
  edit.value.saving = true
  edit.value.error = ''
  try {
    const result = await ownerMeApi.bulkPriceEdit(row.item_code, prices, add)
    // Reload the pivot so min/max/gap flags refresh from truth.
    data.value = await ownerMeApi.compareCatalog()
    const touched  = Number(result?.touched || 0)
    const added    = Number(result?.added   || 0)
    const sig      = Array.isArray(result?.new_group_needs_signatory) ? result.new_group_needs_signatory : []
    const skipped  = Array.isArray(result?.skipped) ? result.skipped : []
    const parts = []
    if (touched) parts.push(`updated ${touched} price${touched === 1 ? '' : 's'}`)
    if (added)   parts.push(`added listing to ${added} tenant${added === 1 ? '' : 's'}`)
    if (sig.length) {
      const names = sig.map(uuid => data.value.tenants.find(t => t.tenant_uuid === uuid)?.store_code || uuid)
      const label = names.length === 1
        ? `signatory not set for ${names[0]}`
        : `signatory not set for ${names.length} new branches`
      parts.push(label)
    }
    if (skipped.length) parts.push(`${skipped.length} skipped`)
    flash(parts.length
      ? `${row.item_code}: ${parts.join(', ')}`
      : `No changes saved for ${row.item_code}`,
      (sig.length || skipped.length) ? 6000 : 2500)
    closeEdit()
  } catch (e) {
    edit.value.error = e?.message || 'Failed to save prices'
  } finally {
    edit.value.saving = false
  }
}

const flashMsg = ref('')
let flashTimer = null
function flash(m, ms = 2500) {
  flashMsg.value = m
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => flashMsg.value = '', ms)
}

function cellClass(row, tenant_uuid) {
  const v = row.prices[tenant_uuid]
  if (v == null) return 'text-slate-300'
  if (!row.has_gap) return ''
  if (v === row.min) return 'bg-emerald-50 text-emerald-700 font-semibold'
  if (v === row.max) return 'bg-rose-50 text-rose-700 font-semibold'
  return 'text-slate-700'
}

function exportCsv() {
  const header = ['item_code', 'name', 'category', ...data.value.tenants.map(t => `${t.display_name} (${t.store_code})`)]
  const lines = [header.join(',')]
  for (const r of rows.value) {
    const cells = [
      quote(r.item_code),
      quote(r.name),
      quote(r.category || ''),
      ...data.value.tenants.map(t => (r.prices[t.tenant_uuid] != null ? r.prices[t.tenant_uuid] : ''))
    ]
    lines.push(cells.join(','))
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `price-comparison-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
function quote(v) {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
</script>

<template>
  <div class="flex h-full flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <div class="text-xs uppercase tracking-widest text-slate-500">Catalog</div>
        <div class="text-xl font-bold text-slate-800">Price comparison</div>
        <div class="text-xs text-slate-500">
          Pivot of catalog prices across your branches, keyed by <span class="font-mono">item_code</span>.
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button class="btn-secondary !text-xs" @click="exportCsv" :disabled="!rows.length">
          <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Export CSV
        </button>
      </div>
    </div>

    <SkeletonRows v-if="loading" :rows="4" />

    <EmptyState
      v-else-if="!data.tenants.length"
      title="No tenants to compare"
      message="You need at least two tenants to see a meaningful price comparison."
    />

    <template v-else>
      <transition name="fade">
        <div v-if="flashMsg" class="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {{ flashMsg }}
        </div>
      </transition>

      <div class="card p-4 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
        <label class="block">
          <span class="label">Search</span>
          <input v-model="search" class="input" placeholder="code, name, group, category…" />
        </label>
        <label class="block">
          <span class="label">Item group</span>
          <select v-model="groupFilter" class="input">
            <option value="">All groups</option>
            <option v-for="g in groups" :key="g" :value="g">{{ g }}</option>
          </select>
        </label>
        <label class="block">
          <span class="label">Item category</span>
          <select v-model="categoryFilter" class="input">
            <option value="">All categories</option>
            <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
          </select>
        </label>
        <label class="inline-flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" v-model="onlyGaps" class="h-4 w-4 rounded border-slate-300" />
          <span>Only show items with price gaps ({{ gapsCount }})</span>
        </label>
      </div>

      <div class="card flex min-h-0 flex-1 flex-col overflow-hidden">
        <div class="card-header">
          <div>
            <div class="text-sm font-semibold text-slate-800">{{ rows.length }} rows</div>
            <div class="text-xs text-slate-500">
              <span class="mr-2 inline-flex items-center gap-1">
                <span class="inline-block h-2 w-2 rounded-full bg-emerald-500"></span> cheapest
              </span>
              <span class="inline-flex items-center gap-1">
                <span class="inline-block h-2 w-2 rounded-full bg-rose-500"></span> priciest
              </span>
            </div>
          </div>
        </div>

        <div class="min-h-0 flex-1 overflow-auto">
          <EmptyState
            v-if="!rows.length"
            title="No items match"
            message="Clear the search or the gaps-only toggle."
          />
          <table v-else class="table">
            <thead class="sticky top-0 z-10 bg-slate-50 shadow-[inset_0_-1px_0_theme(colors.slate.100)]">
              <tr>
                <th class="text-left">Code</th>
                <th class="text-left">Name</th>
                <th class="text-left hidden lg:table-cell">Group</th>
                <th class="text-left hidden md:table-cell">Category</th>
                <th v-for="t in data.tenants" :key="t.tenant_uuid" class="text-right whitespace-nowrap">
                  {{ t.store_code }}
                  <div class="text-[10px] font-normal text-slate-500">{{ t.branch || t.display_name }}</div>
                </th>
                <th class="text-right">Spread</th>
                <th class="w-14 text-right">Edit</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in rows" :key="r.item_code" class="hover:bg-slate-50/60">
                <td class="font-mono text-sm">{{ r.item_code }}</td>
                <td class="font-medium text-slate-800">{{ r.name }}</td>
                <td class="hidden lg:table-cell text-xs text-slate-500">{{ r.item_group || '—' }}</td>
                <td class="hidden md:table-cell text-xs text-slate-500">{{ r.category || '—' }}</td>
                <td v-for="t in data.tenants" :key="t.tenant_uuid"
                    class="text-right tabular-nums"
                    :class="cellClass(r, t.tenant_uuid)">
                  <span v-if="r.prices[t.tenant_uuid] != null">{{ money(r.prices[t.tenant_uuid]) }}</span>
                  <span v-else>—</span>
                </td>
                <td class="text-right font-semibold tabular-nums"
                    :class="r.has_gap ? 'text-amber-700' : 'text-slate-400'">
                  <template v-if="r.min != null && r.max != null">
                    {{ r.has_gap ? money(r.max - r.min) : '—' }}
                  </template>
                  <span v-else>—</span>
                </td>
                <td class="text-right">
                  <button class="btn-icon" title="Edit prices for this item" @click="openEdit(r)">
                    <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                         stroke-linecap="round" stroke-linejoin="round">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- Edit prices modal -->
    <Modal :show="edit.show" @close="closeEdit"
           :title="edit.row ? `Edit prices · ${edit.row.item_code}` : 'Edit prices'"
           size="md">
      <div v-if="edit.row" class="space-y-4">
        <div class="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Item</div>
          <div class="text-sm font-semibold text-slate-800">{{ edit.row.name }}</div>
          <div class="text-[11px] text-slate-500">
            <span class="font-mono">{{ edit.row.item_code }}</span>
            <span v-if="edit.row.item_group"> · {{ edit.row.item_group }}</span>
            <span v-if="edit.row.category"> · {{ edit.row.category }}</span>
          </div>
        </div>

        <div class="space-y-2">
          <div class="text-xs font-bold uppercase tracking-widest text-slate-500">Price per tenant</div>
          <div class="space-y-2">
            <div v-for="t in data.tenants" :key="t.tenant_uuid"
                 class="flex items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2"
                 :class="isNotListed(t.tenant_uuid) && !edit.addEnabled[t.tenant_uuid] ? 'opacity-60' : ''">
              <label v-if="isNotListed(t.tenant_uuid)"
                     class="flex shrink-0 items-center"
                     :title="sourceTenantCount ? 'Add this item to this tenant' : 'No other tenant has this item to copy from'">
                <input
                  type="checkbox"
                  v-model="edit.addEnabled[t.tenant_uuid]"
                  :disabled="!sourceTenantCount"
                  class="h-4 w-4 rounded border-slate-300"
                />
              </label>
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-semibold text-slate-800">{{ t.display_name }}</div>
                <div class="text-[11px] text-slate-500">
                  <span class="font-mono">{{ t.store_code }}</span>
                  <span v-if="t.branch"> · {{ t.branch }}</span>
                  <span v-if="isNotListed(t.tenant_uuid)" class="ml-1 italic text-slate-400">· not listed</span>
                </div>
              </div>
              <div class="flex items-center gap-1">
                <span class="text-xs text-slate-500">PHP</span>
                <input
                  v-model="edit.draft[t.tenant_uuid]"
                  type="number"
                  step="0.01"
                  min="0"
                  class="input w-32 text-right font-mono disabled:bg-slate-50 disabled:text-slate-400"
                  :disabled="!isInputEnabled(t.tenant_uuid)"
                  :placeholder="isNotListed(t.tenant_uuid) ? (edit.addEnabled[t.tenant_uuid] ? 'New price' : 'Not listed') : ''"
                />
              </div>
            </div>
          </div>
          <p v-if="anyAddChecked" class="rounded-md border border-sky-100 bg-sky-50 px-3 py-2 text-[11px] text-sky-800">
            For every checked tenant above, the item's details (components, plus category &amp; group if missing) will be copied from the owned tenant whose listing for <span class="font-mono">{{ edit.row.item_code }}</span> was <b>most recently modified</b>, then stamped with the price you typed.
          </p>
          <p v-else class="text-[11px] text-slate-500">
            Leave a tenant blank to skip. For a tenant marked <b>not listed</b>, tick the checkbox to add this item; details will be copied from the owned tenant whose listing was most recently modified.
          </p>
        </div>

        <div v-if="edit.error" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ edit.error }}
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" :disabled="edit.saving" @click="closeEdit">Cancel</button>
        <button class="btn-primary" :disabled="edit.saving" @click="saveEdit">
          {{ edit.saving ? 'Saving…' : 'Save prices' }}
        </button>
      </template>
    </Modal>
  </div>
</template>
