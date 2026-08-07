import { defineStore } from 'pinia'
import * as api from '../api/expenses'
import { useAuthStore } from './auth'

// Voided rows stay in the list so operators can inspect history without a
// separate archive fetch. Any code that computes totals should filter first
// via the `validItems` getter. Backend uses `status = 'void'`; historic
// data may also carry `'voided'`, so we accept both.
function isVoided(row) {
  const s = String(row?.status || '').toLowerCase()
  return s === 'void' || s === 'voided'
}

export const useExpensesStore = defineStore('expenses', {
  state: () => ({
    items:   [],
    total:   0,
    loading: false,
    saving:  false,
    error:   '',
    // Server-side filter state. `page_size: 0` = "no pagination, give me
    // everything" — matches the other dashboard endpoints.
    filters: {
      keywords:   '',
      category:   '',
      date_from:  '',
      date_to:    '',
      status:     [],
      page_number: 0,
      page_size:   0
    }
  }),

  getters: {
    validItems:  (s) => s.items.filter(i => !isVoided(i)),
    voidedItems: (s) => s.items.filter(i =>  isVoided(i)),
    // Sum of non-voided amounts. Used by the dashboard's summary strip.
    totalAmount: (s) => s.items
      .filter(i => !isVoided(i))
      .reduce((sum, i) => sum + (Number(i.amount) || 0), 0),
    // { [category]: totalAmount } — powers the category breakdown card.
    totalsByCategory: (s) => {
      const out = {}
      for (const row of s.items) {
        if (isVoided(row)) continue
        const key = row.category || 'Uncategorized'
        out[key] = (out[key] || 0) + (Number(row.amount) || 0)
      }
      return out
    }
  },

  actions: {
    setFilters(patch) {
      this.filters = { ...this.filters, ...patch }
    },
    resetFilters() {
      this.filters = {
        keywords: '', category: '',
        date_from: '', date_to: '',
        status: [], page_number: 0, page_size: 0
      }
    },

    async fetch(patch = {}) {
      const auth = useAuthStore()
      this.loading = true
      this.error   = ''
      try {
        const filters = {
          tenant_uuid: auth.tenantUuid || undefined,
          // Scope the dashboard to the signed-in user so cashiers see only
          // the expenses they recorded. A caller can pass `user_uuid: ''`
          // in the patch to opt out (e.g. an admin store-wide view).
          user_uuid:   auth.user?.uuid || undefined,
          ...this.filters,
          ...patch
        }
        const res = await api.listDashboard(filters)
        this.items = Array.isArray(res?.results) ? res.results
                   : Array.isArray(res) ? res
                   : []
        this.total = res?.total ?? this.items.length
        return res
      } catch (e) {
        this.error = e?.message || 'Failed to load expenses'
        this.items = []
        this.total = 0
        throw e
      } finally {
        this.loading = false
      }
    },

    async view(uuid) {
      // Delegated for callers that need a full record — the list may or may
      // not include audit-only fields (voided_reason, voided_by_name).
      return api.viewExpense(uuid)
    },

    // payload: { expense_date, category, description, amount, notes? }
    // Backend wire field is `date_transact`; the view still speaks
    // `expense_date` so template code doesn't need to know either way.
    async create(payload) {
      const auth = useAuthStore()
      this.saving = true
      this.error  = ''
      try {
        const body = {
          tenant_uuid:   auth.tenantUuid   || undefined,
          user_uuid:     auth.user?.uuid   || undefined,
          date_transact: payload.date_transact || payload.expense_date,
          category:      payload.category,
          description:   payload.description,
          amount:        Number(payload.amount) || 0,
          notes:         payload.notes || undefined
        }
        const created = await api.createExpense(body)
        if (created?.uuid) this.items.unshift(created)
        return created
      } catch (e) {
        this.error = e?.message || 'Failed to create expense'
        throw e
      } finally {
        this.saving = false
      }
    },

    async update(uuid, payload) {
      if (!uuid) throw new Error('Expense uuid is required')
      this.saving = true
      this.error  = ''
      try {
        const body = {
          date_transact: payload.date_transact || payload.expense_date,
          category:      payload.category,
          description:   payload.description,
          amount:        Number(payload.amount) || 0,
          notes:         payload.notes || undefined
        }
        const updated = await api.updateExpense(uuid, body)
        if (updated?.uuid) this._upsert(updated)
        return updated
      } catch (e) {
        this.error = e?.message || 'Failed to update expense'
        throw e
      } finally {
        this.saving = false
      }
    },

    async voidExpense(uuid, reason) {
      if (!uuid) throw new Error('Expense uuid is required')
      this.saving = true
      this.error  = ''
      try {
        const updated = await api.voidExpense(uuid, { reason: reason || 'Voided' })
        if (updated?.uuid) this._upsert(updated)
        return updated
      } catch (e) {
        this.error = e?.message || 'Failed to void expense'
        throw e
      } finally {
        this.saving = false
      }
    },

    _upsert(row) {
      if (!row?.uuid) return
      const idx = this.items.findIndex(i => i.uuid === row.uuid)
      if (idx >= 0) this.items[idx] = row
      else this.items.unshift(row)
    }
  }
})
