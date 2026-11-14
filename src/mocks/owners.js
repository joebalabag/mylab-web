/**
 * Phase 1 mock data for the Owner UI. Remove once backend endpoints
 * (/owner/*) are wired. Every Owner view imports from here while the UI
 * is being iterated on; the swap to real API happens as one diff per view
 * (see docs/superpowers/specs/2026-11-09-multi-tenant-print-design.md).
 */

export const USE_MOCKS = true

export const MOCK_OWNERS = [
  {
    uuid: 'own-0001-alpha',
    name: 'Juan Dela Cruz',
    business_name: 'Alpha Diagnostics Group',
    email: 'juan@alphadiag.ph',
    phone: '+63 917 555 0101',
    status: 'active',
    tenant_count: 3,
    last_logindate: '2026-11-08 09:14:00',
    created_by: 'super-admin',
    created_at: '2026-06-02 10:00:00'
  },
  {
    uuid: 'own-0002-beta',
    name: 'Maria Santos',
    business_name: 'Beta Lab Network',
    email: 'maria@betalab.ph',
    phone: '+63 920 555 0202',
    status: 'active',
    tenant_count: 2,
    last_logindate: '2026-11-07 15:40:00',
    created_by: 'super-admin',
    created_at: '2026-07-18 14:22:00'
  },
  {
    uuid: 'own-0003-gamma',
    name: 'Reynaldo Lim',
    business_name: 'Gamma Medical Services',
    email: 'rey@gammamed.ph',
    phone: '+63 905 555 0303',
    status: 'active',
    tenant_count: 5,
    last_logindate: '2026-11-09 07:02:00',
    created_by: 'super-admin',
    created_at: '2026-04-11 09:00:00'
  },
  {
    uuid: 'own-0004-delta',
    name: 'Angela Reyes',
    business_name: 'Delta Health Branches',
    email: 'angela@deltahealth.ph',
    phone: '+63 927 555 0404',
    status: 'inactive',
    tenant_count: 1,
    last_logindate: '2026-09-02 11:30:00',
    created_by: 'super-admin',
    created_at: '2026-02-20 08:00:00'
  },
  {
    uuid: 'own-0005-echo',
    name: 'Carlos Mendoza',
    business_name: 'Echo Laboratory Co.',
    email: 'carlos@echolab.ph',
    phone: '+63 916 555 0505',
    status: 'active',
    tenant_count: 0,
    last_logindate: null,
    created_by: 'public-registration',
    created_at: '2026-11-01 16:45:00'
  }
]

// Tenants grouped by owner_uuid — used by SuperOwnerDetailsView's
// "Assigned Tenants" panel and by SuperTenantsView's Owner column
// (reverse lookup: tenant_uuid → owner).
export const MOCK_OWNER_TENANTS = {
  'own-0001-alpha': [
    { tenant_uuid: 't-a-main',   display_name: 'Alpha Main Branch',   store_code: 'ALP', branch: 'Makati',    status: 'active' },
    { tenant_uuid: 't-a-south',  display_name: 'Alpha Southbranch',   store_code: 'ALP', branch: 'Alabang',   status: 'active' },
    { tenant_uuid: 't-a-north',  display_name: 'Alpha Northbranch',   store_code: 'ALP', branch: 'Quezon',    status: 'inactive' }
  ],
  'own-0002-beta': [
    { tenant_uuid: 't-b-main',   display_name: 'Beta Flagship',       store_code: 'BET', branch: 'Cebu',      status: 'active' },
    { tenant_uuid: 't-b-aux',    display_name: 'Beta Aux Clinic',     store_code: 'BET', branch: 'Mandaue',   status: 'active' }
  ],
  'own-0003-gamma': [
    { tenant_uuid: 't-g-01', display_name: 'Gamma Branch 01',         store_code: 'GAM', branch: 'Pasig',     status: 'active' },
    { tenant_uuid: 't-g-02', display_name: 'Gamma Branch 02',         store_code: 'GAM', branch: 'Taguig',    status: 'active' },
    { tenant_uuid: 't-g-03', display_name: 'Gamma Branch 03',         store_code: 'GAM', branch: 'Parañaque', status: 'active' },
    { tenant_uuid: 't-g-04', display_name: 'Gamma Branch 04',         store_code: 'GAM', branch: 'Las Piñas', status: 'inactive' },
    { tenant_uuid: 't-g-05', display_name: 'Gamma Branch 05',         store_code: 'GAM', branch: 'Muntinlupa', status: 'active' }
  ],
  'own-0004-delta': [
    { tenant_uuid: 't-d-main',   display_name: 'Delta Health Hub',    store_code: 'DEL', branch: 'Davao',     status: 'active' }
  ],
  'own-0005-echo': []
}

