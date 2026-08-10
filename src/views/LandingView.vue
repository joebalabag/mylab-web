<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import MyLabLogo from '../assets/MyLab-icon.png'
import { listPublicPlans } from '../api/publicRegistration'
import { money } from '../utils/format'

const openFaq = ref(0)

function toggleFaq(i) {
  openFaq.value = openFaq.value === i ? -1 : i
}

// Feature grid — mirrors the actual modules shipped in MyLab. Icons are
// picked from a small stroke-svg set defined in the template below.
const features = [
  {
    title: 'Patients &amp; Cases',
    body: 'Search-first patient master to avoid duplicates. Every visit opens a case that groups the visit\'s requisitions, payments, and lab reports together.',
    icon: 'users'
  },
  {
    title: 'Test catalog',
    body: 'Item groups → categories → test items (single / panel / matrix / narrative / culture). One click imports the pre-loaded catalog — 5 groups, 20+ categories, hundreds of standard tests with units and reference ranges.',
    icon: 'flask'
  },
  {
    title: 'Cashier &amp; Arrangements',
    body: 'Cash, e-wallet (GCash / Maya / GrabPay), bank transfer — or record an arrangement (A/R, Insurance, Paid Outside, Charity). Resolve arrangements later when settled. Voids need manager re-auth.',
    icon: 'cash'
  },
  {
    title: 'Signed lab reports',
    body: 'Encode results, tag as final, sign with medtech + pathologist. Every finalized report gets a QR code that opens a public read-only version. Multiple paper sizes and print templates per category.',
    icon: 'clipboard'
  },
  {
    title: 'Dashboard &amp; Reports',
    body: 'Live revenue KPIs, receivables aging, throughput, top tests, and 12+ report screens — Summary, Monthly Sales, Daily Detailed, Cashier Sales, Voids, Discounts, Payment Summary, Expenses, Test Analytics with TAT.',
    icon: 'chart'
  },
  {
    title: 'Fine-grained access',
    body: 'Owner / manager / medtech / cashier roles with per-action permissions. Assign only what each user needs — the sidebar and every button respect the grant.',
    icon: 'shield'
  },
  {
    title: 'Setup Readiness',
    body: 'A live checklist of the one-time configuration your lab needs before opening for business. Deep-links jump straight to the missing screen.',
    icon: 'bolt'
  },
  {
    title: 'Receipt printing',
    body: 'Cashier receipt with configurable header, category-aware paper sizes for lab reports (letter, half-letter, legal — portrait or landscape), and a print preview on every test item.',
    icon: 'printer'
  },
  {
    title: 'Isolated per tenant',
    body: 'Each laboratory gets its own tenant workspace. Data is encrypted in transit, backed up daily, and per-user role logs the who / what / when of every mutation.',
    icon: 'lock'
  }
]

// Onboarding steps — matches the actual Setup Readiness checklist inside
// the app, plus the operational first run.
const steps = [
  {
    n: 1,
    title: 'Register your laboratory',
    body: 'Fill in your laboratory name, contact email and location. Takes about a minute; no card required.'
  },
  {
    n: 2,
    title: 'Confirm your email',
    body: 'Click the verification link. Your admin username and password land in your inbox right after.'
  },
  {
    n: 3,
    title: 'Configure branding &amp; doctors',
    body: 'Company Settings for logo + lab report header + receipt header. Add your pathologist / medtech doctors — their signatures print on finalized reports.'
  },
  {
    n: 4,
    title: 'Import the pre-loaded catalog',
    body: 'One click installs a curated laboratory catalog — 5 item groups, 20+ categories, hundreds of test items with units and reference ranges. Skip hours of manual entry.'
  },
  {
    n: 5,
    title: 'Add your team',
    body: 'Create user logins for your medtechs, cashiers, and managers. Assign fine-grained access — each person sees only what they should.'
  },
  {
    n: 6,
    title: 'Open a case, release a report',
    body: 'Patient Cases → + Add Case (patient picker inline). Finalize the requisition, collect payment at Cashier, encode results, tag as final. Done — your first signed report is ready to print.'
  }
]

