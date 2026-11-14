<script setup>
/**
 * Reusable "New Tenant" modal — visually identical to the create flow in
 * SuperTenantsView.vue, but self-contained so it can be dropped into any
 * super view (e.g. SuperOwnerDetailsView). While Phase 1 runs on mock
 * data, submit() just emits the shaped tenant object. When Phase 1 backend
 * ships (step 1.9), this component gets wired to the tenant store the same
 * way SuperTenantsView's inline modal is, and the inline modal there is
 * replaced with this component so there's one source of truth.
 */
import { computed, onMounted, ref, watch } from 'vue'
import Modal from './Modal.vue'
import { DEFAULT_TIMEZONE, allTimezones } from '../utils/timezones'
import * as tenantsApi from '../api/tenants'
import * as ownersApi from '../api/owners'

const TIMEZONES = allTimezones()

const props = defineProps({
  show: Boolean,
  presetOwnerUuid: { type: String, default: '' }
})
const emit = defineEmits(['close', 'created'])

const emptyForm = () => ({
  display_name: '',
  legal_name: '',
  owner_name: '',
  owner_uuid: props.presetOwnerUuid || '',
  store_code: '',
  branch: '',
  terminal_id: '',
  currency: 'PHP',
  timezone: DEFAULT_TIMEZONE,
  address_street1: '',
  address_street2: '',
  city: '',
  province: '',
  postal_code: '',
  country: 'Philippines',
  contact_number: '',
  email_address: '',
  website: '',
  tin_number: '',
  is_vat_registered: false,
  show_tin_on_receipt: true,
  receipt_header: '',
  receipt_footer: '',
  receipt_show_logo: true
})

const form      = ref(emptyForm())
const formError = ref('')
const submitting = ref(false)

/* Logo state */
const logoFile      = ref(null)
const logoObjectUrl = ref('')
function releaseObjectUrl() {
  if (logoObjectUrl.value) URL.revokeObjectURL(logoObjectUrl.value)
  logoObjectUrl.value = ''
}
function onLogoPick(e) {
  const file = e.target.files?.[0]
  if (!file) return
  logoFile.value = file
  releaseObjectUrl()
  logoObjectUrl.value = URL.createObjectURL(file)
}
function clearPickedLogo() {
  logoFile.value = null
  releaseObjectUrl()
}
const logoPreviewSrc = computed(() => logoObjectUrl.value || '')

// Owners for the "Assign to Owner" dropdown. Loaded once and whenever the
// modal re-opens so a freshly-added owner shows up without a full refresh.
const ownersList = ref([])
async function loadOwners() {
  try {
    const res = await ownersApi.listOwners({ status: ['active'], page_size: 500 })
    ownersList.value = Array.isArray(res?.results) ? res.results : (Array.isArray(res) ? res : [])
  } catch (_) {
    ownersList.value = []
  }
}
onMounted(loadOwners)

// Reset form every time the modal opens; honour the latest preset.
watch(() => props.show, (open) => {
  if (open) {
    form.value = emptyForm()
    formError.value = ''
    logoFile.value = null
    releaseObjectUrl()
    loadOwners()
  } else {
    releaseObjectUrl()
  }
})

function handleClose() {
  if (submitting.value) return
  emit('close')
}

