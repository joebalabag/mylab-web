<script setup>
import { computed } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { version as appVersion } from '../../package.json'
import MyLabLogo from '../assets/MyLab-icon.png'

const route = useRoute()
const email = computed(() => String(route.query.email || ''))
const store = computed(() => String(route.query.store || ''))
</script>

<template>
  <div class="grid min-h-full bg-slate-50 lg:grid-cols-2">
    <!-- Left / marketing panel -->
    <div class="relative hidden bg-gradient-to-br from-emerald-500 to-teal-600 p-10 text-white lg:flex lg:flex-col">
      <div class="flex items-center gap-3">
        <img :src="MyLabLogo" alt="MyLab" class="h-10 w-10 rounded-lg bg-white/10 object-contain p-1" />
        <div>
          <div class="text-lg font-bold">MyLab</div>
          <div class="text-xs text-white/70">Laboratory management for growing labs</div>
        </div>
      </div>

      <div class="my-auto max-w-md">
        <h2 class="text-4xl font-extrabold leading-tight">You're all set!</h2>
        <p class="mt-4 text-white/85">
          Your email is verified. Your trial workspace is active and your admin
          credentials are on the way — check your inbox to sign in.
        </p>
        <ul class="mt-8 space-y-2 text-sm text-white/90">
          <li class="flex items-center gap-2">
            <span class="inline-block h-1.5 w-1.5 rounded-full bg-white/80"></span>
            14-day trial with full access
          </li>
          <li class="flex items-center gap-2">
            <span class="inline-block h-1.5 w-1.5 rounded-full bg-white/80"></span>
            Owner + staff logins with granular per-user access
          </li>
          <li class="flex items-center gap-2">
            <span class="inline-block h-1.5 w-1.5 rounded-full bg-white/80"></span>
            Renew anytime from the Subscription page
          </li>
        </ul>
      </div>

      <div class="text-xs text-white/60">© 2026 MyLab · v{{ appVersion }}</div>
    </div>

    <!-- Right / success card -->
    <div class="flex items-center justify-center p-6 sm:p-10">
      <div class="w-full max-w-md text-center">
        <div class="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <svg viewBox="0 0 24 24" class="h-10 w-10" fill="none" stroke="currentColor" stroke-width="2.5"
               stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>

        <h1 class="text-2xl font-bold text-slate-800">Email verified</h1>
        <p class="mt-2 text-sm text-slate-600">
          Welcome to MyLab<span v-if="store">, <b class="text-slate-800">{{ store }}</b></span>!
          Your trial workspace is ready and your admin login was sent to
          <span v-if="email" class="font-mono font-semibold text-slate-800">{{ email }}</span>
          <span v-else>your inbox</span>.
        </p>

        <div class="mt-6 space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-left text-xs text-emerald-900">
          <div class="flex items-start gap-2">
            <svg viewBox="0 0 24 24" class="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2.5"
                 stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <div>Trial subscription <b>activated</b> — full feature access.</div>
          </div>
          <div class="flex items-start gap-2">
            <svg viewBox="0 0 24 24" class="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2.5"
                 stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <div>Admin username and password sent by email.</div>
          </div>
          <div class="flex items-start gap-2">
            <svg viewBox="0 0 24 24" class="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2.5"
                 stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <div>Change the admin password after your first sign-in.</div>
          </div>
        </div>

        <div class="mt-8 flex flex-col gap-2">
          <RouterLink to="/login"
                      class="btn w-full justify-center !bg-gradient-to-r !from-emerald-600 !to-teal-600 !text-white hover:!from-emerald-700 hover:!to-teal-700">
            Go to sign-in →
          </RouterLink>
          <div class="text-[11px] text-slate-500">
            Didn't get the credentials email? Check your spam folder or contact support.
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
