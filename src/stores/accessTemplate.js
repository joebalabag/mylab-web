import { defineStore } from 'pinia'
import * as accessTemplateApi from '../api/accessTemplate'

// Small key normalizer: "Sales / POS" → "sales_/_pos" is ugly, so we lowercase
// and use the source text as-is for grouping; keys for save/load are just the
// numeric `navigation_id` from the server so ordering/renaming stays safe.
function norm(s) { return String(s || '').trim().toLowerCase() }

export const useAccessTemplateStore = defineStore('accessTemplate', {
  state: () => ({
    rows: [],           // raw flat rows from GET /access-template/dashboard
    loaded: false,
    loading: false,
    error: null
  }),
  getters: {
    // All navigation_ids in the catalog — used by "Select all".
    allNavigationIds: (s) => s.rows.map(r => r.navigation_id),

    // Nested tree for the Assign Access modal:
    //   [ { key, label, modules: [ { key, label, actions:[{navigation_id, label}] } ] } ]
    // A `main_navigation` becomes a container-module when it has >1 row OR its
    // single row's `sub_navigation` is not "all-access". Otherwise it renders
    // as a simple toggle whose access key is the row's navigation_id.
    tree: (s) => {
      const groups = new Map()  // catalog → { key, label, modules: Map }
      for (const r of s.rows) {
        const gKey = norm(r.catalog)
        if (!groups.has(gKey)) {
          groups.set(gKey, {
            key: gKey,
            label: r.catalog,
            order: r.catalog_id || 0,
            modules: new Map()
          })
        }
        const g = groups.get(gKey)
        const mKey = norm(r.main_navigation)
        if (!g.modules.has(mKey)) {
          g.modules.set(mKey, {
            key: mKey,
            label: r.main_navigation,
            rows: []
          })
        }
        g.modules.get(mKey).rows.push(r)
      }
      // Materialize + decide simple vs container per module.
      const asArray = [...groups.values()]
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map(g => ({
          key: g.key,
          label: g.label,
          modules: [...g.modules.values()].map(m => {
            const rows = m.rows.slice().sort((a, b) => (a.catalog_id || 0) - (b.catalog_id || 0))
            const isSimple = rows.length === 1 && norm(rows[0].sub_navigation) === 'all-access'
            if (isSimple) {
              return {
                key: m.key,
                label: m.label,
                navigation_id: rows[0].navigation_id,
                remarks: rows[0].remarks || rows[0].remark || rows[0].description || rows[0].note || ''
              }
            }
            return {
              key: m.key,
              label: m.label,
              actions: rows.map(r => ({
                navigation_id: r.navigation_id,
                label: r.sub_navigation,
                remarks: r.remarks || r.remark || r.description || r.note || ''
              }))
            }
          })
        }))
      return asArray
    },

    // Every navigation_id that belongs to one module — used by module-toggle.
    moduleNavigationIds: () => (mod) => {
      if (!mod) return []
      if (Array.isArray(mod.actions)) return mod.actions.map(a => a.navigation_id)
      return [mod.navigation_id]
    }
  },
  actions: {
    async fetch({ force = false } = {}) {
      if (this.loaded && !force) return
      this.loading = true
      this.error = null
      try {
        const res = await accessTemplateApi.listAccessTemplate({ page_size: 500 })
        this.rows = Array.isArray(res?.results) ? res.results
                   : Array.isArray(res) ? res
                   : []
        this.loaded = true
        return this.rows
      } catch (e) {
        this.error = e?.message || 'Failed to load access template'
        throw e
      } finally {
        this.loading = false
      }
    },
    // Auto-active rule: a module's menu is visible when the user holds ANY
    // navigation_id belonging to it.
    isModuleActive(userIds, mod) {
      if (!mod) return false
      const set = new Set(Array.isArray(userIds) ? userIds : [])
      return this.moduleNavigationIds(mod).some(id => set.has(id))
    }
  }
})
