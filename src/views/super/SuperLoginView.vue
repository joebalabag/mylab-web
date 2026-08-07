<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useSuperAdminStore } from '../../stores/superAdmin'
import { version as appVersion } from '../../../package.json'
import MyLabLogo from '../../assets/MyLab-icon.png'

const superAdmin = useSuperAdminStore()
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
  const res = await superAdmin.login(username.value.trim(), password.value)
  loading.value = false
  if (!res.ok) { error.value = res.message; return }
  const redirect = route.query.redirect || '/super/dashboard'
  router.push(redirect)
}
</script>

<template>
  <div class="grid min-h-full grid-cols-1 lg:grid-cols-2">
    <div class="relative hidden overflow-hidden bg-gradient-to-br from-slate-950 via-indigo-900 to-fuchsia-800 lg:block">
      <div class="absolute inset-0 opacity-40"
           style="background-image: radial-gradient(circle at 20% 20%, rgba(255,255,255,.25) 0, transparent 40%),
                                  radial-gradient(circle at 80% 60%, rgba(255,255,255,.18) 0, transparent 40%);"></div>
      <div class="relative flex h-full flex-col justify-between p-12 text-white">
        <div class="flex items-center gap-3">
          <img :src="MyLabLogo" alt="MyLab"
               class="h-11 w-11 rounded-xl bg-white/15 object-contain p-1 backdrop-blur" />
          <div>
            <div class="text-lg font-bold">MyLab Platform Console</div>
            <div class="text-xs text-white/70">Super admin access · authorized personnel only</div>
          </div>
        </div>

        <div>
          <h2 class="text-4xl font-extrabold leading-tight">
            Manage every tenant<br/>from one place.
          </h2>
          <p class="mt-4 max-w-md text-white/80">
            Provision new stores, curate subscription plans, and control super admin access — securely.
          </p>

          <ul class="mt-8 space-y-2 text-sm text-white/90">
            <li class="flex items-center gap-2">
              <span class="inline-block h-1.5 w-1.5 rounded-full bg-indigo-300"></span>
              Tenant CRUD · activate / deactivate
            </li>
            <li class="flex items-center gap-2">
              <span class="inline-block h-1.5 w-1.5 rounded-full bg-indigo-300"></span>
              Subscription plan catalogue
            </li>
            <li class="flex items-center gap-2">
              <span class="inline-block h-1.5 w-1.5 rounded-full bg-indigo-300"></span>
              Super admin user management
            </li>
          </ul>
        </div>

        <div class="text-xs text-white/60">© 2026 Platform Console · v{{ appVersion }}</div>
      </div>
    </div>

    <div class="flex items-center justify-center bg-slate-100 p-6 sm:p-10">
      <div class="w-full max-w-sm">
        <div class="mb-6 flex items-center gap-3 lg:hidden">
          <img :src="MyLabLogo" alt="MyLab" class="h-10 w-10 rounded-lg object-contain" />
          <div>
            <div class="text-base font-bold text-slate-800">Platform Console</div>
            <div class="text-xs text-slate-500">MyLab sign-in</div>
          </div>
        </div>

        <h1 class="text-2xl font-bold text-slate-800">MyLab Sign-in</h1>
        <p class="mt-1 text-sm text-slate-500">Restricted access.</p>

        <form @submit.prevent="submit" class="mt-6 space-y-4">
          <div>
            <label class="label">Username</label>
            <input v-model="username" class="input" autocomplete="username" required />
          </div>
          <div>
            <label class="label">Password</label>
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
            class="btn w-full !bg-gradient-to-r !from-indigo-600 !to-fuchsia-600 !text-white hover:!from-indigo-700 hover:!to-fuchsia-700"
            :disabled="loading"
          >
            <svg v-if="loading" viewBox="0 0 24 24" class="h-4 w-4 animate-spin" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12a9 9 0 11-6.219-8.56"/>
            </svg>
            {{ loading ? 'Signing in…' : 'Sign in as MyLab' }}
          </button>
        </form>

        <div class="mt-4 text-center text-xs text-slate-500">
          Store staff? <RouterLink to="/login" class="font-semibold text-indigo-600 hover:underline">Go to staff sign-in →</RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>
