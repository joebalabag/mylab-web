<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useOwnerStore } from '../../stores/owner'
import SkeletonRows from '../../components/SkeletonRows.vue'
import EmptyState from '../../components/EmptyState.vue'
import { money, formatDateTime } from '../../utils/format'
import * as ownerMeApi from '../../api/ownerMe'

const owner = useOwnerStore()
const router = useRouter()

const loading = ref(false)
const summary = ref({ tenant_count: 0, active_users: 0, today_tests: 0, mtd_revenue: 0, pending_requisitions: 0 })
const tenants = ref([])

async function load() {
  loading.value = true
  try {
    const [sum, rows] = await Promise.all([
      ownerMeApi.getSummary(),
      ownerMeApi.listMyTenants(),
    ])
    summary.value = sum || { tenant_count: 0, active_users: 0, today_tests: 0, mtd_revenue: 0, pending_requisitions: 0 }
    tenants.value = Array.isArray(rows) ? rows : []
  } finally {
    loading.value = false
  }
}
onMounted(load)

const topTenants = computed(() =>
  [...tenants.value].sort((a, b) => (b.mtd_revenue || 0) - (a.mtd_revenue || 0)).slice(0, 5)
)

function openTenantReports(t) {
  router.push({ name: 'owner-tenant-reports', query: { tenant: t.tenant_uuid } })
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <div class="text-xs uppercase tracking-widest text-slate-500">Welcome back</div>
        <div class="text-2xl font-bold text-slate-800">{{ owner.currentUser?.name }}</div>
        <div class="text-sm text-slate-500">{{ owner.currentUser?.business_name }}</div>
      </div>
    </div>

    <SkeletonRows v-if="loading" :rows="2" />

    <template v-else>
      <!-- Stat cards -->
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div class="card p-4">
          <div class="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Tenants</div>
          <div class="mt-1 text-2xl font-bold text-slate-800 tabular-nums">{{ summary.tenant_count }}</div>
          <RouterLink to="/owner/tenants" class="mt-1 inline-block text-[11px] font-semibold text-teal-700 hover:underline">
            Manage →
          </RouterLink>
        </div>
        <div class="card p-4">
          <div class="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Active Users</div>
          <div class="mt-1 text-2xl font-bold text-slate-800 tabular-nums">{{ summary.active_users }}</div>
          <RouterLink to="/owner/users" class="mt-1 inline-block text-[11px] font-semibold text-teal-700 hover:underline">
            View users →
          </RouterLink>
        </div>
        <div class="card p-4">
          <div class="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Today's Tests</div>
          <div class="mt-1 text-2xl font-bold text-slate-800 tabular-nums">{{ summary.today_tests }}</div>
          <div class="mt-1 text-[11px] text-slate-500">across all branches</div>
        </div>
        <div class="card p-4">
          <div class="text-[10px] font-semibold uppercase tracking-widest text-slate-500">MTD Revenue</div>
          <div class="mt-1 text-2xl font-bold text-slate-800 tabular-nums">{{ money(summary.mtd_revenue) }}</div>
          <div class="mt-1 text-[11px] text-slate-500">month-to-date</div>
        </div>
        <div class="card p-4">
          <div class="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Pending Reqs</div>
          <div class="mt-1 text-2xl font-bold text-slate-800 tabular-nums">{{ summary.pending_requisitions }}</div>
          <div class="mt-1 text-[11px] text-slate-500">awaiting results</div>
        </div>
      </div>

      <!-- Top tenants leaderboard -->
      <div class="card overflow-hidden">
        <div class="card-header">
          <div>
            <div class="text-sm font-semibold text-slate-800">Top tenants by MTD revenue</div>
            <div class="text-xs text-slate-500">{{ tenants.length }} total branches</div>
          </div>
          <RouterLink to="/owner/tenants" class="btn-ghost !text-xs">All tenants →</RouterLink>
        </div>
        <EmptyState
          v-if="!tenants.length"
          title="No tenants yet"
          message="Ask the platform super-admin to assign tenants to your owner account."
        />
        <table v-else class="table">
          <thead class="bg-slate-50">
            <tr>
              <th class="text-left">Tenant</th>
              <th class="text-right">MTD Revenue</th>
              <th class="text-right hidden sm:table-cell">Today's Tests</th>
              <th class="text-right hidden sm:table-cell">Active Users</th>
              <th class="text-left hidden md:table-cell">Last Result</th>
              <th class="text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in topTenants" :key="t.tenant_uuid"
                class="cursor-pointer hover:bg-slate-50/60"
                @click="openTenantReports(t)">
              <td>
                <div class="font-semibold text-slate-800">{{ t.display_name }}</div>
                <div class="text-[11px] text-slate-500">
                  <span class="font-mono">{{ t.store_code }}</span>
                  <span v-if="t.branch"> · {{ t.branch }}</span>
                </div>
              </td>
              <td class="text-right font-semibold tabular-nums">{{ money(t.mtd_revenue || 0) }}</td>
              <td class="text-right tabular-nums hidden sm:table-cell">{{ t.today_tests || 0 }}</td>
              <td class="text-right tabular-nums hidden sm:table-cell">{{ t.active_users || 0 }}</td>
              <td class="hidden md:table-cell text-xs text-slate-500">
                {{ t.last_result_at ? formatDateTime(t.last_result_at) : '—' }}
              </td>
              <td class="text-right">
                <span v-if="t.status === 'active'" class="badge-success">Active</span>
                <span v-else class="badge-muted">{{ t.status }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