// Tenants that exist but aren't assigned to any owner — populates the
// "Assign Tenant" dropdown in SuperOwnerDetailsView.
export const MOCK_UNASSIGNED_TENANTS = [
  { tenant_uuid: 't-x-01', display_name: 'Unassigned Lab Iloilo',     store_code: 'ILO', branch: 'Iloilo City', status: 'active' },
  { tenant_uuid: 't-x-02', display_name: 'Unassigned Clinic Bacolod', store_code: 'BAC', branch: 'Bacolod',     status: 'active' },
  { tenant_uuid: 't-x-03', display_name: 'Unassigned Diag Baguio',    store_code: 'BAG', branch: 'Baguio',      status: 'inactive' }
]

export function findOwner(uuid) {
  return MOCK_OWNERS.find(o => o.uuid === uuid) || null
}

export function tenantsForOwner(uuid) {
  return MOCK_OWNER_TENANTS[uuid] || []
}

/* ─────────── Phase 2 — Owner app mocks ─────────── */

// Default mock credentials for the Owner login screen. The field renders a
// hint pointing to these values while USE_MOCKS is true.
export const MOCK_OWNER_CREDENTIALS = {
  username: 'juan',           // email also works
  email:    'juan@alphadiag.ph',
  password: 'owner123',
  owner_uuid: 'own-0001-alpha'
}

// Per-tenant dashboard snapshots used by OwnerDashboardView + OwnerTenantReportsView.
// Keyed by tenant_uuid so a single owner that owns multiple tenants gets
// different numbers in each row.
export const MOCK_TENANT_METRICS = {
  't-a-main':  { active_users: 12, today_tests: 34, mtd_revenue: 184250, pending_requisitions: 7,  last_result_at: '2026-11-09 08:40:00' },
  't-a-south': { active_users: 7,  today_tests: 18, mtd_revenue: 92400,  pending_requisitions: 3,  last_result_at: '2026-11-09 07:15:00' },
  't-a-north': { active_users: 4,  today_tests: 0,  mtd_revenue: 0,      pending_requisitions: 0,  last_result_at: null              },
  't-b-main':  { active_users: 9,  today_tests: 22, mtd_revenue: 137600, pending_requisitions: 5,  last_result_at: '2026-11-09 09:02:00' },
  't-b-aux':   { active_users: 3,  today_tests: 11, mtd_revenue: 63800,  pending_requisitions: 2,  last_result_at: '2026-11-08 17:40:00' },
  't-g-01':    { active_users: 8,  today_tests: 25, mtd_revenue: 144200, pending_requisitions: 4,  last_result_at: '2026-11-09 09:05:00' },
  't-g-02':    { active_users: 6,  today_tests: 19, mtd_revenue: 101800, pending_requisitions: 3,  last_result_at: '2026-11-09 08:55:00' },
  't-g-03':    { active_users: 5,  today_tests: 14, mtd_revenue: 77500,  pending_requisitions: 2,  last_result_at: '2026-11-09 08:30:00' },
  't-g-04':    { active_users: 2,  today_tests: 0,  mtd_revenue: 0,      pending_requisitions: 0,  last_result_at: null              },
  't-g-05':    { active_users: 4,  today_tests: 9,  mtd_revenue: 54200,  pending_requisitions: 1,  last_result_at: '2026-11-09 07:50:00' },
  't-d-main':  { active_users: 11, today_tests: 28, mtd_revenue: 162900, pending_requisitions: 6,  last_result_at: '2026-11-09 09:10:00' }
}

