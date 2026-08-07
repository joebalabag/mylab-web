<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import { registerTenant, listPublicTrials } from '../api/publicRegistration'
import { version as appVersion } from '../../package.json'
import MyLabLogo from '../assets/MyLab-icon.png'

const router = useRouter()

const form = ref({
  store_name:     '',
  contact_email:  '',
  contact_number: '',
  owner_name:     '',
  city:           '',
  province:       '',
  country:        'Philippines'
})
const submitting = ref(false)
const error      = ref('')

// ─── Trial plan picker ───
// Server returns just the fields we need to render the card: uuid, code, name,
// price (always 0 — free-only rule), days_duration, features, allowed_modules,
// max_terminals. Labels here mirror the backend PLAN_MODULE_KEYS constant.
const MODULE_LABELS = {}
const trialPlans = ref([])
const trialsLoading = ref(false)
const trialsLoadError = ref('')
const selectedPlanUuid = ref('')

async function loadTrials() {
  trialsLoading.value = true
  trialsLoadError.value = ''
  try {
    const res = await listPublicTrials()
    trialPlans.value = Array.isArray(res?.results) ? res.results
                    : Array.isArray(res) ? res
                    : []
    // Preselect the first (cheapest / most basic) plan so the form is usable
    // without a click when only one option exists.
    if (!selectedPlanUuid.value && trialPlans.value.length) {
      selectedPlanUuid.value = trialPlans.value[0].uuid
    }
  } catch (e) {
    trialsLoadError.value = e?.message || 'Failed to load trial plans'
  } finally {
    trialsLoading.value = false
  }
}
onMounted(loadTrials)

const noTrialsAvailable = computed(() =>
  !trialsLoading.value && !trialsLoadError.value && !trialPlans.value.length
)

function planModuleLabels(plan) {
  const list = Array.isArray(plan?.allowed_modules) ? plan.allowed_modules : []
  return list.map(k => MODULE_LABELS[k] || k)
}
function planTerminalsLabel(plan) {
  const cap = plan?.max_terminals
  if (cap == null) return 'Unlimited terminals'
  return `Up to ${cap} terminal${cap === 1 ? '' : 's'}`
}

function validate() {
  if (!selectedPlanUuid.value)            return 'Pick a trial plan to continue'
  if (!form.value.store_name.trim())     return 'Lab name is required'
  const email = form.value.contact_email.trim()
  if (!email)                             return 'Contact email is required'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
                                          return 'Contact email is not a valid email address'
  if (!form.value.contact_number.trim()) return 'Contact number is required'
  if (!form.value.owner_name.trim())      return 'Owner name is required'
  if (!form.value.city.trim())            return 'City is required'
  if (!form.value.province.trim())        return 'Province is required'
  if (!form.value.country.trim())         return 'Country is required'
  return ''
}

// Best-effort browser timezone hint. Silently omitted if the runtime doesn't
// expose Intl (very old browsers). Server re-validates and falls back to the
// platform default when this is missing or garbage.
function detectTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined }
  catch { return undefined }
}

