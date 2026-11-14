<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useOwnerStore } from '../../stores/owner'
import { version as appVersion } from '../../../package.json'
import MyLabLogo from '../../assets/MyLab-icon.png'
import MyLabLoginLogo from '../../assets/MyLab-logo-login.png'
import Modal from '../../components/Modal.vue'
import { forgotOwnerPassword } from '../../api/ownerAuth'

const owner = useOwnerStore()
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
  const res = await owner.login(username.value.trim(), password.value)
  loading.value = false
  if (!res.ok) { error.value = res.message; return }
  const redirect = route.query.redirect || '/owner/dashboard'
  router.push(redirect)
}

/* ─── Forgot password ─── */
// Backend is non-enumerating — always returns success. We show the same
// "check your inbox" state whether or not the username/email matched so a
// stranger can't probe for valid owner accounts.
const showForgot = ref(false)
const forgotUsername = ref('')
const forgotLoading = ref(false)
const forgotError = ref('')
const forgotDone = ref(false)

function openForgot() {
  forgotUsername.value = username.value.trim()
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
    forgotError.value = 'Enter your username or email.'
    return
  }
  forgotLoading.value = true
  try {
    await forgotOwnerPassword(u)
    forgotDone.value = true
  } catch (e) {
    // Only rate-limit (429) or validation (400) reach this branch — the
    // endpoint swallows account-existence errors server-side.
    forgotError.value = e?.message || 'Could not start the reset. Try again in a bit.'
  } finally {
    forgotLoading.value = false
  }
}
</script>

<template>
  <!-- Scope-override --brand-* to teal so `btn-primary`, focus rings, etc. in
       the Owner Sign-in form render in the console's editorial teal theme
       without disturbing the global per-tenant theme set on <html>. -->
  <div
    class="grid min-h-full grid-cols-1 lg:grid-cols-2"
    style="
      --brand-50:  240 253 250;
      --brand-100: 204 251 241;
      --brand-200: 153 246 228;
      --brand-300:  94 234 212;
      --brand-400:  45 212 191;
      --brand-500:  20 184 166;
      --brand-600:  13 148 136;
      --brand-700:  15 118 110;
      --brand-800:  17  94  89;
      --brand-900:  19  78  74;
    "
  >
    <div class="relative hidden overflow-hidden bg-slate-950 lg:block">
      <div class="absolute inset-0 opacity-40"
           style="background-image: radial-gradient(circle at 20% 20%, rgba(255,255,255,.25) 0, transparent 40%),
                                  radial-gradient(circle at 80% 60%, rgba(255,255,255,.18) 0, transparent 40%);"></div>
      <div class="relative flex h-full flex-col justify-between p-12 text-white">
        <div class="flex items-center gap-3">
          <img :src="MyLabLogo" alt="MyLab"
               class="h-11 w-11 rounded-xl bg-white/15 object-contain p-1 backdrop-blur" />
          <div>
            <div class="text-lg font-bold">MyLab Owner Console</div>
            <div class="text-xs text-white/70">Multi-branch owner access</div>
          </div>
        </div>

        <div>
          <h2 class="text-4xl font-extrabold leading-tight">
            One login,<br/>every branch.
          </h2>
          <p class="mt-4 max-w-md text-white/80">
            Compare prices across your branches, manage users, and keep every tenant in sync — from one owner console.
          </p>

          <ul class="mt-8 space-y-2 text-sm text-white/90">
            <li class="flex items-center gap-2">
              <span class="inline-block h-1.5 w-1.5 rounded-full bg-teal-300"></span>
              Consolidated tenant reports
            </li>
            <li class="flex items-center gap-2">
              <span class="inline-block h-1.5 w-1.5 rounded-full bg-teal-300"></span>
              Cross-branch price comparison
            </li>
            <li class="flex items-center gap-2">
              <span class="inline-block h-1.5 w-1.5 rounded-full bg-teal-300"></span>
              Unified user &amp; migration management
            </li>
          </ul>
        </div>

        <div class="text-xs text-white/60">© 2026 MyLab Owner Console · v{{ appVersion }}</div>
      </div>
    </div>

    <div class="flex items-center justify-center bg-slate-100 p-6 sm:p-10">
      <div class="w-full max-w-sm">
        <div class="mb-6 flex flex-col items-center gap-2 text-center">
          <img :src="MyLabLoginLogo" alt="MyLab"
               class="h-16 w-auto object-contain" />
          <div class="text-[10px] font-semibold uppercase tracking-widest text-teal-700">
            Owner Console
          </div>
        </div>

        <h1 class="text-center text-2xl font-bold text-slate-800">Owner Sign-in</h1>
        <p class="mt-1 text-center text-sm text-slate-500">Access every branch you own from one login.</p>

        <form @submit.prevent="submit" class="mt-6 space-y-4">
          <div>
            <label class="label">Username or email</label>
            <input v-model="username" class="input" autocomplete="username" required />
          </div>
          <div>
            <div class="flex items-baseline justify-between gap-2">
              <label class="label">Password</label>
              <button type="button"
                      tabindex="-1"
                      class="text-[11px] font-semibold text-teal-700 hover:underline"
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

          <button
            type="submit"
            class="btn-primary w-full"
            :disabled="loading"
          >
            <svg v-if="loading" viewBox="0 0 24 24" class="h-4 w-4 animate-spin" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12a9 9 0 11-6.219-8.56"/>
            </svg>
            {{ loading ? 'Signing in…' : 'Sign in to Owner Console' }}
          </button>
        </form>

        <div class="mt-4 text-center text-xs text-slate-500">
          Lab staff?
          <RouterLink to="/login" class="font-semibold text-teal-700 hover:underline">Go to staff sign-in →</RouterLink>
        </div>
      </div>
    </div>
  </div>

  <!-- Forgot password -->
  <Modal :show="showForgot" title="Forgot your password?" @close="closeForgot">
    <div v-if="!forgotDone" class="space-y-3">
      <p class="text-sm text-slate-600">
        Enter your <b>username or email</b>. If there's an Owner account for it
        with an email on file, we'll send a link to set a new password.
      </p>
      <form id="ownerForgotForm" @submit.prevent="submitForgot" class="space-y-3">
        <div>
          <label class="label">Username or email</label>
          <input
            v-model="forgotUsername"
            autocomplete="username"
            required
            class="input"
            placeholder="owner@yourlab.com"
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
        If an Owner account matches <b class="font-mono">{{ forgotUsername }}</b>
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
              form="ownerForgotForm"
              type="submit">
        {{ forgotLoading ? 'Sending…' : 'Send reset link' }}
      </button>
      <button v-else class="btn-primary" @click="closeForgot">Done</button>
    </template>
  </Modal>
</template>