// Users across owner's tenants — OwnerUsersView lists these with a Tenant column.
export const MOCK_TENANT_USERS = [
  { uuid: 'u-001', tenant_uuid: 't-a-main',  username: 'alpha.admin', name: 'Alpha Admin',       email: 'admin@alpha.ph',       role: 'manager', status: 'active',   last_logindate: '2026-11-09 08:00:00' },
  { uuid: 'u-002', tenant_uuid: 't-a-main',  username: 'alpha.cashier', name: 'Alpha Cashier',   email: 'cashier@alpha.ph',     role: 'cashier', status: 'active',   last_logindate: '2026-11-09 08:15:00' },
  { uuid: 'u-003', tenant_uuid: 't-a-main',  username: 'alpha.medtech', name: 'Alpha Med-Tech',  email: 'medtech@alpha.ph',     role: 'medtech', status: 'active',   last_logindate: '2026-11-09 08:30:00' },
  { uuid: 'u-004', tenant_uuid: 't-a-south', username: 'south.admin',   name: 'South Admin',     email: 'south-admin@alpha.ph', role: 'manager', status: 'active',   last_logindate: '2026-11-08 17:20:00' },
  { uuid: 'u-005', tenant_uuid: 't-a-south', username: 'south.tech',    name: 'South Tech',      email: 'south-tech@alpha.ph',  role: 'medtech', status: 'inactive', last_logindate: '2026-10-28 10:00:00' },
  { uuid: 'u-006', tenant_uuid: 't-a-north', username: 'north.admin',   name: 'North Admin',     email: 'north-admin@alpha.ph', role: 'manager', status: 'active',   last_logindate: '2026-11-07 09:00:00' },
  { uuid: 'u-007', tenant_uuid: 't-b-main',  username: 'beta.admin',    name: 'Beta Admin',      email: 'admin@beta.ph',        role: 'manager', status: 'active',   last_logindate: '2026-11-09 07:40:00' },
  { uuid: 'u-008', tenant_uuid: 't-b-aux',   username: 'beta.aux.tech', name: 'Beta Aux Tech',   email: 'aux-tech@beta.ph',     role: 'medtech', status: 'active',   last_logindate: '2026-11-08 16:30:00' }
]