// Hardcoded fallback so the marketing page never blanks if the API is down.
const FALLBACK_PLANS = [
  { name: 'Trial',      price: '₱0',      period: '/ 14 days', tagline: 'Full-feature trial — no card required.',       highlight: false, cta: 'Start free trial', is_trial: true,  features: ['Full feature access', 'Idempotent pre-loaded catalog', 'Unlimited patients + cases'] },
  { name: 'Basic',      price: '₱1,000',  period: '/ monthly', tagline: 'One laboratory, everything on.',                highlight: false, cta: 'Choose Basic',     is_trial: false, features: ['All features', 'Full report suite', 'Unlimited patients + cases'] },
  { name: 'Pro',        price: '₱1,500',  period: '/ monthly', tagline: 'For busy labs that need every report.',         highlight: true,  cta: 'Choose Pro',       is_trial: false, features: ['All features', 'Priority support', 'Advanced analytics'] },
  { name: 'Enterprise', price: '₱3,000',  period: '/ monthly', tagline: 'For multi-branch operations.',                  highlight: false, cta: 'Contact sales',    is_trial: false, features: ['All features', 'Dedicated support', 'Custom onboarding'] }
]

const apiPlans = ref([])
const plansError = ref('')

// Split a plan's free-form features text into distinct bullets.
function featuresLines(text) {
  return String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)
}

// Map an API row → landing-page card view model. Skips the retired
// allowed_modules / max_terminals fields — the whole catalog is available
// to every plan now.
function planToCard(p, opts) {
  const durationLine = `${p.days_duration} day${p.days_duration === 1 ? '' : 's'}`
  const features = featuresLines(p.features)
  // Guarantee at least one feature line so the card doesn't look bare when
  // an admin hasn't filled in the features field yet.
  if (!features.length) features.push('All features included')
  return {
    name: p.name || p.code,
    price: Number(p.price) === 0 ? '₱0' : money(p.price),
    period: `/ ${durationLine}`,
    tagline: p.is_trial ? 'Full-feature trial — no card required.' : '',
    highlight: !!opts.highlight,
    cta: p.is_trial ? 'Start free trial' : `Choose ${p.name || p.code}`,
    is_trial: !!p.is_trial,
    features
  }
}

const groupedPlans = computed(() => {
  if (!apiPlans.value.length) {
    const trial = FALLBACK_PLANS.filter(p => p.is_trial)
    const paid  = FALLBACK_PLANS.filter(p => !p.is_trial)
    return { trials: trial, paid }
  }
  const paidRows = apiPlans.value.filter(p => !p.is_trial)
  const trialRows = apiPlans.value.filter(p => p.is_trial)
  const highlightUuid = paidRows.length ? paidRows[Math.floor((paidRows.length - 1) / 2)].uuid : null
  return {
    trials: trialRows.map(p => planToCard(p, { highlight: false })),
    paid:   paidRows.map(p => planToCard(p, { highlight: p.uuid === highlightUuid }))
  }
})

async function loadPlans() {
  plansError.value = ''
  try {
    const res = await listPublicPlans()
    const rows = Array.isArray(res?.results) ? res.results
              : Array.isArray(res) ? res
              : []
    if (rows.length) apiPlans.value = rows
  } catch (e) {
    plansError.value = e?.message || 'Failed to load plans'
  }
}

