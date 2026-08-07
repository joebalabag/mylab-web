#!/usr/bin/env node
/**
 * Capture all screenshots referenced by USER_MANUAL.md.
 *
 * Prereqs:
 *   - Vite dev server running at http://localhost:5173
 *   - NestJS API running at http://127.0.0.1:3010/api
 *   - Credentials: STAFF_USERNAME / STAFF_PASSWORD and
 *                  SUPER_USERNAME / SUPER_PASSWORD (env or the defaults below).
 *
 * Usage:
 *   node scripts/capture-screenshots.mjs
 */

import puppeteer from 'puppeteer'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const ROOT       = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'))
const SHOTS_DIR  = join(ROOT, 'docs', 'screenshots')

const BASE_URL   = process.env.APP_URL || 'http://localhost:5173'
const STAFF_USER = process.env.STAFF_USERNAME || 'cadmin'
const STAFF_PASS = process.env.STAFF_PASSWORD || 'admin123'
const SUPER_USER = process.env.SUPER_USERNAME || 'admin'
const SUPER_PASS = process.env.SUPER_PASSWORD || '123456'

const VIEWPORT = { width: 1440, height: 900, deviceScaleFactor: 1 }

await mkdir(SHOTS_DIR, { recursive: true })

const browser = await puppeteer.launch({
  headless: true,
  defaultViewport: VIEWPORT,
  args: ['--no-sandbox', '--disable-setuid-sandbox']
})

const captured = []
const failed = []

function log(name, note = '') {
  const stamp = new Date().toISOString().split('T')[1].slice(0, 8)
  console.log(`[${stamp}] ${name}${note ? ' — ' + note : ''}`)
}

async function shot(page, name, opts = {}) {
  const path = join(SHOTS_DIR, `${name}.png`)
  try {
    await page.screenshot({ path, fullPage: !!opts.fullPage, ...opts })
    captured.push(name + '.png')
    log('✓ ' + name)
  } catch (e) {
    failed.push({ name, err: e.message })
    log('✗ ' + name, e.message)
  }
}

async function newPage() {
  const p = await browser.newPage()
  await p.setViewport(VIEWPORT)
  p.setDefaultNavigationTimeout(20_000)
  p.setDefaultTimeout(15_000)
  return p
}

async function waitABit(page, ms = 500) {
  await new Promise((r) => setTimeout(r, ms))
}

async function safeClick(page, selector) {
  try {
    await page.waitForSelector(selector, { timeout: 5_000, visible: true })
    await page.click(selector)
    return true
  } catch {
    return false
  }
}

async function findAndClickByText(page, tag, text) {
  return await page.evaluate(({ tag, text }) => {
    const els = [...document.querySelectorAll(tag)]
    const target = els.find(e => (e.textContent || '').trim().toLowerCase().includes(text.toLowerCase()))
    if (target) { target.click(); return true }
    return false
  }, { tag, text })
}

async function loginStaff(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' })
  await page.waitForSelector('input[autocomplete="username"]')
  await page.type('input[autocomplete="username"]', STAFF_USER)
  await page.type('input[autocomplete="current-password"]', STAFF_PASS)
  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15_000 }).catch(() => {})
  ])
  await waitABit(page, 800)
}

async function loginSuper(page) {
  await page.goto(`${BASE_URL}/super/login`, { waitUntil: 'networkidle2' })
  await page.waitForSelector('input[autocomplete="username"]')
  await page.type('input[autocomplete="username"]', SUPER_USER)
  await page.type('input[autocomplete="current-password"]', SUPER_PASS)
  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15_000 }).catch(() => {})
  ])
  await waitABit(page, 800)
}

/* ─── Login-screen captures (fresh, no auth) ─── */
{
  const page = await newPage()
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' })
  await waitABit(page, 400)
  await shot(page, 'staff-login')
  await page.close()
}
{
  const page = await newPage()
  await page.goto(`${BASE_URL}/super/login`, { waitUntil: 'networkidle2' })
  await waitABit(page, 400)
  await shot(page, 'super-login')
  await page.close()
}

