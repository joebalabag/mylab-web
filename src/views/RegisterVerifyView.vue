<script setup>
import { computed } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { version as appVersion } from '../../package.json'
import MyLabLogo from '../assets/MyLab-icon.png'

const route = useRoute()
const email = computed(() => String(route.query.email || ''))
</script>

<template>
  <div class="grid min-h-full bg-slate-50 lg:grid-cols-2">
    <!-- Left / marketing panel -->
    <div class="relative hidden bg-gradient-to-br from-brand-600 to-fuchsia-600 p-10 text-white lg:flex lg:flex-col">
      <div class="flex items-center gap-3">
        <img :src="MyLabLogo" alt="MyLab" class="h-10 w-10 rounded-lg bg-white/10 object-contain p-1" />
        <div>
          <div class="text-lg font-bold">MyLab</div>
          <div class="text-xs text-white/70">Point of Sale for growing stores</div>
        </div>
      </div>

      <div class="my-auto max-w-md">
        <h2 class="text-4xl font-extrabold leading-tight">Almost there!</h2>
        <p class="mt-4 text-white/85">
          We received your registration and sent a verification link to your inbox.
          Once you confirm, the MyLab team will review and activate your workspace.
        </p>
      </div>

      <div class="text-xs text-white/60">© 2026 MyLab · v{{ appVersion }}</div>
    </div>

    <!-- Right / success card -->
    <div class="flex items-center justify-center p-6 sm:p-10">
      <div class="w-full max-w-md text-center">
        <div class="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <svg viewBox="0 0 24 24" class="h-8 w-8" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
        </div>

        <h1 class="text-2xl font-bold text-slate-800">Check your email</h1>
        <p class="mt-2 text-sm text-slate-600">
          We sent a verification link to
          <span v-if="email" class="font-mono font-semibold text-slate-800">{{ email }}</span>
          <span v-else>the address you provided</span>.
          Click the link inside to confirm your address, then wait for the platform team to activate your account.
        </p>

        <div class="mt-6 space-y-3 rounded-lg border border-slate-200 bg-white p-4 text-left text-xs text-slate-600">
          <div class="flex items-start gap-2">
            <span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700">1</span>
            <div>Open the email from <b>MyLab</b> and click <b>Verify email</b>.</div>
          </div>
          <div class="flex items-start gap-2">
            <span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700">2</span>
            <div>Once verified, you'll receive an email with your <b>trial version</b> and <b>admin access</b>.</div>
          </div>
        </div>

        <div class="mt-6 flex flex-col items-center gap-2 text-xs text-slate-500">
          <div>Didn't get the email? Check your spam folder, or</div>
          <RouterLink to="/register" class="font-semibold text-brand-600 hover:underline">
            register again with a different address
          </RouterLink>
        </div>

        <div class="mt-8">
          <RouterLink to="/login" class="btn-secondary w-full justify-center">
            Back to sign-in
          </RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>