// Catalog items across tenants — OwnerCatalogView browses per tenant,
// OwnerPriceComparisonView pivots by item_code.
// item_group is the higher-level bucket ("Chemistry"); category is the
// finer sub-section ("Clinical Chem"). Prices are per-tenant and editable
// from the comparison view.
export const MOCK_CATALOG = [
  // Alpha Main
  { tenant_uuid: 't-a-main', item_code: 'CBC',    name: 'Complete Blood Count',      item_group: 'Blood Work', category: 'Hematology',     price: 350.00, status: 'active' },
  { tenant_uuid: 't-a-main', item_code: 'URINAL', name: 'Urinalysis',                item_group: 'Chemistry',  category: 'Clinical Chem',  price: 180.00, status: 'active' },
  { tenant_uuid: 't-a-main', item_code: 'FBS',    name: 'Fasting Blood Sugar',       item_group: 'Chemistry',  category: 'Clinical Chem',  price: 150.00, status: 'active' },
  { tenant_uuid: 't-a-main', item_code: 'LIPID',  name: 'Lipid Profile',             item_group: 'Chemistry',  category: 'Clinical Chem',  price: 850.00, status: 'active' },
  { tenant_uuid: 't-a-main', item_code: 'CREA',   name: 'Creatinine',                item_group: 'Chemistry',  category: 'Clinical Chem',  price: 200.00, status: 'active' },

  // Alpha South
  { tenant_uuid: 't-a-south', item_code: 'CBC',    name: 'Complete Blood Count',     item_group: 'Blood Work', category: 'Hematology',     price: 320.00, status: 'active' },
  { tenant_uuid: 't-a-south', item_code: 'URINAL', name: 'Urinalysis',               item_group: 'Chemistry',  category: 'Clinical Chem',  price: 180.00, status: 'active' },
  { tenant_uuid: 't-a-south', item_code: 'FBS',    name: 'FBS (Sugar)',              item_group: 'Chemistry',  category: 'Clinical Chem',  price: 140.00, status: 'active' },
  { tenant_uuid: 't-a-south', item_code: 'LIPID',  name: 'Lipid Profile',            item_group: 'Chemistry',  category: 'Clinical Chem',  price: 820.00, status: 'active' },

  // Alpha North
  { tenant_uuid: 't-a-north', item_code: 'CBC',    name: 'Complete Blood Count',     item_group: 'Blood Work', category: 'Hematology',     price: 400.00, status: 'active' },
  { tenant_uuid: 't-a-north', item_code: 'URINAL', name: 'Urinalysis',               item_group: 'Chemistry',  category: 'Clinical Chem',  price: 200.00, status: 'active' },
  { tenant_uuid: 't-a-north', item_code: 'HBA1C',  name: 'HbA1c',                    item_group: 'Hormones',   category: 'Endocrinology',  price: 650.00, status: 'active' },

  // Beta Main
  { tenant_uuid: 't-b-main', item_code: 'CBC',     name: 'CBC',                      item_group: 'Blood Work', category: 'Hematology',     price: 300.00, status: 'active' },
  { tenant_uuid: 't-b-main', item_code: 'URINAL',  name: 'Urinalysis',               item_group: 'Chemistry',  category: 'Clinical Chem',  price: 150.00, status: 'active' },
  { tenant_uuid: 't-b-main', item_code: 'TSH',     name: 'Thyroid Stimulating Hormone', item_group: 'Hormones', category: 'Endocrinology', price: 950.00, status: 'active' }
]

// Keyed by metric to give the dashboard its headline numbers cheaply.
export function summaryForOwner(owner_uuid) {
  const list = (MOCK_OWNER_TENANTS[owner_uuid] || [])
  let active_users = 0, today_tests = 0, mtd_revenue = 0, pending_requisitions = 0
  for (const t of list) {
    const m = MOCK_TENANT_METRICS[t.tenant_uuid]
    if (!m) continue
    active_users         += m.active_users
    today_tests          += m.today_tests
    mtd_revenue          += m.mtd_revenue
    pending_requisitions += m.pending_requisitions
  }
  return { tenant_count: list.length, active_users, today_tests, mtd_revenue, pending_requisitions }
}

// Pivot catalog for OwnerPriceComparisonView: rows=item_code, cols=tenant.
export function priceComparisonForOwner(owner_uuid) {
  const tenantList = (MOCK_OWNER_TENANTS[owner_uuid] || [])
  const tenantUuids = tenantList.map(t => t.tenant_uuid)
  const rowsByCode = new Map()
  for (const item of MOCK_CATALOG) {
    if (!tenantUuids.includes(item.tenant_uuid)) continue
    const row = rowsByCode.get(item.item_code) || {
      item_code: item.item_code,
      name: item.name,
      item_group: item.item_group,
      category: item.category,
      prices: {}
    }
    row.prices[item.tenant_uuid] = item.price
    // Prefer the longest display name across tenants
    if (!row.name || (item.name && item.name.length > row.name.length)) row.name = item.name
    // Keep the first non-empty group/category we see (most tenants agree)
    if (!row.item_group && item.item_group) row.item_group = item.item_group
    if (!row.category   && item.category)   row.category   = item.category
    rowsByCode.set(item.item_code, row)
  }
  const rows = Array.from(rowsByCode.values()).sort((a, b) => a.item_code.localeCompare(b.item_code))
  // Tag whether row has at least one divergent price (useful to highlight)
  for (const r of rows) {
    const vals = Object.values(r.prices).filter(v => v != null)
    r.min = vals.length ? Math.min(...vals) : null
    r.max = vals.length ? Math.max(...vals) : null
    r.has_gap = r.min != null && r.max != null && r.max - r.min > 0.0001
  }
  return { tenants: tenantList, rows }
}

