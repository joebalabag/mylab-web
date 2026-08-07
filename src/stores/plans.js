import { defineStore } from 'pinia'
import * as plansApi from '../api/subscriptionPlans'

// Plans are fetched on every view that reads them (DashboardView,
// SubscriptionView, Super* views all call fetchAll() on mount), so
// persisting the list to localStorage bought us at most a ~200 ms warm-render
// on repeat visits — not worth the bloat or the stale-data risk. Kept purely
// in-memory now. The `LEGACY_KEY` prune below self-cleans older browsers that
// still have `pos_plans` sitting in storage from before this change.
const LEGACY_KEY = 'pos_plans'
try { localStorage.removeItem(LEGACY_KEY) } catch (_) {}

export const usePlansStore = defineStore('plans', {
  state: () => ({
    items: [],
    loading: false,
    error: ''
  }),
  getters: {
    activePlans: (s) => s.items.filter(p => (p.status ? p.status === 'active' : p.active !== false)),
    byUuid: (s) => (uuid) => s.items.find(p => p.uuid === uuid) || null,
    byCode: (s) => (code) => s.items.find(p => p.code === code) || null
  },
  actions: {
    async fetchAll(filters = {}) {
      this.loading = true
      this.error = ''
      try {
        const res = await plansApi.listPlans(filters)
        this.items = Array.isArray(res?.results) ? res.results : []
        return res
      } catch (e) {
        this.error = e?.message || 'Failed to load plans'
        throw e
      } finally {
        this.loading = false
      }
    },
    async create(payload, file) {
      const created = await plansApi.createPlan(payload, file)
      if (created?.uuid) this.items.unshift(created)
      return created
    },
    async update(uuid, payload, file) {
      const updated = await plansApi.updatePlan(uuid, payload, file)
      if (updated?.uuid) {
        const idx = this.items.findIndex(p => p.uuid === uuid)
        if (idx >= 0) this.items[idx] = { ...this.items[idx], ...updated }
        else this.items.push(updated)
      }
      return updated
    },
    async setStatus(uuid, status) {
      const updated = await plansApi.setPlanStatus(uuid, status)
      if (updated?.uuid) {
        const idx = this.items.findIndex(p => p.uuid === uuid)
        if (idx >= 0) this.items[idx] = { ...this.items[idx], ...updated }
      }
      return updated
    },
    async remove(uuid) {
      await plansApi.deletePlan(uuid)
      this.items = this.items.filter(p => p.uuid !== uuid)
    }
  }
})
