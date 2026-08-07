// Shared test helpers: seed fake auth, mock the /api backend, assert no
// horizontal overflow. Kept in one file so the specs stay short.

const MAIN_NAVS = [
  'user management', 'store settings', 'subscription', 'categories',
  'generics', 'products', 'stocks', 'discounts', 'order pos',
  'terminal pos', 'reports', 'myreports'
]

// Fake login response the app persists after a real login.
export const FAKE_USER = {
  uuid: 'test-user-uuid',
  username: 'testuser',
  name: 'Test User',
  email: 'test@example.com',
  role: 'admin',
  tenant_uuid: '00000000-0000-4000-8000-000000000001',
  type: 'user',
  last_logindate: '2026-07-05',
  access: MAIN_NAVS.flatMap((mn, i) => [
    { navigation_id: i * 10 + 1, main_navigation: mn, sub_navigation: 'view',   has_access: true },
    { navigation_id: i * 10 + 2, main_navigation: mn, sub_navigation: 'add',    has_access: true },
    { navigation_id: i * 10 + 3, main_navigation: mn, sub_navigation: 'edit',   has_access: true },
    { navigation_id: i * 10 + 4, main_navigation: mn, sub_navigation: 'delete', has_access: true }
  ])
}

export const FAKE_TENANT = {
  uuid: '00000000-0000-4000-8000-000000000001',
  code: 'MAIN',
  name: 'Test Store',
  currency: 'PHP',
  currencySymbol: '₱',
  address1: '123 Test St', city: 'Manila', province: 'NCR', country: 'Philippines',
  subscription: {
    plan_uuid: 'plan-1', plan_name: 'STARTER', plan_amount: 500,
    start: '2026-06-01', expiry: '2026-08-01',
    days_duration: 30, days_remaining: 27, warning_days: 7,
    is_active: true, is_near_expiry: false
  }
}

export const FAKE_SUPER_ADMIN = {
  uuid: 'super-admin-uuid',
  username: 'superadmin',
  name: 'Super Admin',
  role: 'super_admin'
}

// Seed localStorage BEFORE the page loads so the auth store boots authenticated.
export async function seedAuth(page, { superAdmin = false } = {}) {
  await page.addInitScript(({ user, tenant, superUser, superAdmin }) => {
    if (superAdmin) {
      localStorage.setItem('super_token', 'fake-super-token')
      localStorage.setItem('super_user', JSON.stringify(superUser))
    } else {
      localStorage.setItem('pos_token', 'fake-token')
      localStorage.setItem('pos_user', JSON.stringify(user))
      localStorage.setItem('pos_tenant', JSON.stringify(tenant))
      localStorage.setItem('pos_tenants', JSON.stringify([tenant]))
    }
  }, { user: FAKE_USER, tenant: FAKE_TENANT, superUser: FAKE_SUPER_ADMIN, superAdmin })
}

// Intercept API requests to the backend host (127.0.0.1:3010) and return
// empty-envelope responses so the app renders without a real backend. We must
// NOT intercept 127.0.0.1:5173/src/api/**.js — those are Vite module imports,
// and returning JSON for them breaks the Vue mount.
export async function mockApi(page) {
  await page.route((url) => {
    // Match the API host only, not the dev server's static /src/api/*.js modules.
    return /^https?:\/\/(127\.0\.0\.1:3010|localhost:3010|api-mycart\.edgetechph\.net)\//.test(url.toString())
  }, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname

    // Default envelope — an empty list or object depending on path shape.
    let response = null
    if (/\/(dashboard|list|history|movement|for-tenant|for-user)/.test(path)) {
      response = { results: [], total: 0, page_number: 0, page_size: 0 }
    } else if (/\/view\//.test(path)) {
      response = {}
    } else {
      response = null
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        response,
        message: 'ok',
        status: 'success'
      })
    })
  })
}

// Assert the page doesn't scroll horizontally. Extra 2px tolerance for
// sub-pixel rounding on some Windows/Chromium builds.
export async function expectNoHorizontalOverflow(page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }))
  if (scrollWidth > clientWidth + 2) {
    throw new Error(`Horizontal overflow: scrollWidth=${scrollWidth} > clientWidth=${clientWidth}`)
  }
}

// Find elements that overflow the viewport horizontally. Useful for pinpointing
// which element is at fault when expectNoHorizontalOverflow fails.
// Returns the DEEPEST offenders — leaf-most elements are the root cause,
// their overflowing ancestors are just carrying the child overflow up.
export async function findOverflowingElements(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const all = []
    document.querySelectorAll('body *').forEach((el) => {
      const rect = el.getBoundingClientRect()
      if (rect.right > vw + 2 && rect.width > 10) {
        all.push({ el, rect, depth: 0 })
      }
    })
    // Compute depth to prefer leaf offenders.
    all.forEach((rec) => {
      let d = 0, cur = rec.el
      while (cur.parentElement) { d++; cur = cur.parentElement }
      rec.depth = d
    })
    // Filter out ancestors whose child is also an offender.
    const offSet = new Set(all.map((r) => r.el))
    const leaves = all.filter((rec) => {
      for (const child of rec.el.children) if (offSet.has(child)) return false
      return true
    })
    return leaves.slice(0, 6).map((rec) => ({
      tag: rec.el.tagName.toLowerCase(),
      id: rec.el.id || '',
      cls: (rec.el.className || '').toString().slice(0, 100),
      text: (rec.el.innerText || '').slice(0, 60),
      right: Math.round(rec.rect.right),
      width: Math.round(rec.rect.width)
    }))
  })
}
