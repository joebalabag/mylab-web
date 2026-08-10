<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { version as appVersion } from '../../package.json'

const props = defineProps({
  show: Boolean
})
const emit = defineEmits(['close'])

// Sections are ordered by the actual setup + operational flow of a real
// laboratory — not the old POS/retail journey. Each key matches the
// `id="…"` on the section below so the sidebar/mobile chips can scroll to it.
const sections = [
  { key: 'welcome',      label: 'Welcome to MyLab' },
  { key: 'signup',       label: '1 · Register your laboratory' },
  { key: 'email',        label: '2 · Confirm your email' },
  { key: 'signin',       label: '3 · First sign-in' },
  { key: 'company',      label: '4 · Company & branding' },
  { key: 'doctors',      label: '5 · Add signatory doctors' },
  { key: 'catalog',      label: '6 · Build your test catalog' },
  { key: 'discounts',    label: '7 · Discounts & packages (optional)' },
  { key: 'team',         label: '8 · Add your team' },
  { key: 'operations',   label: '9 · Everyday operations' },
  { key: 'dashboard',    label: 'Dashboard' },
  { key: 'readiness',    label: 'Setup Readiness' },
  { key: 'reports',      label: 'Reports' },
  { key: 'renew',        label: 'Subscription & renewal' },
  { key: 'tips',         label: 'Everyday tips' },
  { key: 'faq',          label: 'Common questions' }
]

// Scroll inside the modal body rather than the page.
const scrollRoot = ref(null)
function scrollTo(id) {
  const el = scrollRoot.value?.querySelector('#' + id)
  if (el && scrollRoot.value) {
    scrollRoot.value.scrollTo({ top: el.offsetTop - 16, behavior: 'smooth' })
  }
}

function onEsc(e) {
  if (e.key === 'Escape' && props.show) emit('close')
}
watch(() => props.show, (v) => {
  if (v) document.addEventListener('keydown', onEsc)
  else document.removeEventListener('keydown', onEsc)
})
onBeforeUnmount(() => document.removeEventListener('keydown', onEsc))

// Lock page scroll while open so the body doesn't drift under the overlay.
const locked = computed(() => props.show)
watch(locked, (v) => {
  document.body.style.overflow = v ? 'hidden' : ''
})
onBeforeUnmount(() => { document.body.style.overflow = '' })
</script>

