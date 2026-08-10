<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import MyLabLoginLogo from '../assets/MyLab-logo-login.png'
import { verifyResetToken, submitNewPassword } from '../api/auth'

// Landing page for the ${appUrl}/reset-password?token=... link sent by the
// forgot-password flow. Four render states so the user always sees what's
// happening rather than a blank screen while the token check is in flight.
const STATE = { VERIFYING: 'verifying', READY: 'ready', INVALID: 'invalid', SUBMITTING: 'submitting', DONE: 'done' }

const route  = useRoute()
const router = useRouter()

const state    = ref(STATE.VERIFYING)
const username = ref('')
const errorMsg = ref('')

const pw1    = ref('')
const pw2    = ref('')
const showPw = ref(false)

const token = computed(() => String(route.query.token || '').trim())

onMounted(async () => {
  if (!token.value) {
    state.value = STATE.INVALID
    errorMsg.value = 'This reset link is missing its token. Request a new one from the sign-in page.'
    return
  }
  try {
    const res = await verifyResetToken(token.value)
    username.value = res?.username || ''
    state.value = STATE.READY
  } catch (e) {
    state.value = STATE.INVALID
    // The backend returns readable messages for expired / used / not-found;
    // fall back to a generic line for network / unexpected errors.
    errorMsg.value = e?.message || 'This reset link is no longer valid. Request a new one from the sign-in page.'
  }
})

const submitDisabled = computed(() => {
  if (state.value !== STATE.READY && state.value !== STATE.SUBMITTING) return true
  if (state.value === STATE.SUBMITTING) return true
  if (pw1.value.length < 8) return true
  if (pw1.value !== pw2.value) return true
  return false
})

async function submit() {
  errorMsg.value = ''
  if (pw1.value.length < 8) { errorMsg.value = 'Use at least 8 characters.'; return }
  if (pw1.value !== pw2.value) { errorMsg.value = 'Passwords do not match.'; return }
  state.value = STATE.SUBMITTING
  try {
    await submitNewPassword(token.value, pw1.value)
    state.value = STATE.DONE
  } catch (e) {
    // Token could have expired between verify and submit — surface the
    // message so the user knows to request a new link.
    state.value = STATE.INVALID
    errorMsg.value = e?.message || 'Could not update your password. Request a new reset link.'
  }
}

function goToLogin() {
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="flex min-h-full items-center justify-center bg-slate-50 p-4 sm:p-6">
    <div class="w-full max-w-md">
      <div class="mb-6 flex flex-col items-center gap-2 text-center">
        <img :src="MyLabLoginLogo" alt="MyLab" class="h-14 w-auto object-contain" />
        <div class="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          Reset your password
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <!-- Verifying — spinner while GET /auth/reset-password/verify runs. -->
        <div v-if="state === STATE.VERIFYING" class="flex flex-col items-center gap-3 py-6 text-center">
          <div class="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-brand-700">
            <svg viewBox="0 0 24 24" class="h-6 w-6 animate-spin" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12a9 9 0 11-6.219-8.56"/>
            </svg>
          </div>
          <div class="text-sm font-semibold text-slate-800">Checking your reset link…</div>
        </div>

        <!-- Invalid / expired / used token. -->
        <div v-else-if="state === STATE.INVALID" class="space-y-3 text-center">
          <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-700">
            <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <div class="text-base font-semibold text-slate-800">Reset link isn't usable</div>
          <p class="mx-auto max-w-sm text-sm text-slate-600">{{ errorMsg }}</p>
          <RouterLink :to="{ name: 'login' }"
                      class="btn-primary mt-4 inline-flex">
            Back to sign in
          </RouterLink>
        </div>

        <!-- Ready — set the new password. -->
        <div v-else-if="state === STATE.READY || state === STATE.SUBMITTING">
          <p class="text-sm text-slate-600">
            Setting a new password for <b class="font-mono text-slate-800">{{ username }}</b>.
          </p>
          <form @submit.prevent="submit" class="mt-4 space-y-4">
            <div>
              <label class="label">New password</label>
              <div class="relative">
                <input :type="showPw ? 'text' : 'password'" v-model="pw1" class="input pr-10"
                       autocomplete="new-password" minlength="8" required
                       placeholder="At least 8 characters" />
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
            <div>
              <label class="label">Confirm new password</label>
              <input :type="showPw ? 'text' : 'password'" v-model="pw2" class="input"
                     autocomplete="new-password" minlength="8" required
                     placeholder="Re-type the new password" />
              <p v-if="pw2 && pw1 !== pw2" class="mt-1 text-[11px] text-rose-600">
                Passwords do not match.
              </p>
            </div>

            <div v-if="errorMsg"
                 class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {{ errorMsg }}
            </div>

            <button type="submit" class="btn-primary w-full" :disabled="submitDisabled">
              <svg v-if="state === STATE.SUBMITTING" viewBox="0 0 24 24" class="h-4 w-4 animate-spin"
                   fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 12a9 9 0 11-6.219-8.56"/>
              </svg>
              {{ state === STATE.SUBMITTING ? 'Updating…' : 'Update password' }}
            </button>
          </form>
        </div>

        <!-- Success. -->
        <div v-else-if="state === STATE.DONE" class="space-y-3 text-center">
          <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <div class="text-base font-semibold text-slate-800">Password updated</div>
          <p class="mx-auto max-w-sm text-sm text-slate-600">
            You can now sign in with your new password.
          </p>
          <button class="btn-primary mt-4" @click="goToLogin">Continue to sign in</button>
        </div>
      </div>

      <div class="mt-4 text-center text-xs text-slate-500">
        Trouble resetting? Email
        <a href="mailto:support@edgetechph.net" class="font-semibold text-brand-700 hover:underline">
          support@edgetechph.net
        </a>.
      </div>
    </div>
  </div>
</template>