/* ─────────── Phase 3 — Lab app branch search ─────────── */

// For the lab-app Phase 3 preview we pretend the staff user is logged in
// to Alpha Main. In real mode this is the caller's JWT tenant_uuid.
export const MOCK_LAB_HOME_TENANT_UUID = 't-a-main'

// Finalized lab reports visible across branches of the same owner. Only
// status='FINAL' rows are searchable cross-branch — mirrors the Phase 3
// spec rule.
export const MOCK_LAB_REPORTS = [
  // Alpha South (branch of Alpha Main)
  { uuid: 'lr-as-001', tenant_uuid: 't-a-south', lab_number: 'ALP-2026-00912', patient_first: 'Ana',    patient_middle: 'G', patient_last: 'Reyes',    item_code: 'CBC',    test_name: 'Complete Blood Count',  finalized_at: '2026-11-08 09:40:00', status: 'FINAL', pathologist: 'Dr. Dela Cruz' },
  { uuid: 'lr-as-002', tenant_uuid: 't-a-south', lab_number: 'ALP-2026-00913', patient_first: 'Ana',    patient_middle: 'G', patient_last: 'Reyes',    item_code: 'URINAL', test_name: 'Urinalysis',            finalized_at: '2026-11-08 09:42:00', status: 'FINAL', pathologist: 'Dr. Dela Cruz' },
  { uuid: 'lr-as-003', tenant_uuid: 't-a-south', lab_number: 'ALP-2026-00921', patient_first: 'Mark',   patient_middle: '',  patient_last: 'Dizon',    item_code: 'FBS',    test_name: 'FBS (Sugar)',           finalized_at: '2026-11-07 16:10:00', status: 'FINAL', pathologist: 'Dr. Dela Cruz' },
  { uuid: 'lr-as-004', tenant_uuid: 't-a-south', lab_number: 'ALP-2026-00934', patient_first: 'Jessa',  patient_middle: 'M', patient_last: 'Valdez',   item_code: 'LIPID',  test_name: 'Lipid Profile',         finalized_at: '2026-11-06 11:05:00', status: 'FINAL', pathologist: 'Dr. Mendoza'  },

  // Alpha North (branch of Alpha Main)
  { uuid: 'lr-an-001', tenant_uuid: 't-a-north', lab_number: 'ALP-2026-00410', patient_first: 'Ricardo', patient_middle: 'L', patient_last: 'Cruz',    item_code: 'HBA1C',  test_name: 'HbA1c',                 finalized_at: '2026-11-08 08:20:00', status: 'FINAL', pathologist: 'Dr. Lim'      },
  { uuid: 'lr-an-002', tenant_uuid: 't-a-north', lab_number: 'ALP-2026-00411', patient_first: 'Ricardo', patient_middle: 'L', patient_last: 'Cruz',    item_code: 'CBC',    test_name: 'Complete Blood Count',  finalized_at: '2026-11-08 08:22:00', status: 'FINAL', pathologist: 'Dr. Lim'      },
  { uuid: 'lr-an-003', tenant_uuid: 't-a-north', lab_number: 'ALP-2026-00417', patient_first: 'Maria',   patient_middle: '',  patient_last: 'Santos',  item_code: 'URINAL', test_name: 'Urinalysis',            finalized_at: '2026-11-07 14:35:00', status: 'FINAL', pathologist: 'Dr. Lim'      },

  // Alpha Main (home — filtered out of cross-branch results)
  { uuid: 'lr-am-001', tenant_uuid: 't-a-main',  lab_number: 'ALP-2026-01250', patient_first: 'Juan',    patient_middle: '',  patient_last: 'Dela Cruz',item_code: 'CBC',    test_name: 'Complete Blood Count',  finalized_at: '2026-11-09 08:00:00', status: 'FINAL', pathologist: 'Dr. Dela Cruz' }
]

