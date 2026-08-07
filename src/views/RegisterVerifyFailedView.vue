<script setup>
import { computed } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { version as appVersion } from '../../package.json'
import MyLabLogo from '../assets/MyLab-icon.png'

const route = useRoute()
const reason = computed(() => String(route.query.reason || ''))

const detail = computed(() => String(route.query.detail || ''))

const explain = computed(() => {
  switch (reason.value) {
    case 'missing-token':
      return 'The verification link is missing its token. Open the exact link we emailed you — copying part of the URL will strip the token.'
    case 'expired':
      return 'This verification link has expired. Register again to receive a fresh link.'
    case 'used':
      return 'This verification link has already been used. If you already verified, try signing in.'
    case 'invalid':
      return "We couldn't validate this token. Register again to receive a fresh link."
    case 'network':
      return "We couldn't reach the server to verify your email. Check your connection and try clicking the link again."
    default:
      return "We couldn't verify your email with this link. It may be expired, already used, or malformed."
  }
})
</script>

<template>
  <div class="grid min-h-full bg-slate-50 lg:grid-cols-2">
    <!-- Left / marketing panel -->
    <div class="relative hidden bg-gradient-to-br from-rose-500 to-orange-600 p-10 text-white lg:flex lg:flex-col">
      <div class="flex items-center gap-3">
        <img :src="MyLabLogo" alt="MyLab" class="h-10 w-10 rounded-lg bg-white/10 object-contain p-1" />
        <div>
          <div class="text-lg font-bold">MyLab</div>
          <div class="text-xs text-white/70">Laboratory management for growing labs</div>
        </div>
      </div>

      <div class="my-auto max-w-md">
        <h2 class="text-4xl font-extrabold leading-tight">Something's off with that link.</h2>
        <p class="mt-4 text-white/90">
          Verification links are single-use and time-limited. If yours didn't work,
          you can register again to get a fresh one, or reach out to support if you
          think it's a mistake.
        </p>
      </div>

      <div class="text-xs text-white/60">© 2026 MyLab · v{{ appVersion }}</div>
    </div>

    <!-- Right / fail card -->
    <div class="flex items-center justify-center p-6 sm:p-10">
      <div class="w-full max-w-md text-center">
        <div class="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-rose-100 text-rose-600">
          <svg viewBox="0 0 24 24" class="h-10 w-10" fill="none" stroke="currentColor" stroke-width="2.5"
               stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        </div>

        <h1 class="text-2xl font-bold text-slate-800">Verification failed</h1>
        <p class="mt-2 text-sm text-slate-600">{{ explain }}</p>

        <div v-if="reason" class="mt-4 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[11px] text-slate-600">
          Reason
          <span class="font-mono font-semibold text-slate-800">{{ reason }}</span>
        </div>
        <div v-if="detail" class="mt-2 break-words text-[11px] text-slate-500">
          {{ detail }}
        </div>

        <div class="mt-8 flex flex-col gap-2">
          <RouterLink to="/register"
                      class="btn w-full justify-center !bg-gradient-to-r !from-brand-600 !to-fuchsia-600 !text-white hover:!from-brand-700 hover:!to-fuchsia-700">
            Register again
          </RouterLink>
          <RouterLink to="/login" class="btn-secondary w-full justify-center">
            Back to sign-in
          </RouterLink>
          <div class="text-[11px] text-slate-500">
            Still stuck? Contact support and share the reason code above.
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
