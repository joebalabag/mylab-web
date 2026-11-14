<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useOwnerStore } from '../../stores/owner'
import ChangePasswordDialog from '../../components/ChangePasswordDialog.vue'
import { assetUrl } from '../../api/client'
import { formatDateTime } from '../../utils/format'

const owner = useOwnerStore()

const form = ref({
  name: '',
  business_name: '',
  email: '',
  phone: ''
})
const saving = ref(false)
const error = ref('')
const flashMsg = ref('')
let flashTimer = null
function flash(m) {
  flashMsg.value = m
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => flashMsg.value = '', 2500)
}

function hydrate() {
  if (!owner.currentUser) return
  form.value = {
    name:          owner.currentUser.name          || '',
    business_name: owner.currentUser.business_name || '',
    email:         owner.currentUser.email         || '',
    phone:         owner.currentUser.phone         || ''
  }
}
onMounted(hydrate)
watch(() => owner.currentUser, hydrate)

/* ─── Branding (logo) ───
   Posts the file to POST /owner/me/logo (multipart). Backend saves the
   file under /uploads/owners/logo and sets owners.logo_url to the public
   URL — the Pinia store mirrors that URL into the session so the sidebar
   banner and topbar avatar refresh immediately. */
const LOGO_MAX_BYTES = 2 * 1024 * 1024 // 2 MB
const logoError = ref('')
const logoBusy  = ref(false)
const logoInput = ref(null)

async function onLogoPick(e) {
  logoError.value = ''
  const file = e.target?.files?.[0]
  if (!file) return
  if (!/^image\//.test(file.type)) {
    logoError.value = 'Pick an image file (PNG, JPG, SVG, WebP).'
    resetFileInput(); return
  }
  if (file.size > LOGO_MAX_BYTES) {
    logoError.value = 'Logo must be 2 MB or smaller.'
    resetFileInput(); return
  }
  logoBusy.value = true
  try {
    const res = await owner.updateMyLogo(file)
    if (!res.ok) logoError.value = res.message || 'Upload failed'
    else flash('Logo updated')
  } catch (e) {
    logoError.value = e?.message || 'Upload failed'
  } finally {
    logoBusy.value = false
    resetFileInput()
  }
}

async function removeLogo() {
  logoError.value = ''
  logoBusy.value = true
  try {
    const res = await owner.updateMyLogo(null)
    if (!res.ok) logoError.value = res.message || 'Failed to remove logo'
    else flash('Logo removed')
  } finally {
    logoBusy.value = false
  }
}

function resetFileInput() {
  if (logoInput.value) logoInput.value.value = ''
}

const dirty = computed(() => {
  if (!owner.currentUser) return false
  const u = owner.currentUser
  return (
    form.value.name          !== (u.name          || '') ||
    form.value.business_name !== (u.business_name || '') ||
    form.value.email         !== (u.email         || '') ||
    form.value.phone         !== (u.phone         || '')
  )
})

async function saveProfile() {
  error.value = ''
  const f = form.value
  if (!f.name.trim())  { error.value = 'Name is required.';  return }
  if (!f.email.trim()) { error.value = 'Email is required.'; return }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) {
    error.value = 'Email format looks invalid.'; return
  }
  saving.value = true
  try {
    const res = await owner.updateMyProfile({
      name: f.name.trim(),
      business_name: f.business_name.trim(),
      email: f.email.trim().toLowerCase(),
      phone: f.phone.trim()
    })
    if (!res.ok) { error.value = res.message || 'Failed to save profile'; return }
    flash('Profile saved')
  } catch (e) {
    error.value = e?.message || 'Failed to save profile'
  } finally {
    saving.value = false
  }
}

function revert() { hydrate() }

