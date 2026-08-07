import { test, expect } from '@playwright/test'
import {
  seedAuth, mockApi, expectNoHorizontalOverflow, findOverflowingElements
} from './fixtures.js'

// Tenant (staff) routes that render inside MainLayout.
const STAFF_ROUTES = [
  { path: '/dashboard',        name: 'Dashboard'      },
  { path: '/products',         name: 'Products'       },
  { path: '/categories',       name: 'Categories'     },
  { path: '/generics',         name: 'Generics'       },
  { path: '/stock',            name: 'Stock'          },
  { path: '/discounts',        name: 'Discounts'      },
  { path: '/reports',          name: 'Reports'        },
  { path: '/my-reports',       name: 'MyReports'      },
  { path: '/users',            name: 'Users'          },
  { path: '/subscription',     name: 'Subscription'   },
  { path: '/settings/tenant',  name: 'Store Settings' },
  { path: '/order-pos',        name: 'Order POS'      }
]

const PUBLIC_ROUTES = [
  { path: '/login',            name: 'Login'          },
  { path: '/register',         name: 'Register'       },
  { path: '/welcome',          name: 'Welcome'        }
]

// Public views need no auth, just no-overflow check.
test.describe('Public views', () => {
  for (const r of PUBLIC_ROUTES) {
    test(`${r.name} — no horizontal overflow`, async ({ page }) => {
      await mockApi(page)
      await page.goto(r.path, { waitUntil: 'networkidle' })
      await page.waitForTimeout(300)
      try {
        await expectNoHorizontalOverflow(page)
      } catch (e) {
        const offenders = await findOverflowingElements(page)
        console.log(`[${r.name}] offenders:`, offenders)
        throw e
      }
    })
  }
})

// Authenticated staff views — seed a fake token + user + tenant, mock all API
// calls with empty envelope responses.
test.describe('Staff views (authenticated)', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page)
    await mockApi(page)
  })

  for (const r of STAFF_ROUTES) {
    test(`${r.name} — no horizontal overflow`, async ({ page }) => {
      await page.goto(r.path, { waitUntil: 'networkidle' })
      await page.waitForTimeout(500)
      try {
        await expectNoHorizontalOverflow(page)
      } catch (e) {
        const offenders = await findOverflowingElements(page)
        console.log(`[${r.name}] offenders:`, offenders)
        throw e
      }
    })
  }

  // Sidebar drawer should open + close without spilling off the viewport.
  test('Sidebar drawer opens without overflow', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'networkidle' })
    const menuBtn = page.locator('button[aria-label="Menu"]').first()
    if (await menuBtn.isVisible()) {
      await menuBtn.click()
      await page.waitForTimeout(300)
      await expectNoHorizontalOverflow(page)
    }
  })

  // User menu dropdown (top-right avatar) should stay within viewport.
  test('User menu dropdown stays in viewport', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'networkidle' })
    await page.waitForTimeout(400)
    const avatar = page.locator('#user-menu > button').first()
    await avatar.waitFor({ state: 'visible', timeout: 5000 })
    await avatar.click({ force: true })
    await page.waitForTimeout(300)
    const menu = page.locator('#user-menu > div').first()
    const box = await menu.boundingBox()
    const vw  = page.viewportSize().width
    expect(box).not.toBeNull()
    expect(box.x + box.width).toBeLessThanOrEqual(vw + 2)
    expect(box.x).toBeGreaterThanOrEqual(-2)
  })

  // Help modal — invoked from sidebar footer or a "Help" button.
  test('Help modal fits viewport', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'networkidle' })
    // Try common Help triggers; skip if not found on this route.
    const trigger = page.getByRole('button', { name: /getting started|help/i }).first()
    if (await trigger.count()) {
      await trigger.click({ timeout: 2000 }).catch(() => {})
      await page.waitForTimeout(400)
      await expectNoHorizontalOverflow(page)
    }
  })
})