// Google Analytics (GA4) — injected on the landing page only so the marketing
// side gets traffic analytics without shipping the tag into the authenticated
// app. Guarded against double-injection because Vue can remount the view
// when the user navigates away and back.
const GA_MEASUREMENT_ID = 'G-4D112LGNY2'
function loadGoogleAnalytics() {
  if (typeof window === 'undefined') return
  if (window.__gaLoaded) return
  window.__gaLoaded = true

  const loader = document.createElement('script')
  loader.async = true
  loader.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`
  document.head.appendChild(loader)

  window.dataLayer = window.dataLayer || []
  // Standard gtag shim — pushes args onto dataLayer for gtag.js to consume.
  function gtag() { window.dataLayer.push(arguments) }
  window.gtag = gtag
  gtag('js', new Date())
  gtag('config', GA_MEASUREMENT_ID)
}

onMounted(() => {
  loadPlans()
  loadGoogleAnalytics()
})

const faqs = [
  {
    q: 'What kind of laboratory does MyLab support?',
    a: 'Clinical laboratories primarily — Chemistry, Hematology, Serology, Microbiology, Coagulation, Endocrinology, and more. Anatomic Pathology, Molecular Diagnostics, Diagnostic Imaging, and Other Diagnostics (ECG, ECHO, PFT) are supported at the category level and ready to accept test items you configure.'
  },
  {
    q: 'Do I need to install anything?',
    a: 'No — MyLab runs in your browser. Any modern tablet, laptop or desktop with Chrome, Edge, or Safari works out of the box. There is also a PWA install so you can run MyLab in its own window like a native app.'
  },
  {
    q: 'Can I import my existing test catalog?',
    a: 'Every fresh tenant can one-click import a pre-loaded catalog with hundreds of standard tests (units, reference ranges, panel components pre-configured). You can also add or edit items freely afterward — everything is fully customizable.'
  },
  {
    q: 'How do lab reports get signed?',
    a: 'Each item group can be tagged with a default signatory doctor. When you tag a report as Final, MyLab stamps the medtech (the logged-in user\'s name + license) and the pathologist (the group\'s signatory doctor with optional e-signature PNG overlay) — no PDF editing needed.'
  },
  {
    q: 'Can I bill without collecting cash right away?',
    a: 'Yes — the Cashier supports "arrangements" for A/R (company billing), Insurance, Paid Outside, Charity, and Other. Requisition items are still unlocked so the lab can proceed. Resolve the arrangement later once payment actually arrives; the audit trail records both the original arrangement and the resolution.'
  },
  {
    q: 'What happens when the internet drops?',
    a: 'The app shell keeps loading from the PWA cache — you can still read patient records and drafts you\'ve opened. New writes (payments, results, finalized reports) queue for retry the moment your connection is back.'
  },
  {
    q: 'Is there a contract or setup fee?',
    a: 'No contracts, no setup fees. Paid plans run by cycle (typically monthly) and you can switch plans or cancel any time from the Subscription page inside your account.'
  },
  {
    q: 'How is patient data kept safe?',
    a: 'Every laboratory gets an isolated tenant workspace — no data crosses tenant boundaries. Data is encrypted in transit, backed up daily, and access is controlled by per-user roles with fine-grained action permissions. Void, discount override, and other sensitive actions require manager re-authentication.'
  }
]
</script>

<template>
  <div class="min-h-full bg-white text-slate-800">
    <!-- ─── Top nav ─────────────────────────────────────────────── -->
    <header class="sticky top-0 z-30 border-b border-slate-200/60 bg-white/80 backdrop-blur">
      <div class="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <a href="#top" class="flex items-center gap-2">
          <img :src="MyLabLogo" alt="MyLab" class="h-8 w-8 object-contain" />
          <span class="text-lg font-extrabold tracking-tight text-slate-900">MyLab</span>
        </a>

        <nav class="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
          <a href="#features" class="hover:text-slate-900">Features</a>
          <a href="#how" class="hover:text-slate-900">How it works</a>
          <a href="#pricing" class="hover:text-slate-900">Pricing</a>
          <a href="#faq" class="hover:text-slate-900">FAQ</a>
          <a href="#contact" class="hover:text-slate-900">Contact</a>
        </nav>

        <div class="flex items-center gap-2">
          <RouterLink to="/login"
                      class="hidden rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-700 hover:text-slate-900 sm:inline-flex">
            Log in
          </RouterLink>
          <RouterLink to="/register"
                      class="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700">
            Sign up
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
            </svg>
          </RouterLink>
        </div>
      </div>
    </header>

    <!-- ─── Hero ────────────────────────────────────────────────── -->
    <section id="top" class="relative overflow-hidden">
      <div class="absolute inset-0 -z-10 opacity-70"
           style="background-image:
             radial-gradient(circle at 15% 10%, rgba(30,108,235,.18) 0, transparent 45%),
             radial-gradient(circle at 85% 30%, rgba(51,137,251,.14) 0, transparent 45%);"></div>

      <div class="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8 lg:py-24">
        <div class="flex flex-col justify-center">
          <span class="mb-4 inline-flex w-fit items-center gap-1 rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700">
            <span class="inline-block h-1.5 w-1.5 rounded-full bg-brand-600"></span>
            Laboratory management · for clinical labs
          </span>

          <h1 class="text-4xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            From requisition to <span class="text-brand-600">signed lab report</span> — one workflow.
          </h1>

          <p class="mt-5 max-w-lg text-lg text-slate-600">
            MyLab is a browser-based laboratory management system: patients, cases,
            requisitions, cashier, results, signed reports and QR code for authenticity verification  — all in one clean workspace.
          </p>

          <div class="mt-8 flex flex-wrap items-center gap-3">
            <RouterLink to="/register"
                        class="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700">
              Start free
              <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
              </svg>
            </RouterLink>
            <a href="#features"
               class="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              See features
            </a>
          </div>

          <div class="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500">
            <span class="inline-flex items-center gap-1">
              <svg viewBox="0 0 24 24" class="h-4 w-4 text-emerald-500" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              No credit card required
            </span>
            <span class="inline-flex items-center gap-1">
              <svg viewBox="0 0 24 24" class="h-4 w-4 text-emerald-500" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Pre-loaded catalog (one click)
            </span>
            <span class="inline-flex items-center gap-1">
              <svg viewBox="0 0 24 24" class="h-4 w-4 text-emerald-500" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Cancel any time
            </span>
          </div>
        </div>

        <!-- Hero mock-up card — a mini lab report preview instead of the old
             cashier grid so the visual signals "laboratory" at a glance. -->
        <div class="relative flex items-center justify-center">
          <div class="relative w-full max-w-lg rotate-1 rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-slate-200">
            <div class="flex items-center gap-1.5 border-b border-slate-100 pb-3">
              <span class="h-2.5 w-2.5 rounded-full bg-rose-400"></span>
              <span class="h-2.5 w-2.5 rounded-full bg-amber-400"></span>
              <span class="h-2.5 w-2.5 rounded-full bg-emerald-400"></span>
              <span class="ml-3 text-xs font-medium text-slate-400">MyLab · Lab Report</span>
              <span class="ml-auto rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-emerald-700">Final</span>
            </div>
            <!-- Header: company + patient -->
            <div class="pt-3">
              <div class="text-sm font-bold uppercase text-slate-800">SampleLab Diagnostics</div>
              <div class="mt-2 grid grid-cols-2 gap-y-1 text-[11px] text-slate-600">
                <div><span class="text-slate-400">Patient:</span> Juan Dela Cruz</div>
                <div><span class="text-slate-400">Lab #:</span> <span class="font-mono">L-26-000123</span></div>
                <div><span class="text-slate-400">Age / Sex:</span> 34 / M</div>
                <div><span class="text-slate-400">Case #:</span> <span class="font-mono">C-26-000456</span></div>
              </div>
            </div>
            <!-- Category banner + result table -->
            <div class="mt-3 rounded border-l-4 border-sky-500 bg-sky-50/60 px-2 py-1 text-[11px] font-bold uppercase tracking-widest text-slate-800">
              Clinical Chemistry
            </div>
            <table class="mt-2 w-full text-[11px]">
              <thead class="text-[9px] uppercase text-slate-400">
                <tr>
                  <th class="text-left font-semibold">Analyte</th>
                  <th class="text-left font-semibold">Result</th>
                  <th class="text-left font-semibold">Unit</th>
                  <th class="text-left font-semibold">Reference</th>
                </tr>
              </thead>
              <tbody class="text-slate-700">
                <tr><td>FBS</td><td class="font-semibold">92</td><td class="text-slate-500">mg/dL</td><td class="text-slate-500">70-110</td></tr>
                <tr><td>Creatinine</td><td class="font-semibold">1.0</td><td class="text-slate-500">mg/dL</td><td class="text-slate-500">0.6-1.4</td></tr>
                <tr><td>SGPT</td><td class="font-semibold">24</td><td class="text-slate-500">U/L</td><td class="text-slate-500">0-41</td></tr>
              </tbody>
            </table>
            <!-- Signatures -->
            <div class="mt-4 grid grid-cols-2 gap-4 text-center text-[10px]">
              <div>
                <div class="border-t border-slate-400 pt-1 font-semibold">M. Santos, RMT</div>
                <div class="text-slate-500">Medical Technologist</div>
              </div>
              <div>
                <div class="border-t border-slate-400 pt-1 font-semibold">R. Reyes, MD</div>
                <div class="text-slate-500">Pathologist</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ─── Features ────────────────────────────────────────────── -->
    <section id="features" class="border-t border-slate-100 bg-slate-50">
      <div class="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div class="mx-auto max-w-2xl text-center">
          <span class="text-xs font-semibold uppercase tracking-widest text-brand-600">Features</span>
          <h2 class="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            Everything the lab needs.
          </h2>
          <p class="mt-3 text-slate-600">
            The essentials — dialled in for laboratories that actually process patients every day.
          </p>
        </div>

        <div class="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div v-for="f in features" :key="f.title"
               class="group rounded-2xl bg-white p-6 ring-1 ring-slate-200/70 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-brand-200">
            <div class="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
              <!-- users -->
              <svg v-if="f.icon === 'users'" viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 00-3-3.87"/>
                <path d="M16 3.13a4 4 0 010 7.75"/>
              </svg>
              <!-- flask -->
              <svg v-else-if="f.icon === 'flask'" viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 3h6"/><path d="M10 3v6l-5 9a2 2 0 001.8 3h10.4a2 2 0 001.8-3l-5-9V3"/>
                <path d="M8 14h8"/>
              </svg>
              <!-- cash -->
              <svg v-else-if="f.icon === 'cash'" viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="6" width="20" height="12" rx="2"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              <!-- clipboard -->
              <svg v-else-if="f.icon === 'clipboard'" viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <rect x="7" y="4" width="10" height="4" rx="1"/>
                <path d="M5 8h14v13a1 1 0 01-1 1H6a1 1 0 01-1-1V8z"/>
                <path d="M9 13h6"/><path d="M9 17h4"/>
              </svg>
              <!-- chart -->
              <svg v-else-if="f.icon === 'chart'" viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="20" x2="12" y2="10"/>
                <line x1="18" y1="20" x2="18" y2="4"/>
                <line x1="6" y1="20" x2="6" y2="16"/>
              </svg>
              <!-- shield -->
              <svg v-else-if="f.icon === 'shield'" viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <!-- bolt -->
              <svg v-else-if="f.icon === 'bolt'" viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
              <!-- printer -->
              <svg v-else-if="f.icon === 'printer'" viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 6 2 18 2 18 9"/>
                <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
                <rect x="6" y="14" width="12" height="8"/>
              </svg>
              <!-- lock -->
              <svg v-else viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="10" rx="2"/>
                <path d="M7 11V7a5 5 0 0110 0v4"/>
              </svg>
            </div>
            <h3 class="mt-4 text-base font-bold text-slate-900" v-html="f.title"></h3>
            <p class="mt-1.5 text-sm leading-relaxed text-slate-600" v-html="f.body"></p>
          </div>
        </div>
      </div>
    </section>

    <!-- ─── How it works ────────────────────────────────────────── -->
    <section id="how" class="border-t border-slate-100 bg-white">
      <div class="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div class="mx-auto max-w-2xl text-center">
          <span class="text-xs font-semibold uppercase tracking-widest text-brand-600">How it works</span>
          <h2 class="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            From sign-up to your first signed report in ~30 minutes.
          </h2>
          <p class="mt-3 text-slate-600">
            Six short steps — no technical background required. You can pause anywhere and pick it up later.
          </p>
        </div>

        <ol class="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <li v-for="s in steps" :key="s.n"
              class="relative rounded-2xl bg-white p-6 ring-1 ring-slate-200/70 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-brand-200">
            <div class="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white shadow-sm">
              {{ s.n }}
            </div>
            <h3 class="mt-4 text-base font-bold text-slate-900" v-html="s.title"></h3>
            <p class="mt-1.5 text-sm leading-relaxed text-slate-600" v-html="s.body"></p>
          </li>
        </ol>

        <div class="mt-10 flex flex-wrap items-center justify-center gap-3">
          <RouterLink to="/register"
                      class="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700">
            Start step 1 — register
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
            </svg>
          </RouterLink>
          <RouterLink to="/login"
                      class="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Read the full guide inside
          </RouterLink>
        </div>
        <p class="mt-3 text-center text-xs text-slate-500">
          The full Getting Started guide lives inside the app — every step above is expanded there.
        </p>
      </div>
    </section>

    <!-- ─── Pricing ─────────────────────────────────────────────── -->
    <section id="pricing" class="border-t border-slate-100 bg-white">
      <div class="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div class="mx-auto max-w-2xl text-center">
          <span class="text-xs font-semibold uppercase tracking-widest text-brand-600">Pricing</span>
          <h2 class="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            Simple plans that grow with you.
          </h2>
          <p class="mt-3 text-slate-600">
            Every plan unlocks the full MyLab feature set. Pick a duration that fits your operation
            and start on a free trial.
          </p>
        </div>

        <div class="mt-12 flex flex-col items-center gap-10 lg:flex-row lg:items-stretch lg:justify-center lg:gap-8">
        <!-- Trials subsection -->
        <div v-if="groupedPlans.trials.length" class="lg:w-72 lg:shrink-0">
          <div class="flex flex-wrap justify-center gap-6 lg:h-full">
            <div v-for="p in groupedPlans.trials" :key="'trial-' + p.name"
                 class="relative flex w-full flex-col rounded-2xl p-6 ring-1 bg-white text-slate-800 ring-emerald-200/70 sm:w-72 lg:h-full lg:w-full">
              <span class="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white shadow">
                Free trial
              </span>
              <div class="text-sm font-semibold uppercase tracking-wide text-slate-500">{{ p.name }}</div>
              <div class="mt-3 flex items-baseline gap-1.5">
                <span class="text-4xl font-extrabold tracking-tight text-slate-900">{{ p.price }}</span>
                <span class="text-sm text-slate-500">{{ p.period }}</span>
              </div>
              <p v-if="p.tagline" class="mt-2 text-sm text-slate-600">{{ p.tagline }}</p>
              <ul class="mt-6 space-y-2 text-sm">
                <li v-for="ft in p.features" :key="ft" class="flex items-start gap-2">
                  <svg viewBox="0 0 24 24" class="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" fill="none" stroke="currentColor" stroke-width="2.5"
                       stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  <span class="text-slate-700">{{ ft }}</span>
                </li>
              </ul>
              <RouterLink to="/register"
                          class="mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 lg:mt-auto">
                {{ p.cta }}
              </RouterLink>
            </div>
          </div>
        </div>

        <!-- Paid plans subsection -->
        <div v-if="groupedPlans.paid.length" class="lg:min-w-0">
          <div class="flex flex-wrap justify-center gap-6 lg:h-full">
            <div v-for="p in groupedPlans.paid" :key="'paid-' + p.name"
                 :class="[
                   'relative flex w-full flex-col rounded-2xl p-6 ring-1 sm:w-72 lg:h-full',
                   p.highlight
                     ? 'bg-slate-900 text-white ring-slate-900 shadow-xl'
                     : 'bg-white text-slate-800 ring-slate-200/70'
                 ]">
              <span v-if="p.highlight"
                    class="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-500 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white shadow">
                Most popular
              </span>
              <div :class="p.highlight ? 'text-white/80' : 'text-slate-500'"
                   class="text-sm font-semibold uppercase tracking-wide">
                {{ p.name }}
              </div>
              <div class="mt-3 flex items-baseline gap-1.5">
                <span :class="p.highlight ? 'text-white' : 'text-slate-900'"
                      class="text-4xl font-extrabold tracking-tight">{{ p.price }}</span>
                <span :class="p.highlight ? 'text-white/70' : 'text-slate-500'"
                      class="text-sm">{{ p.period }}</span>
              </div>
              <p v-if="p.tagline" :class="p.highlight ? 'text-white/80' : 'text-slate-600'" class="mt-2 text-sm">
                {{ p.tagline }}
              </p>

              <ul class="mt-6 space-y-2 text-sm">
                <li v-for="ft in p.features" :key="ft" class="flex items-start gap-2">
                  <svg viewBox="0 0 24 24"
                       :class="p.highlight ? 'text-brand-300' : 'text-brand-600'"
                       class="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2.5"
                       stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  <span :class="p.highlight ? 'text-white/90' : 'text-slate-700'">{{ ft }}</span>
                </li>
              </ul>

              <RouterLink to="/register"
                          :class="[
                            'mt-8 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition lg:mt-auto',
                            p.highlight
                              ? 'bg-brand-500 text-white hover:bg-brand-400'
                              : 'bg-slate-900 text-white hover:bg-slate-800'
                          ]">
                {{ p.cta }}
              </RouterLink>
            </div>
          </div>
        </div>
        </div>

        <p class="mt-8 text-center text-xs text-slate-500">
          Prices in PHP · Cancel anytime from your account.
        </p>
      </div>
    </section>

    <!-- ─── FAQ ─────────────────────────────────────────────────── -->
    <section id="faq" class="border-t border-slate-100 bg-slate-50">
      <div class="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div class="text-center">
          <span class="text-xs font-semibold uppercase tracking-widest text-brand-600">FAQ</span>
          <h2 class="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            Questions, answered.
          </h2>
          <p class="mt-3 text-slate-600">
            Still curious? Reach out — a real human will get back to you.
          </p>
        </div>

        <div class="mt-10 divide-y divide-slate-200 rounded-2xl bg-white ring-1 ring-slate-200/70">
          <div v-for="(item, i) in faqs" :key="item.q">
            <button type="button" @click="toggleFaq(i)"
                    class="flex w-full items-center justify-between gap-4 px-5 py-4 text-left">
              <span class="font-semibold text-slate-900">{{ item.q }}</span>
              <svg viewBox="0 0 24 24"
                   :class="{ 'rotate-180': openFaq === i }"
                   class="h-5 w-5 shrink-0 text-slate-500 transition-transform"
                   fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            <div v-show="openFaq === i" class="px-5 pb-5 text-sm leading-relaxed text-slate-600">
              {{ item.a }}
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ─── Contact ─────────────────────────────────────────────── -->
    <section id="contact" class="border-t border-slate-100 bg-white">
      <div class="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div class="text-center">
          <span class="text-xs font-semibold uppercase tracking-widest text-brand-600">Contact</span>
          <h2 class="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            Talk to a human.
          </h2>
          <p class="mt-3 text-slate-600">
            Sales questions, onboarding help, or a feature you'd like to see —
            drop us a line and we'll get back within one business day.
          </p>
        </div>

        <div class="mt-10 rounded-2xl border border-slate-200 bg-slate-50/60 p-6 sm:p-8">
          <div class="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:justify-between sm:text-left">
            <div>
              <div class="text-[11px] font-bold uppercase tracking-widest text-slate-500">Support &amp; Sales</div>
              <a href="mailto:support@edgetechph.net"
                 class="mt-1 inline-block text-xl font-bold text-brand-700 hover:text-brand-800">
                support@edgetechph.net
              </a>
              <p class="mt-1 text-xs text-slate-500">
                Include your laboratory name so we can pull up your account faster.
              </p>
            </div>
            <a href="mailto:support@edgetechph.net?subject=MyLab%20inquiry"
               class="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700">
              <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
              Send us an email
            </a>
          </div>
        </div>
      </div>
    </section>

    <!-- ─── CTA banner ──────────────────────────────────────────── -->
    <section class="bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 text-white">
      <div class="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 lg:px-8">
        <h2 class="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Release your first signed lab report today.
        </h2>
        <p class="mx-auto mt-3 max-w-xl text-white/80">
          Create a free laboratory account in under a minute. No card, no contracts.
        </p>
        <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
          <RouterLink to="/register"
                      class="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-brand-700 shadow-sm hover:bg-slate-100">
            Create a laboratory account
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
            </svg>
          </RouterLink>
          <RouterLink to="/login"
                      class="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/20">
            I already have an account
          </RouterLink>
        </div>
      </div>
    </section>

    <!-- ─── Footer ──────────────────────────────────────────────── -->
    <footer class="border-t border-slate-200 bg-white">
      <div class="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:px-6 lg:px-8">
        <div class="flex items-center gap-2">
          <img :src="MyLabLogo" alt="MyLab" class="h-6 w-6 object-contain" />
          <span class="font-semibold text-slate-700">MyLab</span>
          <span class="text-slate-400">· © 2026</span>
        </div>
        <div class="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <a href="#features" class="hover:text-slate-800">Features</a>
          <a href="#how" class="hover:text-slate-800">How it works</a>
          <a href="#pricing" class="hover:text-slate-800">Pricing</a>
          <a href="#faq" class="hover:text-slate-800">FAQ</a>
          <a href="#contact" class="hover:text-slate-800">Contact</a>
          <a href="mailto:support@edgetechph.net" class="text-brand-700 hover:text-brand-800">
            support@edgetechph.net
          </a>
          <RouterLink to="/login" class="hover:text-slate-800">Log in</RouterLink>
          <RouterLink to="/register" class="hover:text-slate-800">Sign up</RouterLink>
        </div>
      </div>
    </footer>
  </div>
</template>
