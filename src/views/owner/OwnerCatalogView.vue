<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useOwnerStore } from '../../stores/owner'
import SkeletonRows from '../../components/SkeletonRows.vue'
import EmptyState from '../../components/EmptyState.vue'
import { money } from '../../utils/format'
import * as ownerMeApi from '../../api/ownerMe'

const owner = useOwnerStore()
const route = useRoute()
const router = useRouter()

const loading = ref(false)
const tenants = ref([])
const selectedUuid = ref('')
const search = ref('')

const catalogRows = ref([])
async function load() {
  loading.value = true
  try {
    const rows = await ownerMeApi.listMyTenants()
    tenants.value = Array.isArray(rows) ? rows : []
    const fromQuery = String(route.query.tenant || '')
    selectedUuid.value = (fromQuery && tenants.value.find(t => t.tenant_uuid === fromQuery))
      ? fromQuery
      : (tenants.value[0]?.tenant_uuid || '')
    if (selectedUuid.value) await loadCatalog()
  } finally {
    loading.value = false
  }
}
onMounted(load)

async function loadCatalog() {
  if (!selectedUuid.value) { catalogRows.value = []; return }
  try {
    const items = await ownerMeApi.listCatalog(selectedUuid.value)
    catalogRows.value = Array.isArray(items) ? items : []
  } catch (_) {
    catalogRows.value = []
  }
}

watch(selectedUuid, async (v) => {
  if (!v) return
  if (String(route.query.tenant || '') !== v) {
    router.replace({ query: { ...route.query, tenant: v } })
  }
  await loadCatalog()
})

const items = computed(() => {
  const term = search.value.trim().toLowerCase()
  return catalogRows.value
    .filter(i => !term
      || i.item_code?.toLowerCase().includes(term)
      || i.name?.toLowerCase().includes(term)
      || (i.category || '').toLowerCase().includes(term)
      || (i.item_group || '').toLowerCase().includes(term))
})

const grouped = computed(() => {
  const byCat = new Map()
  for (const item of items.value) {
    const key = item.category || 'Uncategorised'
    if (!byCat.has(key)) byCat.set(key, [])
    byCat.get(key).push(item)
  }
  return Array.from(byCat.entries()).sort((a, b) => a[0].localeCompare(b[0]))
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <div class="text-xs uppercase tracking-widest text-slate-500">Catalog</div>
        <div class="text-xl font-bold text-slate-800">Per-tenant catalog browser</div>
      </div>
      <div class="flex items-center gap-2">
        <RouterLink to="/owner/catalog/compare" class="btn-secondary !text-xs">
          <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="20" x2="18" y2="10"/>
            <line x1="12" y1="20" x2="12" y2="4"/>
            <line x1="6" y1="20" x2="6" y2="14"/>
          </svg>
          Price comparison
        </RouterLink>
      </div>
    </div>

    <SkeletonRows v-if="loading && !tenants.length" :rows="4" />

    <EmptyState
      v-else-if="!tenants.length"
      title="No tenants to browse"
      message="Assign tenants to your owner account to view their catalogs."
    />

    <template v-else>
      <div class="card p-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label class="block flex-1">
          <span class="label">Tenant</span>
          <select v-model="selectedUuid" class="input">
            <option v-for="t in tenants" :key="t.tenant_uuid" :value="t.tenant_uuid">
              {{ t.display_name }} · {{ t.store_code }}{{ t.branch ? ' / ' + t.branch : '' }}
            </option>
          </select>
        </label>
        <label class="block flex-1">
          <span class="label">Search catalog</span>
          <input v-model="search" class="input" placeholder="code, name, or category…" />
        </label>
      </div>

      <EmptyState
        v-if="!items.length"
        title="No catalog items"
        :message="search ? 'Try clearing the search.' : 'This tenant has no catalog items yet.'"
      />

      <div v-else class="space-y-4">
        <section v-for="[cat, rows] in grouped" :key="cat" class="card overflow-hidden">
          <div class="card-header">
            <div>
              <div class="text-sm font-semibold text-slate-800">{{ cat }}</div>
              <div class="text-xs text-slate-500">{{ rows.length }} item{{ rows.length === 1 ? '' : 's' }}</div>
            </div>
            <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Read-only
            </span>
          </div>
          <table class="table">
            <thead class="bg-slate-50">
              <tr>
                <th class="text-left">Code</th>
                <th class="text-left">Name</th>
                <th class="text-right">Price</th>
                <th class="text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="i in rows" :key="i.item_code" class="hover:bg-slate-50/60">
                <td class="font-mono text-sm">{{ i.item_code }}</td>
                <td>{{ i.name }}</td>
                <td class="text-right font-semibold tabular-nums">{{ money(i.price) }}</td>
                <td>
                  <span v-if="i.status === 'active'" class="badge-success">Active</span>
                  <span v-else class="badge-muted">{{ i.status }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </template>
  </div>
</template>