/* ─── Staff console ─── */
{
  const page = await newPage()
  await loginStaff(page)

  // Dashboard
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle2' })
  await waitABit(page, 700)
  await shot(page, 'staff-dashboard')

  // Order POS — empty
  await page.goto(`${BASE_URL}/cashier`, { waitUntil: 'networkidle2' })
  await waitABit(page, 700)
  await shot(page, 'staff-cashier-order-empty').catch(() => {})

  // Order POS — with cart (try to add first product from search)
  try {
    await page.keyboard.press('F3')
    await waitABit(page, 400)
    const searchInputExists = await page.$('input[placeholder*="Search"]') || await page.$('input[type="search"]')
    if (searchInputExists) {
      await page.keyboard.type('a')
      await waitABit(page, 400)
      await page.keyboard.press('Enter').catch(() => {})
      await waitABit(page, 400)
    }
  } catch { /* ignore */ }
  await shot(page, 'staff-cashier-order-with-cart')

  // Terminal POS
  await page.goto(`${BASE_URL}/cashier-v2`, { waitUntil: 'networkidle2' })
  await waitABit(page, 700)
  await shot(page, 'staff-cashier-terminal')

  // Held orders modal (Ctrl+L)
  try {
    await page.goto(`${BASE_URL}/cashier`, { waitUntil: 'networkidle2' })
    await waitABit(page, 700)
    await page.keyboard.down('Control'); await page.keyboard.press('KeyL'); await page.keyboard.up('Control')
    await waitABit(page, 500)
    await shot(page, 'staff-cashier-held')
    await page.keyboard.press('Escape')
    await waitABit(page, 300)
  } catch { /* ignore */ }

  // Products
  await page.goto(`${BASE_URL}/products`, { waitUntil: 'networkidle2' })
  await waitABit(page, 900)
  await shot(page, 'staff-products')

  // Products — Add modal
  try {
    await findAndClickByText(page, 'button', 'Add Product')
    await waitABit(page, 400)
    await shot(page, 'staff-products-add')
    await page.keyboard.press('Escape')
    await waitABit(page, 300)
  } catch { /* ignore */ }

  // Categories
  await page.goto(`${BASE_URL}/categories`, { waitUntil: 'networkidle2' })
  await waitABit(page, 700)
  await shot(page, 'staff-categories')

  // Generics
  await page.goto(`${BASE_URL}/generics`, { waitUntil: 'networkidle2' })
  await waitABit(page, 700)
  await shot(page, 'staff-generics')

  // Stock
  await page.goto(`${BASE_URL}/stock`, { waitUntil: 'networkidle2' })
  await waitABit(page, 700)
  await shot(page, 'staff-stock')

  // Discounts
  await page.goto(`${BASE_URL}/discounts`, { waitUntil: 'networkidle2' })
  await waitABit(page, 700)
  await shot(page, 'staff-discounts')

  // Reports
  await page.goto(`${BASE_URL}/reports`, { waitUntil: 'networkidle2' })
  await waitABit(page, 900)
  await shot(page, 'staff-reports')

  // User Management
  await page.goto(`${BASE_URL}/users`, { waitUntil: 'networkidle2' })
  await waitABit(page, 700)
  await shot(page, 'staff-users')

  // Add User modal
  try {
    await findAndClickByText(page, 'button', 'Add User')
    await waitABit(page, 400)
    await shot(page, 'staff-users-add')
    await page.keyboard.press('Escape')
    await waitABit(page, 300)
  } catch { /* ignore */ }

  // Store Settings
  await page.goto(`${BASE_URL}/settings/tenant`, { waitUntil: 'networkidle2' })
  await waitABit(page, 900)
  await shot(page, 'staff-store-settings')

  // Subscription — full page
  await page.goto(`${BASE_URL}/subscription`, { waitUntil: 'networkidle2' })
  await waitABit(page, 1200)
  await shot(page, 'tenant-subscription-status')
  await shot(page, 'tenant-subscription-picker', { fullPage: true })

  // Scroll to payment instructions section and capture
  try {
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('div,section')]
        .find(e => (e.textContent || '').includes('Payment Instructions'))
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' })
    })
    await waitABit(page, 400)
    await shot(page, 'tenant-subscription-instructions')
  } catch { /* ignore */ }

  // Scroll to submit form
  try {
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('div,section')]
        .find(e => (e.textContent || '').includes('Submit Payment'))
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' })
    })
    await waitABit(page, 400)
    await shot(page, 'tenant-subscription-submit')
  } catch { /* ignore */ }

  // Scroll to payment history
  try {
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('div,section')]
        .find(e => (e.textContent || '').includes('Payment history'))
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' })
    })
    await waitABit(page, 400)
    await shot(page, 'tenant-subscription-history')
    // Try clicking a View button to open the receipt modal
    const opened = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')]
      const view = btns.find(b => (b.textContent || '').trim() === 'View')
      if (view) { view.click(); return true }
      return false
    })
    if (opened) {
      await waitABit(page, 700)
      await shot(page, 'tenant-subscription-receipt-modal')
      await page.keyboard.press('Escape')
    }
  } catch { /* ignore */ }

  // Change password dialog (staff)
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle2' })
  await waitABit(page, 500)
  try {
    // Click user avatar
    await page.evaluate(() => {
      const menuBtn = document.querySelector('#user-menu button')
      if (menuBtn) menuBtn.click()
    })
    await waitABit(page, 300)
    const clicked = await findAndClickByText(page, 'button', 'Change password')
    if (clicked) {
      await waitABit(page, 400)
      await shot(page, 'staff-change-password')
      await page.keyboard.press('Escape')
    }
  } catch { /* ignore */ }

  await page.close()
}

