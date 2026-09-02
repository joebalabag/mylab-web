<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useOfflineStore } from '../stores/offline'
import { version as appVersion } from '../../package.json'
import HelpModal from '../components/HelpModal.vue'
import Modal from '../components/Modal.vue'
import { resendVerification } from '../api/publicRegistration'
import { requestPasswordReset } from '../api/auth'
import { usePwaInstall } from '../composables/usePwaInstall'
import MyLabLoginLogo from '../assets/MyLab-logo-login.png'

// PWA install prompt — surfaces the browser's beforeinstallprompt as an
// "Install app" button. Also picks up Safari (which can't be scripted) and
// hints the user to use their browser's Share → Add to Home Screen instead.
const { canInstall, installed, installing, isSafari, promptInstall, dismissInstall } = usePwaInstall()

const showHelp = ref(false)

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const username = ref('')
const password = ref('')
const showPw = ref(false)
const loading = ref(false)
const error = ref(route.query.expired ? 'Your session has expired — please sign in again.' : '')

async function submit() {
  error.value = ''
  loading.value = true
  const res = await auth.login(username.value.trim(), password.value)
  loading.value = false
  if (!res.ok) { error.value = res.message; return }

  // First-of-day auto-bootstrap. Fire-and-forget — the user should not
  // wait on it. The offline store's progress state feeds a subtle chip
  // in the top bar so they can see it running. Only fires on stations
  // that have already opted into offline mode.
  try {
    const offline = useOfflineStore()
    await offline.initialize()
    offline.autoBootstrapIfDue().catch(() => {})
  } catch (_) { /* offline is best-effort; never block sign-in */ }

  const redirect = route.query.redirect || '/home'
  router.push(redirect)
}

/* ─── Resend verification email ─── */
// Owners who missed the verification email during onboarding can request a
// fresh one from here. The endpoint deliberately returns generic success even
// for unknown addresses (no account-existence leak) and is rate-limited, so
// we always show the same "check your inbox" confirmation.
const showResend = ref(false)
const resendEmail = ref('')
const resendLoading = ref(false)
const resendError = ref('')
const resendDone = ref(false)

function openResend() {
  resendEmail.value = ''
  resendError.value = ''
  resendDone.value = false
  showResend.value = true
}
function closeResend() {
  showResend.value = false
}
async function submitResend() {
  const email = resendEmail.value.trim()
  resendError.value = ''
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    resendError.value = 'Enter a valid email address.'
    return
  }
  resendLoading.value = true
  try {
    await resendVerification(email)
    resendDone.value = true
  } catch (e) {
    // Rate-limit responses (429) and validation errors are the only failures
    // worth surfacing — auth errors can't happen on a public endpoint.
    resendError.value = e?.message || 'Could not send the verification email — try again in a bit.'
  } finally {
    resendLoading.value = false
  }
}

/* ─── Forgot password ─── */
// Backend returns generic success whether or not the username matches, so we
// always show the same "check your email" confirmation regardless of what
// the API says — no username enumeration.
const showForgot = ref(false)
const forgotUsername = ref('')
const forgotLoading = ref(false)
const forgotError = ref('')
const forgotDone = ref(false)

function openForgot() {
  forgotUsername.value = username.value.trim()  // pre-fill from the sign-in field if any
  forgotError.value = ''
  forgotDone.value = false
  showForgot.value = true
}
function closeForgot() {
  showForgot.value = false
}
async function submitForgot() {
  const u = forgotUsername.value.trim()
  forgotError.value = ''
  if (!u) {
    forgotError.value = 'Enter your username.'
    return
  }
  forgotLoading.value = true
  try {
    await requestPasswordReset(u)
    forgotDone.value = true
  } catch (e) {
    // Only 429 (rate limit) or 400 (validation) should get here — the
    // endpoint swallows account-existence errors server-side.
    forgotError.value = e?.message || 'Could not start the reset. Try again in a bit.'
  } finally {
    forgotLoading.value = false
  }
}
</script>