async function submit() {
  error.value = validate()
  if (error.value) return
  submitting.value = true
  try {
    const payload = {
      store_name:     form.value.store_name.trim(),
      contact_email:  form.value.contact_email.trim(),
      contact_number: form.value.contact_number.trim() || undefined,
      owner_name:     form.value.owner_name.trim() || undefined,
      city:           form.value.city.trim() || undefined,
      province:       form.value.province.trim() || undefined,
      country:        form.value.country.trim() || undefined,
      timezone:       detectTimezone(),
      subscription_plan_uuid: selectedPlanUuid.value
    }
    await registerTenant(payload)
    router.push({
      name: 'register-verify',
      query: { email: payload.contact_email }
    })
  } catch (e) {
    error.value = e?.message || 'Registration failed. Please try again.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="grid min-h-full bg-slate-50 lg:grid-cols-2">
    <!-- Left / marketing panel -->
    <div class="relative hidden bg-gradient-to-br from-brand-600 to-fuchsia-600 p-10 text-white lg:flex lg:flex-col">
      <div class="flex items-center gap-3">
        <img :src="MyLabLogo" alt="MyLab" class="h-10 w-10 rounded-lg bg-white/10 object-contain p-1" />
        <div>
          <div class="text-lg font-bold">MyLab</div>
          <div class="text-xs text-white/70">Laboratory management for growing labs</div>
        </div>
      </div>

      <div class="my-auto max-w-md">
        <h2 class="text-4xl font-extrabold leading-tight">Register your lab</h2>
        <p class="mt-4 text-white/85">
          Tell us about your lab and we'll set up your MyLab workspace.
          Once verified, you'll get an owner account with full access.
        </p>
        <ul class="mt-8 space-y-2 text-sm text-white/90">
          <li class="flex items-center gap-2">
            <span class="inline-block h-1.5 w-1.5 rounded-full bg-white/80"></span>
            Free to register — pay only when you activate a plan
          </li>
          <li class="flex items-center gap-2">
            <span class="inline-block h-1.5 w-1.5 rounded-full bg-white/80"></span>
            Patients, cases, requisitions, cashier, and signed reports out of the box
          </li>
          <li class="flex items-center gap-2">
            <span class="inline-block h-1.5 w-1.5 rounded-full bg-white/80"></span>
            Owner + staff logins with granular per-user access
          </li>
        </ul>
      </div>

      <div class="text-xs text-white/60">© 2026 MyLab · v{{ appVersion }}</div>
    </div>

    <!-- Right / form -->
    <div class="flex items-center justify-center p-6 sm:p-10">
      <div class="w-full max-w-lg">
        <div class="mb-6 flex items-center gap-3 lg:hidden">
          <img :src="MyLabLogo" alt="MyLab" class="h-10 w-10 rounded-lg object-contain" />
          <div>
            <div class="text-base font-bold text-slate-800">MyLab</div>
            <div class="text-xs text-slate-500">Register your lab</div>
          </div>
        </div>

        <h1 class="text-2xl font-bold text-slate-800">Create your MyLab account</h1>
        <p class="mt-1 text-sm text-slate-500">
          Fill in the details below. We'll email you a verification link once the platform team reviews your registration.
        </p>

        <form @submit.prevent="submit" class="mt-6 space-y-4">
          <div>
            <div class="mb-1 flex items-baseline justify-between gap-2">
              <label class="label">Pick a trial plan *</label>
              <span class="text-[11px] text-slate-500">All trials are free</span>
            </div>

            <div v-if="trialsLoading" class="rounded-md border border-slate-200 bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
              Loading available trial plans…
            </div>
            <div v-else-if="trialsLoadError"
                 class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              Couldn't load trial plans: {{ trialsLoadError }}
              <button type="button" class="ml-2 font-semibold underline" @click="loadTrials">Retry</button>
            </div>
            <div v-else-if="noTrialsAvailable"
                 class="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
              No trial plans are currently offered. Please contact support so we can enable one for you.
            </div>
            <div v-else class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button v-for="p in trialPlans" :key="p.uuid" type="button"
                      class="relative rounded-xl border p-3 text-left transition"
                      :class="selectedPlanUuid === p.uuid
                              ? 'border-brand-500 ring-2 ring-brand-200 bg-white shadow-sm'
                              : 'border-slate-200 bg-white hover:border-brand-300'"
                      @click="selectedPlanUuid = p.uuid">
                <svg v-if="selectedPlanUuid === p.uuid"
                     viewBox="0 0 24 24" class="absolute right-2 top-2 h-4 w-4 text-brand-600"
                     fill="none" stroke="currentColor" stroke-width="3"
                     stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <div class="flex items-center gap-2">
                  <span class="rounded bg-brand-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-brand-700">{{ p.code }}</span>
                  <span class="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Free</span>
                </div>
                <div class="mt-1 text-sm font-bold text-slate-800">{{ p.name }}</div>
                <div class="mt-1 text-[11px] text-slate-500">
                  {{ p.days_duration }} day{{ p.days_duration === 1 ? '' : 's' }} · {{ planTerminalsLabel(p) }}
                </div>
                <div class="mt-2 flex flex-wrap items-center gap-1">
                  <span v-for="mod in planModuleLabels(p)" :key="mod"
                        class="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">
                    {{ mod }}
                  </span>
                  <span v-if="!planModuleLabels(p).length"
                        class="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                    All modules included
                  </span>
                </div>
              </button>
            </div>
          </div>

          <div>
            <label class="label">Lab name *</label>
            <input v-model="form.store_name" required class="input" placeholder="e.g. MnD Diagnostic Lab" />
          </div>

          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label class="label">Contact email *</label>
              <input v-model="form.contact_email" type="email" required autocomplete="email"
                     class="input" placeholder="you@example.com" />
              <p class="mt-1 text-[11px] text-slate-500">Verification link goes here; also becomes the owner login.</p>
            </div>
            <div>
              <label class="label">Contact number *</label>
              <input v-model="form.contact_number" required autocomplete="tel"
                     class="input" placeholder="+63 917 000 0000" />
            </div>
          </div>

          <div>
            <label class="label">Owner name *</label>
            <input v-model="form.owner_name" required autocomplete="name"
                   class="input" placeholder="Full name of the person signing up" />
          </div>

          <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label class="label">City *</label>
              <input v-model="form.city" required class="input" placeholder="Quezon City" />
            </div>
            <div>
              <label class="label">Province *</label>
              <input v-model="form.province" required class="input" placeholder="Metro Manila" />
            </div>
            <div>
              <label class="label">Country *</label>
              <input v-model="form.country" required class="input" />
            </div>
          </div>

          <div v-if="error" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {{ error }}
          </div>

          <button type="submit"
                  class="btn w-full !bg-gradient-to-r !from-brand-600 !to-fuchsia-600 !text-white hover:!from-brand-700 hover:!to-fuchsia-700"
                  :disabled="submitting">
            <svg v-if="submitting" viewBox="0 0 24 24" class="h-4 w-4 animate-spin" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12a9 9 0 11-6.219-8.56"/>
            </svg>
            {{ submitting ? 'Submitting…' : 'Create account' }}
          </button>

          <p class="text-[11px] text-slate-500">
            Your account will be marked <b>Pending</b> until the platform team approves it. You'll receive an email
            with the next steps.
          </p>
        </form>

        <div class="mt-6 text-center text-xs text-slate-500">
          Already have an account?
          <RouterLink to="/login" class="font-semibold text-brand-600 hover:underline">
            Sign in →
          </RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>
