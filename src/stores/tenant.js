import { defineStore } from 'pinia'
import * as tenantApi from '../api/tenants'

export const DEMO_TENANT_UUID = '00000000-0000-4000-8000-000000000001'

const CURRENT_KEY = 'pos_tenant'
const KNOWN_KEY   = 'pos_tenants'

const DEFAULT_TENANT = {
  uuid: DEMO_TENANT_UUID,
  code: 'MAIN',
  name: 'Sample Lab',
  legalName: 'Sample Diagnostics Corp.',
  ownerName: '',
  logo: '',                                     // base64 data URL
  tin: '000-000-000-000',
  vatRegistered: true,
  branch: 'Main Branch',
  terminalId: '01',

  address1: '123 Rizal Avenue',
  address2: 'Barangay San Isidro',
  city: 'Quezon City',
  province: 'Metro Manila',
  postalCode: '1100',
  country: 'Philippines',

  phone: '+63 917 000 0000',
  email: 'hello@lab.local',
  website: 'lab.local',

  currency: 'PHP',
  currencySymbol: '₱',

  receiptHeader: 'OFFICIAL RECEIPT',
  receiptFooter: 'Thank you for choosing us!\nPlease come again.',
  showLogoOnReceipt: true,
  showTinOnReceipt: true,
  // Whole-body custom overrides. Off by default so a fresh tenant keeps
  // the auto-generated store block. When on, ReceiptContent + escpos skip
  // the auto sections and print the custom text as-is.
  useCustomReceiptHeader: false,
  customReceiptHeader: '',
  useCustomReceiptFooter: false,
  customReceiptFooter: '',

  // Lab report Result Header. Mode 'logo_text' (default) prints the tenant
  // logo on the left + labHeaderText on the right; 'image' prints labHeaderImage
  // as a full-width banner instead.
  labHeaderMode: 'logo_text',
  labHeaderImage: '',
  labHeaderText: '',

  // Platform / super-admin managed fields
  active: true,
  planId: 2,                                    // STARTER by default
  billingCycle: 'monthly',                      // 'monthly' | 'yearly'
  trialEndsAt: null,                            // ISO date string
  createdAt: '2026-01-01'
}

// Robust boolean parser. `!!v` treats the string "false" as truthy (any
// non-empty string is truthy in JS) — which is exactly what some backends
// return in JSON when the column is a stringified boolean. Guard for it.
function parseBool(v) {
  if (v === true || v === 1) return true
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    return s === '1' || s === 'true' || s === 'yes' || s === 'on'
  }
  return false
}

function newUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

function loadCurrent() {
  try {
    const stored = JSON.parse(localStorage.getItem(CURRENT_KEY) || 'null')
    if (stored) return { ...DEFAULT_TENANT, ...stored }
  } catch (_) { /* ignore corrupt */ }
  return { ...DEFAULT_TENANT }
}
function persistCurrent(t) { localStorage.setItem(CURRENT_KEY, JSON.stringify(t)) }

// The `known` roster is only meaningful in the super-admin console (see
// SuperTenantsView / SuperDashboardView, which populate it on mount via
// `fetchAllFromApi`). Staff sessions never fetch a tenant list, so we no
// longer seed a placeholder here — a fresh staff login starts with `known: []`
// and `pos_tenants` is only written when a super-admin actually populates it.
// The `.filter(...)` also prunes the legacy DEMO_TENANT_UUID placeholder from
// existing browsers that got seeded before this cleanup.
function loadKnown() {
  try {
    const stored = JSON.parse(localStorage.getItem(KNOWN_KEY) || 'null')
    if (Array.isArray(stored) && stored.length) {
      return stored.filter(t => t?.uuid && t.uuid !== DEMO_TENANT_UUID)
    }
  } catch (_) { /* ignore */ }
  return []
}
function persistKnown(list) { localStorage.setItem(KNOWN_KEY, JSON.stringify(list)) }