async function submit() {
  formError.value = ''
  const f = form.value
  if (!f.display_name.trim()) { formError.value = 'Store name is required';  return }
  if (!f.store_code.trim())   { formError.value = 'Store code is required';  return }
  const email = f.email_address.trim()
  if (!email) {
    formError.value = 'Contact email is required — it becomes the auto-provisioned admin\'s email'
    return
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    formError.value = 'Contact email is not a valid email address'
    return
  }

  submitting.value = true
  try {
    // POST /tenant/create (multipart). owner_uuid rides along in the body;
    // the backend inserts the tenant then calls OwnerService.assignTenant
    // to wire the owner_tenants join atomically. Admin user provisioning
    // for this flow is deferred — super-admin can run it from Super Tenants
    // via the existing inline create. Owner-side user creation lives in
    // the Owner Users view when Phase 2 lands.
    const payload = {
      display_name:      f.display_name.trim(),
      legal_name:        f.legal_name.trim(),
      owner_name:        f.owner_name.trim(),
      owner_uuid:        f.owner_uuid || undefined,
      store_code:        f.store_code.trim().toUpperCase(),
      branch:            f.branch.trim(),
      terminal_id:       f.terminal_id.trim(),
      currency:          f.currency.trim() || 'PHP',
      timezone:          f.timezone.trim() || DEFAULT_TIMEZONE,
      address_street1:   f.address_street1.trim(),
      address_street2:   f.address_street2.trim(),
      city:              f.city.trim(),
      province:          f.province.trim(),
      postal_code:       f.postal_code.trim(),
      country:           f.country.trim(),
      contact_number:    f.contact_number.trim(),
      email_address:     email,
      website:           f.website.trim(),
      tin_number:        f.tin_number.trim(),
      is_vat_registered:   !!f.is_vat_registered,
      show_tin_on_receipt: !!f.show_tin_on_receipt,
      receipt_header:    f.receipt_header.trim(),
      receipt_footer:    f.receipt_footer.trim(),
      receipt_show_logo:  !!f.receipt_show_logo,
    }
    const created = await tenantsApi.createTenant(payload, logoFile.value)
    emit('created', created)
  } catch (e) {
    formError.value = e?.message || 'Failed to create tenant'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Modal :show="show" title="New Tenant" size="xl" @close="handleClose">
    <div class="mb-3 flex items-start gap-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-800">
      <svg viewBox="0 0 24 24" class="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="16" x2="12" y2="12"/>
        <line x1="12" y1="8" x2="12.01" y2="8"/>
      </svg>
      <div>
        Creating a new tenant will also provision an <b>Admin</b> user for the store, using the
        <b>Contact email</b> below as the admin's email. The username and password will be generated
        automatically and shown once after save &mdash; copy them then.
      </div>
    </div>

    <form class="max-h-[70vh] space-y-6 overflow-y-auto pr-1" @submit.prevent="submit">
      <!-- Identity -->
      <section class="space-y-3">
        <div class="text-xs font-bold uppercase tracking-widest text-slate-500">Company Identity</div>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <!-- Logo -->
          <div class="sm:col-span-1">
            <label class="label">Company Logo</label>
            <div class="flex h-32 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50">
              <img v-if="logoPreviewSrc" :src="logoPreviewSrc" class="h-full w-full object-contain" />
              <div v-else class="text-center text-xs text-slate-500">
                <svg viewBox="0 0 24 24" class="mx-auto h-8 w-8 text-slate-300" fill="none" stroke="currentColor" stroke-width="1.5"
                     stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="5" width="18" height="14" rx="2"/>
                  <circle cx="8" cy="10" r="1.5"/>
                  <path d="M21 15l-5-5-8 8"/>
                </svg>
                No logo
              </div>
            </div>
            <div class="mt-2 flex flex-wrap gap-2">
              <label class="btn-secondary cursor-pointer !text-xs">
                {{ logoFile ? 'Replace' : 'Upload' }}
                <input type="file" accept="image/*" class="hidden" @change="onLogoPick" />
              </label>
              <button v-if="logoFile" type="button" class="btn-ghost !text-xs" @click="clearPickedLogo">Discard pick</button>
            </div>
          </div>

          <div class="sm:col-span-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label class="label">Store Code *</label>
              <input v-model="form.store_code" required class="input font-mono uppercase" placeholder="MNDG-001" />
            </div>
            <div>
              <label class="label">Store (Display) Name *</label>
              <input v-model="form.display_name" required class="input" placeholder="Corner Store" />
            </div>
            <div class="sm:col-span-2">
              <label class="label">Legal name</label>
              <input v-model="form.legal_name" class="input" placeholder="Registered business name" />
            </div>
            <div class="sm:col-span-2">
              <label class="label">Owner name</label>
              <input v-model="form.owner_name" autocomplete="name" class="input"
                     placeholder="Full name of the store owner" />
            </div>
            <div class="sm:col-span-2">
              <label class="label">Assign to Owner</label>
              <select v-model="form.owner_uuid" class="input" :disabled="!!presetOwnerUuid">
                <option value="">&mdash; No owner (platform-managed) &mdash;</option>
                <option v-for="o in ownersList" :key="o.uuid" :value="o.uuid">
                  {{ o.name }}{{ o.business_name ? ' · ' + o.business_name : '' }}
                </option>
              </select>
              <p v-if="presetOwnerUuid" class="mt-1 text-[11px] text-indigo-700">
                Pre-assigned from owner details &mdash; unlock by opening the modal from the Tenants page instead.
              </p>
              <p v-else class="mt-1 text-[11px] text-slate-500">
                Optional. Owners manage their tenants from
                <span class="font-mono">/owner</span> and see consolidated reports across their branches.
              </p>
            </div>
            <div>
              <label class="label">Branch</label>
              <input v-model="form.branch" class="input" placeholder="Main Branch" />
            </div>
            <div>
              <label class="label">Terminal ID</label>
              <input v-model="form.terminal_id" class="input font-mono" placeholder="T01" />
            </div>
            <div>
              <label class="label">Currency</label>
              <input v-model="form.currency" class="input w-32" placeholder="PHP" />
            </div>
            <div>
              <label class="label">Timezone</label>
              <select v-model="form.timezone" class="input">
                <option v-for="tz in TIMEZONES" :key="tz" :value="tz">{{ tz }}</option>
              </select>
              <p class="mt-1 text-[11px] text-slate-500">
                Drives discount schedule rules (day / time windows). Changing this
                reinterprets existing scheduled discounts in the new zone.
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- Contact -->
      <section class="space-y-3 border-t border-slate-100 pt-4">
        <div class="text-xs font-bold uppercase tracking-widest text-slate-500">Contact</div>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label class="label">Email <span class="text-rose-500">*</span></label>
            <input v-model="form.email_address" type="email" required class="input" placeholder="hello@store.local" />
            <p class="mt-1 text-[11px] text-slate-500">
              This email becomes the auto-provisioned admin account's email.
            </p>
          </div>
          <div>
            <label class="label">Phone</label>
            <input v-model="form.contact_number" class="input" placeholder="+63 917 000 0000" />
          </div>
          <div class="sm:col-span-2">
            <label class="label">Website</label>
            <input v-model="form.website" class="input" placeholder="https://example.com" />
          </div>
        </div>
      </section>

      <!-- Address -->
      <section class="space-y-3 border-t border-slate-100 pt-4">
        <div class="text-xs font-bold uppercase tracking-widest text-slate-500">Address</div>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <label class="label">Street address 1</label>
            <input v-model="form.address_street1" class="input" placeholder="e.g. 123 Rizal St." />
          </div>
          <div class="sm:col-span-2">
            <label class="label">Street address 2</label>
            <input v-model="form.address_street2" class="input" placeholder="Optional" />
          </div>
          <div>
            <label class="label">City</label>
            <input v-model="form.city" class="input" />
          </div>
          <div>
            <label class="label">Province / State</label>
            <input v-model="form.province" class="input" />
          </div>
          <div>
            <label class="label">Postal code</label>
            <input v-model="form.postal_code" class="input font-mono" />
          </div>
          <div>
            <label class="label">Country</label>
            <input v-model="form.country" class="input" />
          </div>
        </div>
      </section>

      <!-- Tax & Receipt -->
      <section class="space-y-3 border-t border-slate-100 pt-4">
        <div class="text-xs font-bold uppercase tracking-widest text-slate-500">Tax &amp; Receipt</div>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label class="label">TIN</label>
            <input v-model="form.tin_number" class="input font-mono" placeholder="000-000-000-000" />
          </div>
          <div class="flex flex-col justify-end gap-2 sm:col-span-1">
            <label class="inline-flex items-center gap-2 text-sm">
              <input v-model="form.is_vat_registered" type="checkbox" class="h-4 w-4 rounded border-slate-300" />
              <span>VAT-registered</span>
            </label>
            <label class="inline-flex items-center gap-2 text-sm">
              <input v-model="form.show_tin_on_receipt" type="checkbox" class="h-4 w-4 rounded border-slate-300" />
              <span>Show TIN on receipt</span>
            </label>
            <label class="inline-flex items-center gap-2 text-sm">
              <input v-model="form.receipt_show_logo" type="checkbox" class="h-4 w-4 rounded border-slate-300" />
              <span>Show logo on receipt</span>
            </label>
          </div>
          <div class="sm:col-span-2">
            <label class="label">Receipt header text</label>
            <input v-model="form.receipt_header" class="input" placeholder="OFFICIAL RECEIPT" />
          </div>
          <div class="sm:col-span-2">
            <label class="label">Receipt footer text</label>
            <textarea v-model="form.receipt_footer" rows="2" class="input" placeholder="Thank you for choosing us!"></textarea>
          </div>
        </div>
      </section>

      <div v-if="formError" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
        {{ formError }}
      </div>
    </form>

    <template #footer>
      <button class="btn-secondary" :disabled="submitting" @click="handleClose">Cancel</button>
      <button class="btn-primary" :disabled="submitting" @click="submit">
        {{ submitting ? 'Saving…' : 'Create Tenant' }}
      </button>
    </template>
  </Modal>
</template>