/* ─── Super admin console ─── */
{
  const page = await newPage()
  await loginSuper(page)

  // Dashboard
  await page.goto(`${BASE_URL}/super/dashboard`, { waitUntil: 'networkidle2' })
  await waitABit(page, 900)
  await shot(page, 'super-dashboard')

  // Tenants
  await page.goto(`${BASE_URL}/super/tenants`, { waitUntil: 'networkidle2' })
  await waitABit(page, 900)
  await shot(page, 'super-tenants')

  // New Tenant modal
  try {
    await findAndClickByText(page, 'button', 'New Tenant')
    await waitABit(page, 500)
    await shot(page, 'super-tenants-new')
    await page.keyboard.press('Escape')
    await waitABit(page, 300)
  } catch { /* ignore */ }

  // Subscription Plans
  await page.goto(`${BASE_URL}/super/plans`, { waitUntil: 'networkidle2' })
  await waitABit(page, 900)
  await shot(page, 'super-plans')

  // New Plan modal
  try {
    await findAndClickByText(page, 'button', 'New Plan')
    await waitABit(page, 500)
    await shot(page, 'super-plans-new')
    await page.keyboard.press('Escape')
    await waitABit(page, 300)
  } catch { /* ignore */ }

  // Super admin users
  await page.goto(`${BASE_URL}/super/users`, { waitUntil: 'networkidle2' })
  await waitABit(page, 700)
  await shot(page, 'super-users')

  // New user modal
  try {
    await findAndClickByText(page, 'button', 'New User')
    await waitABit(page, 400)
    await shot(page, 'super-users-new')
    await page.keyboard.press('Escape')
    await waitABit(page, 300)
  } catch { /* ignore */ }

  // Change password dialog (super)
  try {
    // Click avatar in super topbar
    await page.evaluate(() => {
      const menuBtn = document.querySelector('#super-user-menu button')
      if (menuBtn) menuBtn.click()
    })
    await waitABit(page, 300)
    const clicked = await findAndClickByText(page, 'button', 'Change password')
    if (clicked) {
      await waitABit(page, 400)
      await shot(page, 'super-change-password')
      await page.keyboard.press('Escape')
    }
  } catch { /* ignore */ }

  await page.close()
}

await browser.close()

console.log('')
console.log(`Captured ${captured.length} screenshots into ${SHOTS_DIR}`)
if (failed.length) {
  console.log(`Failed (${failed.length}):`)
  for (const f of failed) console.log(`  - ${f.name}: ${f.err}`)
}