export const useTenantStore = defineStore('tenant', {
  state: () => ({
    current: loadCurrent(),
    known: loadKnown()
  }),
  getters: {
    uuid: (s) => s.current.uuid,
    code: (s) => s.current.code,
    name: (s) => s.current.name,
    logo: (s) => s.current.logo,
    // Login response echoes plan.allowed_modules onto current.subscription;
    // fall back to [] so "no plan yet" locks every POS surface instead of
    // silently opening them.
    planAllowedModules: (s) => {
      const list = s.current?.subscription?.allowed_modules
      return Array.isArray(list) ? list : []
    },
    planMaxTerminals: (s) => {
      const cap = s.current?.subscription?.max_terminals
      return (cap === null || cap === undefined) ? null : Number(cap)
    },
    addressLines: (s) => [
      s.current.address1,
      s.current.address2,
      [s.current.city, s.current.province].filter(Boolean).join(', '),
      [s.current.postalCode, s.current.country].filter(Boolean).join(' ')
    ].filter(Boolean),
    receiptHeader: (s) => s.current.receiptHeader,
    receiptFooter: (s) => s.current.receiptFooter,
    tin: (s) => s.current.tin,
    isVatRegistered: (s) => s.current.vatRegistered,
    all: (s) => s.known,
    activeTenants: (s) => s.known.filter(t => (t.status ? t.status === 'active' : t.active !== false)),
    inactiveTenants: (s) => s.known.filter(t => (t.status ? t.status !== 'active' : t.active === false)),
    byId: (s) => (uuid) => s.known.find(t => t.uuid === uuid) || null,
    onPlan: (s) => (planId) => s.known.filter(t => t.planId === Number(planId))
  },
  actions: {
    // Sidebar mainNav → plan module key. Anything not in the map is a non-POS
    // surface (Products, Reports, Users, etc.) and stays universally available.
    // 'kitchen display' and 'kds pos' share the bundled 'kds' key.
    planAllowsMainNav(mainNav) {
      const nav = String(mainNav || '').trim().toLowerCase()
      const map = {
        'order pos':       'order_pos',
        'terminal pos':    'terminal_pos',
        'kds pos':         'kds',
        'kitchen display': 'kds'
      }
      const required = map[nav]
      if (!required) return true
      return this.planAllowedModules.includes(required)
    },
    update(patch) {
      this.current = { ...this.current, ...patch }
      persistCurrent(this.current)
      this.syncKnown(this.current)
    },
    setTenant(t) {
      this.current = { ...DEFAULT_TENANT, ...t }
      persistCurrent(this.current)
    },
    resetToDefaults() {
      this.current = { ...DEFAULT_TENANT }
      persistCurrent(this.current)
      this.syncKnown(this.current)
    },
    /* ── Super-admin CRUD over the tenants roster ── */
    createTenant(payload) {
      const t = {
        ...DEFAULT_TENANT,
        uuid: newUuid(),
        code: (payload.code || 'STORE').trim().toUpperCase(),
        name: (payload.name || 'New Tenant').trim(),
        legalName: (payload.legalName || '').trim(),
        email: (payload.email || '').trim(),
        phone: (payload.phone || '').trim(),
        address1: (payload.address1 || '').trim(),
        city: (payload.city || '').trim(),
        province: (payload.province || '').trim(),
        country: (payload.country || 'Philippines').trim(),
        planId: Number(payload.planId) || DEFAULT_TENANT.planId,
        billingCycle: payload.billingCycle || 'monthly',
        trialEndsAt: payload.trialEndsAt || null,
        active: payload.active !== false,
        createdAt: new Date().toISOString().slice(0, 10)
      }
      this.known.push(t)
      persistKnown(this.known)
      return t
    },
    updateTenant(uuid, patch) {
      const t = this.known.find(x => x.uuid === uuid)
      if (!t) return false
      Object.assign(t, patch)
      persistKnown(this.known)
      if (this.current.uuid === uuid) {
        this.current = { ...this.current, ...patch }
        persistCurrent(this.current)
      }
      return true
    },
    setTenantActive(uuid, active) {
      return this.updateTenant(uuid, { active: !!active })
    },
    setTenantPlan(uuid, planId) {
      return this.updateTenant(uuid, { planId: Number(planId) })
    },
    removeTenant(uuid) {
      if (uuid === this.current.uuid) return false
      const idx = this.known.findIndex(t => t.uuid === uuid)
      if (idx === -1) return false
      this.known.splice(idx, 1)
      persistKnown(this.known)
      return true
    },
    syncKnown(t) {
      const idx = this.known.findIndex(x => x.uuid === t.uuid)
      if (idx === -1) this.known.push({ ...t })
      else this.known[idx] = { ...this.known[idx], ...t }
      persistKnown(this.known)
    },
    // Populate `current` from the tenant summary embedded in the user-login response.
    // API shape: { uuid, store_code, display_name, currency }
    // The optional subscription object (data.subscription) carries the live
    // subscription snapshot — kept whole on current.subscription so the expiry
    // notification UIs can read is_active / is_near_expiry / days_remaining
    // directly.
    hydrateFromLogin(t, subscription) {
      if (!t?.uuid) return
      const patch = {
        uuid: t.uuid,
        code: t.store_code || this.current.code,
        name: t.display_name || this.current.name,
        currency: t.currency || this.current.currency,
        active: true
      }
      if (subscription && typeof subscription === 'object') {
        patch.subscription = { ...subscription }
        // Mirror the individual fields so pre-existing code paths still work.
        patch.current_subscription_plan_uuid           = subscription.plan_uuid           ?? null
        patch.current_subscription_days                = subscription.days_duration       ?? null
        patch.current_subscription_start               = subscription.start               ?? null
        patch.current_subscription_expiry              = subscription.expiry              ?? null
        patch.current_subscription_expiry_warning_days = subscription.warning_days        ?? null
        patch.current_subscription_plan_amount         = subscription.plan_amount         ?? 0
      }
      this.current = { ...DEFAULT_TENANT, ...this.current, ...patch }
      persistCurrent(this.current)
    },
    // Merge a full tenant record from the API into `current`, preserving any
    // local-only fields the API doesn't know about (printer config, currencySymbol).
    hydrateFromApi(t) {
      if (!t?.uuid) return
      const patch = {
        uuid: t.uuid,
        code:              t.store_code       ?? this.current.code,
        name:              t.display_name     ?? this.current.name,
        legalName:         t.legal_name       ?? '',
        ownerName:         t.owner_name       ?? '',
        branch:            t.branch           ?? '',
        terminalId:        t.terminal_id      ?? '',
        currency:          t.currency         ?? this.current.currency,
        logo:              t.company_logo     ?? '',
        address1:          t.address_street1  ?? '',
        address2:          t.address_street2  ?? '',
        city:              t.city             ?? '',
        province:          t.province         ?? '',
        postalCode:        t.postal_code      ?? '',
        country:           t.country          ?? '',
        phone:             t.contact_number   ?? '',
        email:             t.email_address    ?? '',
        website:           t.website          ?? '',
        tin:               t.tin_number       ?? '',
        vatRegistered:    parseBool(t.is_vat_registered),
        showTinOnReceipt: parseBool(t.show_tin_on_receipt),
        receiptHeader:     t.receipt_header   ?? '',
        receiptFooter:     t.receipt_footer   ?? '',
        showLogoOnReceipt:parseBool(t.receipt_show_logo),
        useCustomReceiptHeader: parseBool(t.receipt_use_custom_header),
        customReceiptHeader:    t.receipt_custom_header ?? '',
        useCustomReceiptFooter: parseBool(t.receipt_use_custom_footer),
        customReceiptFooter:    t.receipt_custom_footer ?? '',
        // Lab-report Result Header configuration (defaults to logo_text mode
        // so existing tenants render their existing logo + text automatically).
        labHeaderMode:     t.lab_header_mode  || 'logo_text',
        labHeaderImage:    t.lab_header_image || '',
        labHeaderText:     t.lab_header_text  || '',
        active: (t.status || '').toLowerCase() === 'active',
        // Subscription snapshot (cached from the latest approved payment on the API tenant record)
        current_subscription_plan_uuid:            t.current_subscription_plan_uuid            ?? null,
        current_subscription_days:                 t.current_subscription_days                 ?? null,
        current_subscription_start:                t.current_subscription_start                ?? null,
        current_subscription_expiry:               t.current_subscription_expiry               ?? null,
        current_subscription_expiry_warning_days:  t.current_subscription_expiry_warning_days  ?? null,
        current_subscription_plan_amount:          t.current_subscription_plan_amount          ?? 0
      }
      this.current = { ...DEFAULT_TENANT, ...this.current, ...patch }
      persistCurrent(this.current)
    },
    async loadCurrentFromApi() {
      if (!this.current?.uuid) return null
      const t = await tenantApi.viewTenant(this.current.uuid)
      if (t) this.hydrateFromApi(t)
      return t
    },
    async updateCurrentViaApi(apiPayload, file) {
      if (!this.current?.uuid) throw new Error('No tenant loaded')
      const updated = await tenantApi.updateTenant(this.current.uuid, apiPayload, file)
      if (updated) this.hydrateFromApi(updated)
      return updated
    },

    /* ─── Super-admin API-driven CRUD ─── */
    async fetchAllFromApi(filters = {}) {
      const res = await tenantApi.listTenants(filters)
      const items = Array.isArray(res?.results) ? res.results : []
      this.known = items
      persistKnown(this.known)
      return res
    },
    async createTenantViaApi(apiPayload, file) {
      const created = await tenantApi.createTenant(apiPayload, file)
      if (created?.uuid) {
        this.known.unshift(created)
        persistKnown(this.known)
      }
      return created
    },
    async updateTenantViaApi(uuid, apiPayload, file) {
      const updated = await tenantApi.updateTenant(uuid, apiPayload, file)
      if (updated?.uuid) {
        const idx = this.known.findIndex(t => t.uuid === uuid)
        if (idx >= 0) this.known[idx] = { ...this.known[idx], ...updated }
        else this.known.push(updated)
        persistKnown(this.known)
        // If the staff-side "current" happens to match, keep it in sync too.
        if (this.current?.uuid === uuid) this.hydrateFromApi(updated)
      }
      return updated
    },
    async setTenantStatusViaApi(uuid, status) {
      const updated = await tenantApi.setTenantStatus(uuid, status)
      if (updated?.uuid) {
        const idx = this.known.findIndex(t => t.uuid === uuid)
        if (idx >= 0) this.known[idx] = { ...this.known[idx], ...updated }
        persistKnown(this.known)
      }
      return updated
    },
    async alterTenantSubscriptionViaApi(uuid, payload) {
      const updated = await tenantApi.alterTenantSubscription(uuid, payload)
      if (updated?.uuid) {
        const idx = this.known.findIndex(t => t.uuid === uuid)
        if (idx >= 0) this.known[idx] = { ...this.known[idx], ...updated }
        persistKnown(this.known)
        if (this.current?.uuid === uuid) this.hydrateFromApi(updated)
      }
      return updated
    },
    async removeTenantViaApi(uuid) {
      await tenantApi.deleteTenant(uuid)
      this.known = this.known.filter(t => t.uuid !== uuid)
      persistKnown(this.known)
    }
  }
})