/* ─── Password dialog ─── */
const showChangePassword = ref(false)
async function submitPasswordChange(oldPw, newPw) {
  return await owner.changeMyPassword(oldPw, newPw)
}
function onPasswordSaved() {
  flash('Password updated')
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <div class="text-xs uppercase tracking-widest text-slate-500">Account</div>
        <div class="text-xl font-bold text-slate-800">Settings</div>
      </div>
      <span v-if="USE_MOCKS" class="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-amber-700">Mocked</span>
    </div>

    <transition name="fade">
      <div v-if="flashMsg" class="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
        {{ flashMsg }}
      </div>
    </transition>

    <!-- Branding: owner logo, shown in the console header and sidebar -->
    <section class="card overflow-hidden">
      <div class="card-header">
        <div>
          <div class="text-sm font-semibold text-slate-800">Branding</div>
          <div class="text-xs text-slate-500">Your logo appears in the Owner Console sidebar and topbar.</div>
        </div>
      </div>
      <div class="flex flex-col gap-4 p-4 sm:flex-row sm:items-start">
        <div class="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50">
          <img
            v-if="owner.currentUser?.logo_url"
            :src="assetUrl(owner.currentUser.logo_url)"
            :alt="`${owner.currentUser?.name} logo`"
            class="h-full w-full object-contain"
          />
          <div v-else class="text-center text-[11px] text-slate-500">
            <svg viewBox="0 0 24 24" class="mx-auto h-8 w-8 text-slate-300" fill="none" stroke="currentColor" stroke-width="1.5"
                 stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="5" width="18" height="14" rx="2"/>
              <circle cx="8" cy="10" r="1.5"/>
              <path d="M21 15l-5-5-8 8"/>
            </svg>
            No logo
          </div>
        </div>
        <div class="min-w-0 flex-1 space-y-2">
          <div class="text-sm font-semibold text-slate-800">Logo</div>
          <p class="text-[11px] text-slate-500">
            PNG, JPG, SVG, or WebP · max 2 MB · displayed at 40&times;40 px (sidebar) and 36&times;36 px (topbar). Transparent background works best.
          </p>
          <div v-if="logoError" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {{ logoError }}
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <label class="btn-primary cursor-pointer" :class="logoBusy && 'pointer-events-none opacity-60'">
              <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              {{ owner.currentUser?.logo_url ? 'Replace logo' : 'Upload logo' }}
              <input ref="logoInput" type="file" accept="image/*" class="hidden" @change="onLogoPick" />
            </label>
            <button
              v-if="owner.currentUser?.logo_url"
              type="button"
              class="btn-ghost !text-rose-600 hover:!bg-rose-50"
              :disabled="logoBusy"
              @click="removeLogo"
            >
              Remove logo
            </button>
          </div>
        </div>
      </div>
    </section>

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <!-- Profile -->
      <section class="card lg:col-span-2 flex flex-col overflow-hidden">
        <div class="card-header">
          <div>
            <div class="text-sm font-semibold text-slate-800">Profile</div>
            <div class="text-xs text-slate-500">Identity &amp; contact</div>
          </div>
        </div>

        <form class="space-y-4 p-4" @submit.prevent="saveProfile">
          <div v-if="error" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {{ error }}
          </div>

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label class="block">
              <span class="label">Full name <span class="text-rose-500">*</span></span>
              <input v-model="form.name" class="input" required />
            </label>
            <label class="block">
              <span class="label">Business name</span>
              <input v-model="form.business_name" class="input" />
            </label>
            <label class="block">
              <span class="label">Email <span class="text-rose-500">*</span></span>
              <input v-model="form.email" type="email" class="input" required />
            </label>
            <label class="block">
              <span class="label">Phone</span>
              <input v-model="form.phone" class="input" placeholder="+63 9xx xxx xxxx" />
            </label>
          </div>

          <dl class="grid grid-cols-2 gap-x-3 gap-y-1 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
            <dt class="font-medium text-slate-500">Owner UUID</dt>
            <dd class="truncate font-mono">{{ owner.currentUser?.uuid }}</dd>
            <dt class="font-medium text-slate-500">Last login</dt>
            <dd class="truncate">
              {{ owner.currentUser?.last_logindate ? formatDateTime(owner.currentUser.last_logindate) : '— never —' }}
            </dd>
          </dl>

          <div class="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <button type="submit" class="btn-primary" :disabled="saving || !dirty">
              <span v-if="saving">Saving…</span>
              <span v-else>Save changes</span>
            </button>
            <button type="button" class="btn-secondary" :disabled="saving || !dirty" @click="revert">
              Revert
            </button>
          </div>
        </form>
      </section>

      <!-- Security -->
      <section class="card flex flex-col overflow-hidden">
        <div class="card-header">
          <div>
            <div class="text-sm font-semibold text-slate-800">Security</div>
            <div class="text-xs text-slate-500">Password &amp; sign-in</div>
          </div>
        </div>

        <div class="space-y-4 p-4">
          <div class="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div class="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Password</div>
            <div class="mt-0.5 text-sm text-slate-700">
              Last changed: <span class="font-mono text-slate-500">—</span>
            </div>
            <p class="mt-2 text-[11px] text-slate-500">
              Changing your password signs you out of other devices. You'll need to log back in anywhere you have an active session.
            </p>
            <button class="btn-primary mt-3 w-full" @click="showChangePassword = true">
              Change password
            </button>
          </div>

          <div class="rounded-lg border border-slate-200 bg-white p-3">
            <div class="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Sessions</div>
            <div class="mt-1 text-xs text-slate-600">
              Signed in from this browser.
            </div>
            <p class="mt-2 text-[11px] text-slate-500">
              Full session history (devices, IPs, sign-out from everywhere) arrives with Phase 2 backend wiring.
            </p>
          </div>
        </div>
      </section>
    </div>

    <ChangePasswordDialog
      :show="showChangePassword"
      :subtitle="`Signed in as ${owner.currentUser?.email || ''}`"
      :submit="submitPasswordChange"
      :min-length="8"
      @close="showChangePassword = false"
      @saved="onPasswordSaved"
    />
  </div>
</template>
