<script setup>
import { computed, onMounted } from 'vue'
import { useTenantStore } from '../../stores/tenant'
import { usePlansStore } from '../../stores/plans'
import { useSuperAdminStore } from '../../stores/superAdmin'
import StatCard from '../../components/StatCard.vue'
import { money, formatDate } from '../../utils/format'

const tenants = useTenantStore()
const plans   = usePlansStore()
const superAdmin = useSuperAdminStore()

onMounted(() => {
  tenants.fetchAllFromApi().catch(() => {})
  plans.fetchAll().catch(() => {})
})

const totalTenants    = computed(() => tenants.all.length)
const activeTenants   = computed(() => tenants.activeTenants.length)
const inactiveTenants = computed(() => tenants.inactiveTenants.length)

const isActivePlan   = (p) => p.status ? p.status === 'active' : p.active !== false
const isActiveTenant = (t) => t.status ? t.status === 'active' : t.active !== false

const recentTenants = computed(() =>
  [...tenants.all]
    .sort((a, b) => String(b.created_at || b.createdAt || '').localeCompare(String(a.created_at || a.createdAt || '')))
    .slice(0, 5)
)

const totalPlans   = computed(() => plans.items.length)
const activePlans  = computed(() => plans.activePlans.length)
const totalAdmins  = computed(() => superAdmin.items.length)
const activeAdmins = computed(() => superAdmin.activeCount)

const planCatalogue = computed(() =>
  [...plans.items].sort((a, b) => Number(a.price ?? 0) - Number(b.price ?? 0))
)
</script>

<template>
  <div class="space-y-6">
    <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard label="Tenants" :value="totalTenants" :hint="`${activeTenants} active · ${inactiveTenants} inactive`" tone="brand">
        <template #icon>
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8"
               stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 9l1.5-5h15L21 9"/>
            <path d="M4 9v10a1 1 0 001 1h14a1 1 0 001-1V9"/>
            <path d="M9 22V12h6v10"/>
          </svg>
        </template>
      </StatCard>
      <StatCard label="Active tenants" :value="activeTenants" :hint="`of ${totalTenants} total`" tone="emerald">
        <template #icon>
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8"
               stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </template>
      </StatCard>
      <StatCard label="Subscription plans" :value="totalPlans" :hint="`${activePlans} active`" tone="amber">
        <template #icon>
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8"
               stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="6" width="18" height="12" rx="2"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
        </template>
      </StatCard>
      <StatCard label="Super admins" :value="totalAdmins" :hint="`${activeAdmins} active`" tone="rose">
        <template #icon>
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8"
               stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2l9 4v6c0 5-3.5 9-9 10-5.5-1-9-5-9-10V6l9-4z"/>
          </svg>
        </template>
      </StatCard>
    </div>

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <!-- Plan catalogue -->
      <div class="card lg:col-span-2">
        <div class="card-header">
          <div class="text-sm font-semibold text-slate-800">Plan catalogue</div>
          <RouterLink to="/super/plans" class="text-xs font-semibold text-indigo-600 hover:underline">Manage →</RouterLink>
        </div>
        <div class="p-4 space-y-3">
          <div v-for="p in planCatalogue" :key="p.uuid" class="rounded-lg border border-slate-100 p-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="font-mono text-[10px] font-bold text-slate-500">{{ p.code }}</span>
                <span class="font-semibold text-slate-800">{{ p.name }}</span>
                <span v-if="!isActivePlan(p)" class="badge-muted">inactive</span>
              </div>
              <div class="text-right">
                <div class="text-sm font-bold text-slate-800">{{ money(p.price) }}</div>
                <div class="text-[10px] text-slate-500">/ {{ p.days_duration }}d</div>
              </div>
            </div>
          </div>
          <div v-if="!planCatalogue.length" class="py-6 text-center text-sm text-slate-500">
            No plans configured yet.
          </div>
        </div>
      </div>

      <!-- Recent tenants -->
      <div class="card lg:col-span-3">
        <div class="card-header">
          <div class="text-sm font-semibold text-slate-800">Recent tenants</div>
          <RouterLink to="/super/tenants" class="text-xs font-semibold text-indigo-600 hover:underline">View all →</RouterLink>
        </div>
        <table class="table">
          <thead>
            <tr>
              <th>Store</th>
              <th>Created</th>
              <th class="text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!recentTenants.length">
              <td colspan="3" class="py-6 text-center text-sm text-slate-500">No tenants yet.</td>
            </tr>
            <tr v-for="t in recentTenants" :key="t.uuid">
              <td>
                <div class="font-semibold text-slate-800">{{ t.display_name || t.name }}</div>
                <div class="text-xs text-slate-500 font-mono">{{ t.store_code || t.code }}</div>
              </td>
              <td class="text-slate-600">{{ formatDate(t.created_at || t.createdAt) }}</td>
              <td class="text-right">
                <span v-if="isActiveTenant(t)" class="badge-success">Active</span>
                <span v-else class="badge-danger">Inactive</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