<template>
  <Teleport to="body">
    <transition name="fade">
      <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6">
        <div class="absolute inset-0 bg-slate-900/50" @click="$emit('close')" />

        <div class="relative flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white dark:bg-slate-900 shadow-2xl dark:bg-slate-900">
          <!-- Header -->
          <div class="flex items-center gap-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 sm:px-6 dark:border-slate-700 dark:bg-slate-900">
            <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
              <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 17h.01"/>
                <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
                <circle cx="12" cy="12" r="10"/>
              </svg>
            </div>
            <div class="min-w-0 flex-1">
              <div class="text-sm font-bold text-slate-800 dark:text-slate-100">Getting Started</div>
              <div class="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">MyLab · v{{ appVersion }}</div>
            </div>
            <button type="button" class="btn-icon" aria-label="Close" @click="$emit('close')">
              <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          <!-- Mobile TOC (horizontal scroll chips) — hidden on lg+ where the sidebar shows -->
          <nav class="shrink-0 overflow-x-auto border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-3 py-2 lg:hidden dark:border-slate-800 dark:bg-slate-800/60">
            <ul class="flex items-center gap-1.5 whitespace-nowrap">
              <li v-for="s in sections" :key="s.key">
                <button type="button"
                        class="rounded-full bg-white dark:bg-slate-900 px-3 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                        @click="scrollTo(s.key)">
                  {{ s.label }}
                </button>
              </li>
            </ul>
          </nav>

          <div class="flex min-h-0 flex-1 overflow-hidden">
            <!-- Table of contents (sticky sidebar on desktop) -->
            <aside class="hidden w-56 shrink-0 overflow-y-auto border-r border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3 lg:block dark:border-slate-800 dark:bg-slate-800/60">
              <div class="mb-2 px-1 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Contents</div>
              <ul class="space-y-0.5 text-sm">
                <li v-for="s in sections" :key="s.key">
                  <button type="button"
                          class="w-full rounded-md px-2 py-1 text-left text-slate-600 dark:text-slate-300 hover:bg-white hover:text-slate-900 dark:hover:bg-slate-900 dark:hover:text-slate-100"
                          @click="scrollTo(s.key)">
                    {{ s.label }}
                  </button>
                </li>
              </ul>
            </aside>

            <!-- Main content (scrollable) -->
            <main ref="scrollRoot" class="min-w-0 flex-1 space-y-6 overflow-y-auto bg-slate-50 dark:bg-slate-800 p-4 sm:p-6 dark:bg-slate-950">
              <!-- Hero -->
              <div class="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <h1 class="text-2xl font-bold text-slate-800 dark:text-slate-100">Welcome to MyLab 🧪</h1>
                <p class="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  MyLab is a clinical-laboratory management system: register patients, order tests,
                  collect payment, encode results, and release signed lab reports — all from one place.
                  This guide walks you from account creation to your first finalized report.
                </p>
                <p class="mt-2 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                  Already signed in? Jump to
                  <button class="font-semibold text-brand-600 hover:underline" @click="scrollTo('catalog')">Build your test catalog</button>
                  or check your progress on
                  <button class="font-semibold text-brand-600 hover:underline" @click="scrollTo('readiness')">Setup Readiness</button>.
                </p>
              </div>

              <section id="welcome" class="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100">What you can do with MyLab</h2>
                <div class="mt-3 grid gap-3 sm:grid-cols-3">
                  <div class="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3">
                    <div class="text-sm font-semibold text-slate-800 dark:text-slate-100 dark:text-slate-100">Manage patients &amp; cases</div>
                    <p class="mt-1 text-xs text-slate-600 dark:text-slate-300">Patient master records, per-visit cases, and per-case requisitions for the tests you'll run.</p>
                  </div>
                  <div class="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3">
                    <div class="text-sm font-semibold text-slate-800 dark:text-slate-100 dark:text-slate-100">Bill &amp; collect at the counter</div>
                    <p class="mt-1 text-xs text-slate-600 dark:text-slate-300">Cashier settles unpaid items. Cash, e-wallet, bank transfer, or an arrangement (A/R, insurance, paid outside, charity).</p>
                  </div>
                  <div class="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3">
                    <div class="text-sm font-semibold text-slate-800 dark:text-slate-100 dark:text-slate-100">Sign &amp; release lab reports</div>
                    <p class="mt-1 text-xs text-slate-600 dark:text-slate-300">Encode results (single, panel, matrix, narrative), tag as final with medtech + pathologist signatures, print / share via QR.</p>
                  </div>
                </div>
                <!-- Big, unmissable callout for the pre-loaded catalog — it's
                     the single most time-saving feature for a fresh tenant,
                     so it gets prime real estate on the intro screen. -->
                <div class="mt-4 rounded-xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 to-teal-50 p-4 shadow-sm">
                  <div class="flex items-start gap-3">
                    <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xl text-white">🚀</div>
                    <div class="min-w-0 flex-1">
                      <div class="flex items-baseline gap-2">
                        <div class="text-sm font-bold text-emerald-900">Start in 30 minutes with the Pre-loaded Catalog</div>
                        <span class="rounded-full bg-emerald-600 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white">Highly Recommended</span>
                      </div>
                      <p class="mt-1 text-xs text-emerald-800">
                        Skip typing hundreds of tests. One click installs 5 pre-configured item groups
                        (Clinical Laboratory, Anatomic Pathology, Molecular, Diagnostic Imaging, Other
                        Diagnostics) with their categories and starter test items.
                      </p>
                      <button type="button" class="mt-2 inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-900 hover:underline"
                              @click="scrollTo('catalog')">
                        Jump to Step 6 — Build your test catalog →
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              <!-- ─── 1 · Register ─────────────────────────────────────── -->
              <section id="signup" class="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div class="flex items-start gap-3">
                  <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700">1</div>
                  <div class="flex-1">
                    <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100">Register your laboratory</h2>
                    <p class="mt-1 text-sm text-slate-600 dark:text-slate-300">Create your tenant workspace.</p>
                  </div>
                </div>
                <div class="mt-4 space-y-3">
                  <p class="text-sm text-slate-700 dark:text-slate-200">
                    From the sign-in page, click <b>Create a laboratory account →</b> and fill in:
                  </p>
                  <ul class="space-y-1 text-sm text-slate-700 dark:text-slate-200">
                    <li class="flex items-start gap-2"><span class="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400 dark:bg-slate-500"></span><span><b>Laboratory name</b> — printed on receipts and lab reports.</span></li>
                    <li class="flex items-start gap-2"><span class="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400 dark:bg-slate-500"></span><span><b>Contact email</b> — receives the verification link + your admin login credentials.</span></li>
                    <li class="flex items-start gap-2"><span class="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400 dark:bg-slate-500"></span><span><b>Owner name</b>, <b>Contact number</b>, <b>City / Province / Country</b>.</span></li>
                  </ul>
                  <div class="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 text-xs text-slate-600 dark:text-slate-300">
                    📌 Use an email you check regularly — the verification link and your admin username / password land there.
                  </div>
                </div>
              </section>

              <!-- ─── 2 · Confirm email ────────────────────────────────── -->
              <section id="email" class="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div class="flex items-start gap-3">
                  <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700">2</div>
                  <div class="flex-1">
                    <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100">Confirm your email</h2>
                    <p class="mt-1 text-sm text-slate-600 dark:text-slate-300">One click activates your trial workspace.</p>
                  </div>
                </div>
                <ol class="mt-4 list-inside list-decimal space-y-1 text-sm text-slate-700 dark:text-slate-200">
                  <li>Open your inbox — look for an email from <b>MyLab</b>.</li>
                  <li>Click the <b>Verify email</b> button. You'll see a "You're all set!" confirmation page.</li>
                  <li>Check the inbox again for a <b>second email</b> with your admin <b>username and password</b>.</li>
                </ol>
                <div class="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  💡 Didn't get the email? Check spam first. Still nothing? Open the sign-in page and click
                  <b>"Didn't get the verification email? Resend →"</b>. If the address was a typo, register again.
                </div>
              </section>

              <!-- ─── 3 · First sign-in ────────────────────────────────── -->
              <section id="signin" class="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div class="flex items-start gap-3">
                  <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700">3</div>
                  <div class="flex-1">
                    <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100">First sign-in</h2>
                    <p class="mt-1 text-sm text-slate-600 dark:text-slate-300">Get inside and secure your account.</p>
                  </div>
                </div>
                <ol class="mt-4 list-inside list-decimal space-y-1 text-sm text-slate-700 dark:text-slate-200">
                  <li>On the <b>Sign in</b> page, enter the username + password from the second email.</li>
                  <li>Top-right avatar → <b>Change password</b>. Do this <b>before</b> adding staff so the temporary credentials are out of circulation.</li>
                </ol>
                <div class="mt-4 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 text-xs text-slate-600 dark:text-slate-300">
                  📌 As the owner you're auto-granted <b>every access-template row</b>. New users you add later start with zero access — you tick what they need from <b>User Management → Assign access</b>.
                </div>
              </section>

              <!-- ─── 4 · Company & branding ──────────────────────────── -->
              <section id="company" class="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div class="flex items-start gap-3">
                  <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700">4</div>
                  <div class="flex-1">
                    <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100">Company &amp; branding</h2>
                    <p class="mt-1 text-sm text-slate-600 dark:text-slate-300">Set the identity used on every printed receipt and lab report.</p>
                  </div>
                </div>
                <p class="mt-4 text-sm text-slate-700 dark:text-slate-200">Open <b>Company Settings</b> from the sidebar and fill in:</p>
                <div class="mt-3 grid gap-3 sm:grid-cols-2">
                  <div class="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200">
                    <div class="font-semibold text-slate-800 dark:text-slate-100">Company Identity</div>
                    <p class="mt-1">Display name, legal name, owner, branch, currency. Appears at the top of receipts and lab reports.</p>
                  </div>
                  <div class="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200">
                    <div class="font-semibold text-slate-800 dark:text-slate-100">Company Logo</div>
                    <p class="mt-1">JPG / PNG / WebP / SVG up to 5 MB. Renders on the sidebar and lab report header (logo-mode).</p>
                  </div>
                  <div class="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200">
                    <div class="font-semibold text-slate-800 dark:text-slate-100">Address, Contact, TIN</div>
                    <p class="mt-1">Contact info + tax ID printed on receipts. Toggle VAT-registered on/off.</p>
                  </div>
                  <div class="rounded-lg border border-brand-100 bg-brand-50/40 p-3 text-xs text-slate-700 dark:text-slate-200">
                    <div class="font-semibold text-slate-800 dark:text-slate-100">Lab Report Result Header</div>
                    <p class="mt-1">Two modes: <b>Logo + text</b> (default — logo on the left, multi-line text on the right) or <b>Full-width image</b> (upload a 1600×400 PNG banner). Downloadable template on the card.</p>
                  </div>
                  <div class="rounded-lg border border-emerald-100 bg-emerald-50/40 p-3 text-xs text-slate-700 dark:text-slate-200 sm:col-span-2">
                    <div class="font-semibold text-slate-800 dark:text-slate-100">Cashier Receipt Header</div>
                    <p class="mt-1">Multi-line text printed at the top of every cashier receipt (payment slip). Blank = auto-generate from company name + address. Each line renders centered.</p>
                  </div>
                </div>
              </section>

              <!-- ─── 5 · Signatory doctors ───────────────────────────── -->
              <section id="doctors" class="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div class="flex items-start gap-3">
                  <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700">5</div>
                  <div class="flex-1">
                    <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100">Add signatory doctors</h2>
                    <p class="mt-1 text-sm text-slate-600 dark:text-slate-300">Pathologists and radiologists who sign the finalized reports.</p>
                  </div>
                </div>
                <p class="mt-4 text-sm text-slate-700 dark:text-slate-200">
                  <b>Company Settings → Doctors</b>. Click <b>+ Add Doctor</b> and fill in:
                </p>
                <ul class="mt-3 space-y-1 text-sm text-slate-700 dark:text-slate-200">
                  <li class="flex items-start gap-2"><span class="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400 dark:bg-slate-500"></span><span><b>Name</b> — printed under the signature line.</span></li>
                  <li class="flex items-start gap-2"><span class="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400 dark:bg-slate-500"></span><span><b>Specialty</b> — Pathologist, Radiologist, etc.</span></li>
                  <li class="flex items-start gap-2"><span class="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400 dark:bg-slate-500"></span><span><b>License #</b> — printed as "Lic. No. …" under the signature.</span></li>
                  <li class="flex items-start gap-2"><span class="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400 dark:bg-slate-500"></span><span><b>E-signature</b> (optional) — upload a transparent-background PNG. Overlays the printed name on final reports.</span></li>
                </ul>
                <div class="mt-3 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 text-xs text-slate-600 dark:text-slate-300">
                  📌 Each item group can be tagged with a default <b>Signatory Doctor</b>. That doctor's name / license / e-signature auto-fills on lab reports produced under that group.
                </div>
              </section>

              <!-- ─── 6 · Test catalog ────────────────────────────────── -->
              <section id="catalog" class="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div class="flex items-start gap-3">
                  <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700">6</div>
                  <div class="flex-1">
                    <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100">Build your test catalog</h2>
                    <p class="mt-1 text-sm text-slate-600 dark:text-slate-300">The billable menu — item groups → categories → test items.</p>
                  </div>
                </div>

                <!-- Star of the section: the pre-loaded import saves hours
                     over hand-typing 200+ test items. Extra visual weight —
                     gradient bg, border-2, badge, numbered steps, keyword
                     highlights — so a first-time reader can't miss it. -->
                <div class="mt-4 overflow-hidden rounded-xl border-2 border-emerald-400 bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-50 shadow-md">
                  <div class="flex items-center gap-2 bg-emerald-600 px-4 py-2 text-white">
                    <span class="text-lg">🚀</span>
                    <div class="text-sm font-bold uppercase tracking-widest">Highly Recommended</div>
                    <span class="ml-auto rounded-full bg-white/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest">Fastest Path</span>
                  </div>
                  <div class="p-4">
                    <div class="text-lg font-black text-emerald-900">Import from Pre-loaded Catalog</div>
                    <p class="mt-2 text-sm text-emerald-900">
                      Skip <b>hours</b> of manual entry. One click installs a curated laboratory catalog with
                      <b>5 item groups</b>, <b>20+ categories</b>, and <b>hundreds of standard test items</b>
                      (with units, reference ranges, and components pre-configured).
                    </p>
                    <div class="mt-3 grid gap-2 sm:grid-cols-2">
                      <div class="rounded-lg bg-white/70 p-2.5 text-xs">
                        <div class="font-bold text-emerald-800">✓ Idempotent</div>
                        <div class="text-emerald-700">Re-run safely — existing codes are skipped.</div>
                      </div>
                      <div class="rounded-lg bg-white/70 p-2.5 text-xs">
                        <div class="font-bold text-emerald-800">✓ Selective</div>
                        <div class="text-emerald-700">Tick only the groups you actually offer.</div>
                      </div>
                      <div class="rounded-lg bg-white/70 p-2.5 text-xs">
                        <div class="font-bold text-emerald-800">✓ Editable</div>
                        <div class="text-emerald-700">Everything is fully customizable after import.</div>
                      </div>
                      <div class="rounded-lg bg-white/70 p-2.5 text-xs">
                        <div class="font-bold text-emerald-800">✓ Panels ready</div>
                        <div class="text-emerald-700">CBC, Urinalysis, Bilirubin, and more come pre-built.</div>
                      </div>
                    </div>
                    <div class="mt-3 rounded-lg border border-emerald-300 bg-white p-3 text-xs">
                      <div class="font-bold text-slate-800 mb-1.5">How to import:</div>
                      <ol class="list-inside list-decimal space-y-0.5 text-slate-700">
                        <li>Open <b class="text-emerald-700">Item Groups</b> from the sidebar.</li>
                        <li>Click <b class="text-emerald-700">⬇ Import from Pre-loaded</b> (top-right of the table, or in the empty-tenant banner).</li>
                        <li>In the modal, tick the item groups you offer.</li>
                        <li>Click <b class="text-emerald-700">Import N group(s)</b> at the bottom. Done in seconds.</li>
                      </ol>
                    </div>
                    <div class="mt-3 rounded-md bg-amber-100/60 border border-amber-300 p-2.5 text-[11px] text-amber-900">
                      ⚡ <b>Pro tip:</b> Do this <i>before</i> anything else in the catalog. It also seeds the
                      Setup Readiness checklist — Item Groups, Categories, and Test Items all get ticked at once.
                    </div>
                  </div>
                </div>

                <p class="mt-4 text-sm text-slate-700 dark:text-slate-200">Or add each level yourself:</p>
                <div class="mt-3 space-y-3">
                  <div class="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                    <div class="flex items-center gap-2">
                      <span class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-white">A</span>
                      <div class="text-sm font-semibold text-slate-800 dark:text-slate-100 dark:text-slate-100">Item Groups</div>
                    </div>
                    <p class="mt-1 text-xs text-slate-600 dark:text-slate-300">
                      Top buckets like <i>Clinical Laboratory</i>, <i>Anatomic Pathology</i>. Each group can carry a default <b>tester role</b> and a default <b>signatory doctor</b>.
                    </p>
                  </div>
                  <div class="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                    <div class="flex items-center gap-2">
                      <span class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-white">B</span>
                      <div class="text-sm font-semibold text-slate-800 dark:text-slate-100 dark:text-slate-100">Item Categories</div>
                    </div>
                    <p class="mt-1 text-xs text-slate-600 dark:text-slate-300">
                      Sub-buckets under each group (Chemistry, Hematology, Serology, …). Configure the <b>color chip</b>, <b>print title</b>, <b>print template</b>, and <b>paper size</b> that all tests in this category use.
                    </p>
                  </div>
                  <div class="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                    <div class="flex items-center gap-2">
                      <span class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-white">C</span>
                      <div class="text-sm font-semibold text-slate-800 dark:text-slate-100 dark:text-slate-100">Test Items</div>
                    </div>
                    <p class="mt-1 text-xs text-slate-600 dark:text-slate-300">
                      Individual billable tests. Pick a <b>result type</b>:
                    </p>
                    <ul class="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                      <li>• <b>Single</b> — one numeric or lookup value (e.g. FBS, Creatinine).</li>
                      <li>• <b>Panel</b> — multiple sub-analyte components (e.g. CBC, Bilirubin panel with Total / Direct / Indirect).</li>
                      <li>• <b>Narrative</b> — free-text write-up (Histopath, Cytology).</li>
                      <li>• <b>Culture</b> — Gram / culture / sensitivity report.</li>
                      <li>• <b>Matrix</b> — rows × columns grid (Parasitology Ova &amp; Cyst).</li>
                    </ul>
                    <p class="mt-2 text-xs text-slate-600 dark:text-slate-300">
                      Every item has a <b>Print Preview</b> row action — see how the finalized report will render with sample values before you go live.
                    </p>
                  </div>
                </div>
              </section>

              <!-- ─── 7 · Discounts & packages ────────────────────────── -->
              <section id="discounts" class="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div class="flex items-start gap-3">
                  <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700">7</div>
                  <div class="flex-1">
                    <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100">Discounts &amp; item packages <span class="text-sm font-normal text-slate-500 dark:text-slate-400 dark:text-slate-500">(optional)</span></h2>
                    <p class="mt-1 text-sm text-slate-600 dark:text-slate-300">Common promos and bundled panels the cashier can apply.</p>
                  </div>
                </div>
                <div class="mt-3 grid gap-3 sm:grid-cols-2">
                  <div class="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200">
                    <div class="font-semibold text-slate-800 dark:text-slate-100">Discounts</div>
                    <p class="mt-1">Three types: <b>Percent</b> (senior / PWD), <b>Fixed amount</b> (promo card), <b>Open amount</b> (cashier types the value). Manage from <b>Discounts</b> in the sidebar.</p>
                  </div>
                  <div class="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200">
                    <div class="font-semibold text-slate-800 dark:text-slate-100">Item Packages</div>
                    <p class="mt-1">Bundle tests billed as one line — e.g. Executive Panel, Pre-employment, Annual Physical. Manage from <b>Item Packages</b>.</p>
                  </div>
                </div>
                <div class="mt-3 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 text-xs text-slate-600 dark:text-slate-300">
                  📌 Skip this step for now if you don't need it — the cashier still works with no discounts or packages configured.
                </div>
              </section>

              <!-- ─── 8 · Team ─────────────────────────────────────────── -->
              <section id="team" class="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div class="flex items-start gap-3">
                  <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700">8</div>
                  <div class="flex-1">
                    <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100">Add your team</h2>
                    <p class="mt-1 text-sm text-slate-600 dark:text-slate-300">Give medtechs, cashiers, and managers their own logins.</p>
                  </div>
                </div>
                <ol class="mt-4 list-inside list-decimal space-y-1 text-sm text-slate-700 dark:text-slate-200">
                  <li>Open <b>User Management</b> and click <b>+ Add User</b>.</li>
                  <li>Fill the three-section form: <b>Identity</b> (name, role, email), <b>Login credentials</b> (username + temporary password), <b>Lab report fields</b> (license # + display name that prints under signatures — optional).</li>
                  <li>Save. The user has <b>zero access</b> by default.</li>
                  <li>Row action → <b>Assign access</b> → tick only what they need. Save.</li>
                </ol>
                <div class="mt-4 grid gap-3 sm:grid-cols-3">
                  <div class="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/60">
                    <div class="text-sm font-semibold text-slate-800 dark:text-slate-100 dark:text-slate-100">Medtech / Encoder</div>
                    <p class="mt-1 text-slate-600 dark:text-slate-300">Patients, Cases, Laboratory (add / edit / tag as final).</p>
                  </div>
                  <div class="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/60">
                    <div class="text-sm font-semibold text-slate-800 dark:text-slate-100 dark:text-slate-100">Cashier</div>
                    <p class="mt-1 text-slate-600 dark:text-slate-300">Cashier (dashboard + new payment + resolve arrangement). No void — that's manager-only.</p>
                  </div>
                  <div class="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/60">
                    <div class="text-sm font-semibold text-slate-800 dark:text-slate-100 dark:text-slate-100">Manager / Admin</div>
                    <p class="mt-1 text-slate-600 dark:text-slate-300">Everything — including void, discount overrides, and User Management.</p>
                  </div>
                </div>
                <p class="mt-3 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                  Access is checked at both the router and the button level. A hidden URL redirects back to the Dashboard;
                  actions the user isn't granted don't render at all.
                </p>
              </section>

              <!-- ─── 9 · Everyday operations ─────────────────────────── -->
              <section id="operations" class="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div class="flex items-start gap-3">
                  <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-700">9</div>
                  <div class="flex-1">
                    <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100">Everyday operations 🩺</h2>
                    <p class="mt-1 text-sm text-slate-600 dark:text-slate-300">The end-to-end flow every patient goes through.</p>
                  </div>
                </div>

                <div class="mt-4 space-y-3">
                  <div class="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
                    <div class="flex items-center gap-2">
                      <span class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">1</span>
                      <div class="text-sm font-semibold text-slate-800 dark:text-slate-100 dark:text-slate-100">Add a case</div>
                    </div>
                    <div class="mt-1 pl-8 text-xs text-slate-600 dark:text-slate-300 space-y-1.5">
                      <p>
                        Every visit starts here — a case is the container for the visit's requisitions,
                        payments, and lab reports. Open <b>Patient Cases → + Add Case</b>.
                      </p>
                      <p>
                        The <b>patient picker</b> is the first field: type a name / MRN / mobile number to
                        search existing patients. Pick a match to attach that patient to the case.
                        If the patient is brand-new, click <b>+ Register new patient</b> right there in the
                        picker — the mini-form (name, sex, birthdate, contact) creates and attaches them
                        in one step, no side-trip to the Patients page needed.
                      </p>
                      <p>
                        Then fill the case fields: <b>case type</b> (OPD / IPD / ER), <b>admission date</b>,
                        <b>requesting doctor</b>, remarks. Save. One case per visit; a single case can hold
                        multiple requisitions.
                      </p>
                      <div class="mt-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2 text-[11px] text-slate-600 dark:text-slate-300">
                        📌 The <b>Patients</b> module is a directory only — it lets you browse and edit
                        patient records, but it isn't transactional. All operational work
                        (billing, results, reports) hangs off a case, not directly off a patient.
                      </div>
                    </div>
                  </div>
                  <div class="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
                    <div class="flex items-center gap-2">
                      <span class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">2</span>
                      <div class="text-sm font-semibold text-slate-800 dark:text-slate-100 dark:text-slate-100">Add tests, finalize the requisition</div>
                    </div>
                    <p class="mt-1 pl-8 text-xs text-slate-600 dark:text-slate-300">
                      Inside the case, add tests (or full item packages). Save as draft to keep editing; hit <b>Finalize</b> when done — that locks the items and makes them billable at the cashier.
                    </p>
                  </div>
                  <div class="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
                    <div class="flex items-center gap-2">
                      <span class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">3</span>
                      <div class="text-sm font-semibold text-slate-800 dark:text-slate-100 dark:text-slate-100">Cashier collects payment</div>
                    </div>
                    <p class="mt-1 pl-8 text-xs text-slate-600 dark:text-slate-300">
                      <b>Cashier → + New Payment</b>. Search the case, tick which items to bill, apply a discount if needed, pick the method:
                    </p>
                    <ul class="mt-1 pl-8 space-y-0.5 text-xs text-slate-600 dark:text-slate-300">
                      <li>• <b>Cash / eWallet / Bank Transfer</b> — collected at the counter. eWallet + Bank need a provider + reference.</li>
                      <li>• <b>Arrangement</b> (A/R, Insurance, Paid Outside, Charity, Other) — no cash collected. Captures <b>Billed To</b> + Reference. Requisition still unlocks so the lab can proceed. A/R can be resolved later via the row action once collected.</li>
                    </ul>
                    <p class="mt-1 pl-8 text-xs text-slate-600 dark:text-slate-300">Receipt opens for print after confirming. Void requires manager re-authentication.</p>
                  </div>
                  <div class="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
                    <div class="flex items-center gap-2">
                      <span class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">4</span>
                      <div class="text-sm font-semibold text-slate-800 dark:text-slate-100 dark:text-slate-100">Encode results in Laboratory</div>
                    </div>
                    <p class="mt-1 pl-8 text-xs text-slate-600 dark:text-slate-300">
                      <b>Laboratory → + Add Laboratory</b>. Pick a paid requisition, choose which items to include. The editor opens with one row per component (or one grid for matrix / one textarea for narrative). Encode values; changes save as a <b>draft</b>.
                    </p>
                  </div>
                  <div class="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
                    <div class="flex items-center gap-2">
                      <span class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-bold text-white">5</span>
                      <div class="text-sm font-semibold text-slate-800 dark:text-slate-100 dark:text-slate-100">Tag as Final &amp; print</div>
                    </div>
                    <p class="mt-1 pl-8 text-xs text-slate-600 dark:text-slate-300">
                      Row action <b>Tag as Final</b> locks the values, stamps medtech + pathologist signatures, and generates a QR that opens a public read-only version of the report. Row action <b>Print Preview</b> → <b>Print</b> lays it out on the configured paper size.
                    </p>
                  </div>
                </div>

                <div class="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                  🎉 That's the full pipeline. Every completed loop shows up on the Dashboard KPIs.
                </div>
              </section>

              <!-- ─── Dashboard ───────────────────────────────────────── -->
              <section id="dashboard" class="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100">Dashboard</h2>
                <p class="mt-2 text-sm text-slate-700 dark:text-slate-200">
                  Landing analytics page. Every widget is date-range-scoped by the picker at the top (Today / 7d / 30d / MTD / YTD / Custom).
                </p>
                <div class="mt-3 grid gap-3 sm:grid-cols-2">
                  <div class="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200">
                    <div class="font-semibold text-slate-800 dark:text-slate-100">Revenue KPIs</div>
                    <p class="mt-1">Collected revenue, outstanding A/R, today's cash, revenue trend line, payment-method doughnut.</p>
                  </div>
                  <div class="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200">
                    <div class="font-semibold text-slate-800 dark:text-slate-100">Receivables aging</div>
                    <p class="mt-1">Bucket totals (0-30, 31-60, 61-90, 90+), top billed-to counter-parties, oldest-pending list with a shortcut to Cashier to resolve.</p>
                  </div>
                  <div class="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200">
                    <div class="font-semibold text-slate-800 dark:text-slate-100">Throughput &amp; top tests</div>
                    <p class="mt-1">Cases and requisitions per day + the 10 highest-revenue tests for the period.</p>
                  </div>
                  <div class="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200">
                    <div class="font-semibold text-slate-800 dark:text-slate-100">Subscription card</div>
                    <p class="mt-1">Plan name + days-to-expiry pill. Turns amber when near expiry, rose when overdue. Click through to <b>Subscription</b>.</p>
                  </div>
                </div>
              </section>

              <!-- ─── Setup Readiness ─────────────────────────────────── -->
              <section id="readiness" class="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100">Setup Readiness</h2>
                <p class="mt-2 text-sm text-slate-700 dark:text-slate-200">
                  Sidebar entry that shows a live checklist of one-time configuration required before the lab
                  can accept patients. Two phases:
                </p>
                <div class="mt-3 grid gap-3 sm:grid-cols-2">
                  <div class="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200">
                    <div class="font-semibold text-slate-800 dark:text-slate-100">Setup</div>
                    <p class="mt-1">Company Settings, Lab Header (optional), Receipt Header (optional), Users, Signatory Doctors.</p>
                  </div>
                  <div class="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200">
                    <div class="font-semibold text-slate-800 dark:text-slate-100">Catalog</div>
                    <p class="mt-1">Item Groups, Item Categories, Test Items, Discounts (optional), Item Packages (optional).</p>
                  </div>
                </div>
                <p class="mt-3 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                  Each row shows ✓ done / ⭕ pending, a live detail line (<i>3 doctor(s)</i>, <i>Missing: address, email</i>),
                  and a deep-link button to jump straight to the setup screen. A progress bar tracks required-step
                  completion; once every required row is ticked, a green <b>"Ready to operate ✓"</b> banner appears.
                </p>
                <div class="mt-3 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900">
                  ⚡ <b>Speedrun:</b> Company Settings + Signatory Doctors + Users + one click of
                  <button class="font-bold underline hover:text-emerald-700" @click="scrollTo('catalog')">Import from Pre-loaded</button>
                  = every catalog step (Item Groups, Categories, Test Items) ticks green at once.
                </div>
              </section>

              <!-- ─── Reports ─────────────────────────────────────────── -->
              <section id="reports" class="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100">Reports</h2>
                <p class="mt-2 text-sm text-slate-700 dark:text-slate-200">
                  Expandable <b>Reports</b> group in the sidebar. Every report has its own dedicated API endpoint,
                  a shared date-range picker with presets (Today / 7d / 30d / MTD / YTD / All), and CSV export + print.
                </p>
                <div class="mt-3 grid gap-3 sm:grid-cols-2">
                  <div class="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/60"><div class="font-semibold text-slate-800 dark:text-slate-100">Summary</div><p class="mt-1 text-slate-600 dark:text-slate-300">Overall snapshot + transaction analytics: revenue, ticket sizes, method mix, top cashiers, daily trend.</p></div>
                  <div class="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/60"><div class="font-semibold text-slate-800 dark:text-slate-100">Monthly Sales</div><p class="mt-1 text-slate-600 dark:text-slate-300">Jan-Dec breakdown for the selected year — revenue, discounts, expenses, net.</p></div>
                  <div class="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/60"><div class="font-semibold text-slate-800 dark:text-slate-100">Monthly Tests</div><p class="mt-1 text-slate-600 dark:text-slate-300">Lab reports created per month, with finalized/voided counts and percentages.</p></div>
                  <div class="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/60"><div class="font-semibold text-slate-800 dark:text-slate-100">Cashier Sales</div><p class="mt-1 text-slate-600 dark:text-slate-300">Per-cashier revenue for the range. Filter by cashier name.</p></div>
                  <div class="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/60"><div class="font-semibold text-slate-800 dark:text-slate-100">Voids</div><p class="mt-1 text-slate-600 dark:text-slate-300">Every voided payment — created by, voided by, when, why.</p></div>
                  <div class="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/60"><div class="font-semibold text-slate-800 dark:text-slate-100">Daily Sales</div><p class="mt-1 text-slate-600 dark:text-slate-300">Day-by-day sales tape with cash-only subtotal for reconciliation.</p></div>
                  <div class="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/60"><div class="font-semibold text-slate-800 dark:text-slate-100">Daily Detailed Sales</div><p class="mt-1 text-slate-600 dark:text-slate-300">Every payment, itemized by test, grouped by day. Great for audit.</p></div>
                  <div class="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/60"><div class="font-semibold text-slate-800 dark:text-slate-100">Daily Tests</div><p class="mt-1 text-slate-600 dark:text-slate-300">Lab reports created per day with finalized/voided counts + percentages.</p></div>
                  <div class="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/60"><div class="font-semibold text-slate-800 dark:text-slate-100">Discounts</div><p class="mt-1 text-slate-600 dark:text-slate-300">Which discount codes fired, how often, and how much was given away.</p></div>
                  <div class="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/60"><div class="font-semibold text-slate-800 dark:text-slate-100">Payment Summary</div><p class="mt-1 text-slate-600 dark:text-slate-300">Method × status breakdown with a doughnut chart.</p></div>
                  <div class="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/60"><div class="font-semibold text-slate-800 dark:text-slate-100">Expense Report</div><p class="mt-1 text-slate-600 dark:text-slate-300">All expenses (or filtered by category) with category share doughnut + totals table.</p></div>
                  <div class="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/60"><div class="font-semibold text-slate-800 dark:text-slate-100">Test Analytics</div><p class="mt-1 text-slate-600 dark:text-slate-300">Test volume trend, top-20 tests, category mix, and turnaround time (median / p95) per category.</p></div>
                </div>
              </section>

              <!-- ─── Subscription ────────────────────────────────────── -->
              <section id="renew" class="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100">Subscription &amp; renewal</h2>
                <p class="mt-2 text-sm text-slate-700 dark:text-slate-200">
                  Your trial is on us. When it's close to expiring, MyLab shows a warning pill in the top bar
                  and on the Dashboard subscription card.
                </p>
                <ol class="mt-3 list-inside list-decimal space-y-1 text-sm text-slate-700 dark:text-slate-200">
                  <li>Open <b>Subscription</b> from the sidebar.</li>
                  <li>Pick a plan and follow the payment instructions (GCash / bank / e-wallet).</li>
                  <li>Screenshot the payment confirmation.</li>
                  <li>Attach the screenshot in <b>Submit Payment</b> and click Submit.</li>
                  <li>Our team reviews within one business day and extends your subscription automatically.</li>
                </ol>
                <div class="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                  ⚠️ If your subscription expires without renewal, most write actions pause and MyLab shows a
                  "Subscription expired" screen. Renew from Subscription and you're back.
                </div>
              </section>

              <!-- ─── Tips ────────────────────────────────────────────── -->
              <section id="tips" class="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100">Everyday tips</h2>
                <div class="mt-3 grid gap-3 sm:grid-cols-2">
                  <div class="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200">
                    <div class="font-semibold text-slate-800 dark:text-slate-100">Check the Dashboard first thing</div>
                    <p class="mt-1">Yesterday's revenue, today's cash, oldest pending A/R — all in one glance.</p>
                  </div>
                  <div class="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200">
                    <div class="font-semibold text-slate-800 dark:text-slate-100">Chase A/R weekly</div>
                    <p class="mt-1">Open the Arrangements tab in Cashier; the oldest-first list is your call-list. Resolve when settled.</p>
                  </div>
                  <div class="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200">
                    <div class="font-semibold text-slate-800 dark:text-slate-100">Print Preview before printing for real</div>
                    <p class="mt-1">On any Test Item, use <b>Print Preview</b> to see how it lays out with sample values — catches missing units or reference ranges.</p>
                  </div>
                  <div class="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200">
                    <div class="font-semibold text-slate-800 dark:text-slate-100">Rotate passwords when staff turnover happens</div>
                    <p class="mt-1">User Management → row action → <b>Change password</b>. Deactivating (instead of deleting) preserves audit history.</p>
                  </div>
                </div>
              </section>

              <!-- ─── FAQ ─────────────────────────────────────────────── -->
              <section id="faq" class="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100">Common questions</h2>
                <div class="mt-4 space-y-3">
                  <div class="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3">
                    <div class="text-sm font-semibold text-slate-800 dark:text-slate-100 dark:text-slate-100">A menu item is missing from my sidebar.</div>
                    <p class="mt-1 text-xs text-slate-600 dark:text-slate-300">Ask an admin or manager to open <b>User Management → Assign access</b> and tick the module for you.</p>
                  </div>
                  <div class="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3">
                    <div class="text-sm font-semibold text-slate-800 dark:text-slate-100 dark:text-slate-100">I typed a URL and got sent back to the Dashboard.</div>
                    <p class="mt-1 text-xs text-slate-600 dark:text-slate-300">You don't have the access row for that page. This is a security feature — request it from a manager.</p>
                  </div>
                  <div class="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3">
                    <div class="text-sm font-semibold text-slate-800 dark:text-slate-100 dark:text-slate-100">The app is locked with "Subscription expired".</div>
                    <p class="mt-1 text-xs text-slate-600 dark:text-slate-300">Open <b>Subscription</b> and submit a renewal payment. Access returns as soon as our team confirms.</p>
                  </div>
                  <div class="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3">
                    <div class="text-sm font-semibold text-slate-800 dark:text-slate-100 dark:text-slate-100">The cashier can't find a case with unpaid items.</div>
                    <p class="mt-1 text-xs text-slate-600 dark:text-slate-300">The requisition may still be in <b>draft</b>. Open the case → the draft requisition → hit <b>Finalize</b>. Its items become billable immediately.</p>
                  </div>
                  <div class="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3">
                    <div class="text-sm font-semibold text-slate-800 dark:text-slate-100 dark:text-slate-100">Print preview came out blank.</div>
                    <p class="mt-1 text-xs text-slate-600 dark:text-slate-300">The print popup was firing before the tenant logo / QR code finished loading. This is fixed in the current build — assets are awaited explicitly before the print dialog opens.</p>
                  </div>
                  <div class="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3">
                    <div class="text-sm font-semibold text-slate-800 dark:text-slate-100 dark:text-slate-100">A test item is missing from the requisition picker.</div>
                    <p class="mt-1 text-xs text-slate-600 dark:text-slate-300">Check that the test item is <b>active</b> and belongs to an active category + group. Deactivated items don't show up in pickers.</p>
                  </div>
                  <div class="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3">
                    <div class="text-sm font-semibold text-slate-800 dark:text-slate-100 dark:text-slate-100">Void payment says "manager approval required".</div>
                    <p class="mt-1 text-xs text-slate-600 dark:text-slate-300">Cashiers can't self-void. The modal asks for a manager/admin username + password to sign off; the void is logged with that person's name in the Transact By column.</p>
                  </div>
                  <div class="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3">
                    <div class="text-sm font-semibold text-slate-800 dark:text-slate-100 dark:text-slate-100">The pathologist's name isn't printing on final reports.</div>
                    <p class="mt-1 text-xs text-slate-600 dark:text-slate-300">Open the parent <b>Item Group</b> → assign a <b>Signatory Doctor</b>. That doctor's name / license / e-signature will auto-fill on every finalized report under that group.</p>
                  </div>
                  <div class="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-3">
                    <div class="text-sm font-semibold text-slate-800 dark:text-slate-100 dark:text-slate-100">I imported the pre-loaded catalog twice — will I get duplicates?</div>
                    <p class="mt-1 text-xs text-slate-600 dark:text-slate-300">No. The import is idempotent: it checks each code and skips whatever already exists. Safe to re-run any time.</p>
                  </div>
                </div>
              </section>

              <div class="pb-4 text-center text-[11px] text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
                MyLab · Getting Started · v{{ appVersion }}
              </div>
            </main>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>