// Resolve the branches of a given home tenant: all other tenants that
// share an owner_uuid, with the home tenant itself removed. Returns [] when
// the home tenant has no owner (no cross-branch visibility in that case).
export function branchesForHome(home_tenant_uuid) {
  for (const [owner_uuid, list] of Object.entries(MOCK_OWNER_TENANTS)) {
    const has = (list || []).some(t => t.tenant_uuid === home_tenant_uuid)
    if (!has) continue
    return (list || []).filter(t => t.tenant_uuid !== home_tenant_uuid).map(t => ({ ...t, owner_uuid }))
  }
  return []
}

// Search finalized lab reports across branches. The backend endpoint
// is GET /lab-report/cross-tenant-search in Phase 3.7 — same filters, same
// FINAL-only rule, same tenant-scope check.
export function searchBranchLabReports(home_tenant_uuid, { tenant_uuid, keywords, date_from, date_to } = {}) {
  const branches = branchesForHome(home_tenant_uuid)
  const branchSet = new Set(branches.map(t => t.tenant_uuid))
  const term = (keywords || '').trim().toLowerCase()
  const fromTs = date_from ? Date.parse(date_from + 'T00:00:00') : null
  const toTs   = date_to   ? Date.parse(date_to   + 'T23:59:59') : null
  return MOCK_LAB_REPORTS
    .filter(r => r.status === 'FINAL')
    .filter(r => branchSet.has(r.tenant_uuid))
    .filter(r => !tenant_uuid || r.tenant_uuid === tenant_uuid)
    .filter(r => {
      if (!fromTs && !toTs) return true
      const ts = Date.parse(String(r.finalized_at).replace(' ', 'T'))
      if (fromTs && ts < fromTs) return false
      if (toTs   && ts > toTs)   return false
      return true
    })
    .filter(r => {
      if (!term) return true
      return (
        r.lab_number.toLowerCase().includes(term) ||
        `${r.patient_first} ${r.patient_middle} ${r.patient_last}`.toLowerCase().includes(term) ||
        r.patient_first.toLowerCase().includes(term) ||
        r.patient_last.toLowerCase().includes(term)
      )
    })
    .map(r => ({
      ...r,
      patient_name: [r.patient_last, r.patient_first + (r.patient_middle ? ' ' + r.patient_middle + '.' : '')].filter(Boolean).join(', '),
      tenant: branches.find(t => t.tenant_uuid === r.tenant_uuid) || null
    }))
    .sort((a, b) => String(b.finalized_at).localeCompare(String(a.finalized_at)))
}

// Apply a price-edit from the comparison modal back to MOCK_CATALOG so
// subsequent re-renders reflect the change. Returns the number of rows
// mutated. In real mode this call lands on
// PATCH /owner/catalog/:item_code/prices with a per-tenant price map.
export function applyPriceEdits(item_code, pricesByTenant) {
  let touched = 0
  for (const [tenant_uuid, newPrice] of Object.entries(pricesByTenant)) {
    if (newPrice == null || newPrice === '') continue
    const entry = MOCK_CATALOG.find(i => i.item_code === item_code && i.tenant_uuid === tenant_uuid)
    const num = Number(newPrice)
    if (!Number.isFinite(num) || num < 0) continue
    if (entry) {
      if (Math.abs((entry.price || 0) - num) > 0.0001) {
        entry.price = num
        touched++
      }
    } else {
      // Tenant didn't offer this item before — add a new catalog entry
      // using the first known row for group/category/name/status.
      const seed = MOCK_CATALOG.find(i => i.item_code === item_code)
      MOCK_CATALOG.push({
        tenant_uuid,
        item_code,
        name:       seed?.name       || item_code,
        item_group: seed?.item_group || '',
        category:   seed?.category   || '',
        price:      num,
        status:     'active'
      })
      touched++
    }
  }
  return touched
}