<template>
  <div class="grid min-h-full grid-cols-1 lg:grid-cols-2">
    <!-- Left / hero -->
    <div class="relative hidden overflow-hidden bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 lg:block">
      <div class="absolute inset-0 opacity-30"
           style="background-image: radial-gradient(circle at 20% 20%, rgba(255,255,255,.35) 0, transparent 40%),
                                  radial-gradient(circle at 80% 60%, rgba(255,255,255,.25) 0, transparent 40%);"></div>
      <div class="relative flex h-full flex-col justify-between p-12 text-white">
        <!-- Top-left logo + tagline hidden — brand mark now lives above the
             sign-in form. Uncomment to restore.
        <div>
          <img :src="MyLabLoginLogo" alt="MyLab"
               class="h-20 w-auto object-contain drop-shadow-lg" />
          <div class="mt-2 text-xs uppercase tracking-widest text-white/70">
            Sell smarter, stock faster
          </div>
        </div>
        -->
        <div></div>

        <div>
          <h2 class="text-4xl font-extrabold leading-tight">
            Welcome back.<br/>Sign, print, release.
          </h2>
          <p class="mt-4 max-w-md text-white/80">
            Patients, cases, cashier, and signed lab reports — one workflow, from
            registration to the printed release.
          </p>

          <ul class="mt-8 space-y-2 text-sm text-white/90">
            <li class="flex items-center gap-2">
              <span class="inline-block h-1.5 w-1.5 rounded-full bg-white/80"></span>
              Search-first patient &amp; case picker
            </li>
            <li class="flex items-center gap-2">
              <span class="inline-block h-1.5 w-1.5 rounded-full bg-white/80"></span>
              Cashier for cash, e-wallet, bank &amp; A/R arrangements
            </li>
            <li class="flex items-center gap-2">
              <span class="inline-block h-1.5 w-1.5 rounded-full bg-white/80"></span>
              Encode results, sign, and release lab reports
            </li>
            <li class="flex items-center gap-2">
              <span class="inline-block h-1.5 w-1.5 rounded-full bg-white/80"></span>
              Live analytics dashboard &amp; 12+ reports
            </li>
          </ul>

          <!-- Help / Getting Started CTA — prominent on the marketing panel
               so new visitors notice it first. -->
          <div class="mt-10 rounded-xl border border-white/20 bg-white/10 p-4 backdrop-blur">
            <div class="flex items-start gap-3">
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/15">
                <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"
                     stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
                  <path d="M12 17h.01"/>
                </svg>
              </div>
              <div class="min-w-0 flex-1">
                <div class="text-sm font-bold">New to MyLab?</div>
                <p class="mt-0.5 text-xs text-white/80">
                  From sign-up to your first finalized report in ~30 minutes. The
                  Getting Started guide walks you through it.
                </p>
              </div>
            </div>
            <button type="button"
                    class="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white/95 px-4 py-2 text-sm font-semibold text-brand-700 shadow-sm transition hover:bg-white"
                    @click="showHelp = true">
              <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 3h7v7"/>
                <path d="M10 14L21 3"/>
                <path d="M21 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h5"/>
              </svg>
              Open the Getting Started guide
            </button>
          </div>
        </div>

        <div class="text-xs text-white/60">© 2026 MyLab · v{{ appVersion }}</div>
      </div>
    </div>

    <!-- Right / form -->
    <div class="flex items-center justify-center p-4 sm:p-6 md:p-10">
      <div class="w-full max-w-sm">
        <!-- Mobile-only Help pill, positioned above the logo so the header
             still feels balanced without the left marketing panel. -->
        <div class="mb-4 flex justify-end lg:hidden">
          <button type="button"
                  class="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-brand-700 shadow-sm hover:bg-slate-50"
                  @click="showHelp = true">
            <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
              <path d="M12 17h.01"/>
            </svg>
            Help
          </button>
        </div>

        <!-- Brand mark above the sign-in form, visible on all screens. -->
        <div class="mb-6 flex flex-col items-center gap-2 text-center">
          <img :src="MyLabLoginLogo" alt="MyLab"
               class="h-16 w-auto object-contain" />
          <div class="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            Laboratory management, streamlined
          </div>
        </div>

        <h1 class="text-center text-2xl font-bold text-slate-800">Sign in</h1>
        <p class="mt-1 text-center text-sm text-slate-500">
          New here?
          <RouterLink to="/register" class="font-semibold text-brand-700 hover:underline">
            Create a laboratory account →
          </RouterLink>
        </p>

        <form @submit.prevent="submit" class="mt-6 space-y-4">
          <div>
            <label class="label">Username</label>
            <input v-model="username" class="input" autocomplete="username" required />
          </div>
          <div>
            <div class="flex items-baseline justify-between gap-2">
              <label class="label">Password</label>
              <button type="button"
                      tabindex="-1"
                      class="text-[11px] font-semibold text-brand-700 hover:underline"
                      @click="openForgot">
                Forgot password?
              </button>
            </div>
            <div class="relative">
              <input :type="showPw ? 'text' : 'password'" v-model="password" class="input pr-10"
                     autocomplete="current-password" required />
              <button type="button" tabindex="-1" aria-label="Toggle password visibility"
                      class="absolute inset-y-0 right-2 my-auto btn-icon" @click="showPw = !showPw">
                <svg v-if="!showPw" viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                     stroke-linecap="round" stroke-linejoin="round">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                <svg v-else viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                     stroke-linecap="round" stroke-linejoin="round">
                  <path d="M17.94 17.94A10.05 10.05 0 0112 19c-6.5 0-10-7-10-7a17.6 17.6 0 013.94-4.66"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0112 4c6.5 0 10 7 10 7a17.66 17.66 0 01-3.09 4.24"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              </button>
            </div>
          </div>

          <div v-if="error" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {{ error }}
          </div>

          <button type="submit" class="btn-primary w-full" :disabled="loading">
            <svg v-if="loading" viewBox="0 0 24 24" class="h-4 w-4 animate-spin" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12a9 9 0 11-6.219-8.56"/>
            </svg>
            {{ loading ? 'Signing in…' : 'Sign in' }}
          </button>
        </form>

        <!-- Install as an app — Chrome/Edge/Samsung fire beforeinstallprompt
             so we render a proper "Install" button. Safari can't be scripted,
             so users see the "Share → Add to Home Screen" hint instead. Both
             quietly disappear once the app is running standalone. -->
        <div v-if="canInstall && !installed"
             class="mt-6 rounded-lg border border-brand-200 bg-brand-50/60 p-3">
          <div class="flex items-start gap-3">
            <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-600 text-white">
              <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/>
              </svg>
            </div>
            <div class="min-w-0 flex-1">
              <div class="text-sm font-semibold text-brand-900">Install MyLab as an app</div>
              <p class="mt-0.5 text-[11px] text-brand-800">
                Faster launch, its own window, works offline for the shell.
              </p>
            </div>
          </div>
          <div class="mt-2 flex gap-2">
            <button type="button" class="btn-primary flex-1 !py-1.5 !text-xs"
                    :disabled="installing" @click="promptInstall">
              {{ installing ? 'Installing…' : '⬇ Install app' }}
            </button>
            <button type="button" class="btn-ghost !py-1.5 !text-xs" @click="dismissInstall">Not now</button>
          </div>
        </div>
        <div v-else-if="isSafari && !installed"
             class="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">
          💡 <b>Want MyLab as an app?</b> Tap the Safari
          <span class="inline-flex items-center align-baseline">
            <svg viewBox="0 0 24 24" class="mx-0.5 h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
            </svg>
          </span>
          Share button → <b>Add to Home Screen</b>.
        </div>

        <div class="mt-6 flex flex-col items-center gap-1 text-center text-xs text-slate-500">
          <div>
            Didn't get your verification email?
            <button type="button"
                    class="font-semibold text-brand-700 hover:underline"
                    @click="openResend">
              Resend it →
            </button>
          </div>
          <div class="mt-1">
            Platform operator?
            <RouterLink to="/super/login" class="font-semibold text-brand-700 hover:underline">
              Super-admin sign-in →
            </RouterLink>
          </div>
        </div>
      </div>
    </div>
  </div>

  <HelpModal :show="showHelp" @close="showHelp = false" />

  <!-- Resend verification email -->
  <Modal :show="showResend" title="Resend verification email" @close="closeResend">
    <div v-if="!resendDone" class="space-y-3">
      <p class="text-sm text-slate-600">
        Enter the email address you registered your laboratory with. If a
        pending account exists for that address, we'll send a fresh
        verification link.
      </p>
      <form id="resendForm" @submit.prevent="submitResend" class="space-y-3">
        <div>
          <label class="label">Email</label>
          <input
            v-model="resendEmail"
            type="email"
            autocomplete="email"
            required
            class="input"
            placeholder="owner@example.com"
          />
        </div>
        <div v-if="resendError"
             class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ resendError }}
        </div>
      </form>
      <p class="text-[11px] text-slate-500">
        For your safety we don't confirm whether an account exists for a given
        address. Check your spam folder if nothing arrives in a few minutes.
      </p>
    </div>
    <div v-else class="flex flex-col items-center gap-3 py-2 text-center">
      <div class="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <div class="text-base font-semibold text-slate-800">Check your inbox</div>
      <p class="max-w-sm text-sm text-slate-600">
        If a pending account exists for <b class="font-mono">{{ resendEmail }}</b>,
        a new verification link is on its way. Give it a couple of minutes and
        check your spam folder if it doesn't arrive.
      </p>
    </div>
    <template #footer>
      <button v-if="!resendDone"
              class="btn-secondary"
              :disabled="resendLoading"
              @click="closeResend">
        Cancel
      </button>
      <button v-if="!resendDone"
              class="btn-primary"
              :disabled="resendLoading"
              form="resendForm"
              type="submit">
        {{ resendLoading ? 'Sending…' : 'Send verification email' }}
      </button>
      <button v-else class="btn-primary" @click="closeResend">Done</button>
    </template>
  </Modal>

  <!-- Forgot password -->
  <Modal :show="showForgot" title="Forgot your password?" @close="closeForgot">
    <div v-if="!forgotDone" class="space-y-3">
      <p class="text-sm text-slate-600">
        Enter your <b>username</b>. If there's a MyLab account for it with an
        email on file, we'll send a link to set a new password.
      </p>
      <form id="forgotForm" @submit.prevent="submitForgot" class="space-y-3">
        <div>
          <label class="label">Username</label>
          <input
            v-model="forgotUsername"
            autocomplete="username"
            required
            class="input"
            placeholder="admin.ABC123"
          />
        </div>
        <div v-if="forgotError"
             class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ forgotError }}
        </div>
      </form>
      <p class="text-[11px] text-slate-500">
        The reset link expires in one hour. If you didn't request this, you can
        safely ignore the email — your current password stays valid.
      </p>
    </div>
    <div v-else class="flex flex-col items-center gap-3 py-2 text-center">
      <div class="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
          <polyline points="22,6 12,13 2,6"/>
        </svg>
      </div>
      <div class="text-base font-semibold text-slate-800">Check your inbox</div>
      <p class="max-w-sm text-sm text-slate-600">
        If a MyLab account matches <b class="font-mono">{{ forgotUsername }}</b>
        and has an email on file, a reset link is on its way. It expires in one
        hour. Check your spam folder if it doesn't arrive.
      </p>
    </div>
    <template #footer>
      <button v-if="!forgotDone"
              class="btn-secondary"
              :disabled="forgotLoading"
              @click="closeForgot">
        Cancel
      </button>
      <button v-if="!forgotDone"
              class="btn-primary"
              :disabled="forgotLoading"
              form="forgotForm"
              type="submit">
        {{ forgotLoading ? 'Sending…' : 'Send reset link' }}
      </button>
      <button v-else class="btn-primary" @click="closeForgot">Done</button>
    </template>
  </Modal>
</template>
