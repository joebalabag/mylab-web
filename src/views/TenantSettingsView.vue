<script setup>
import { ref, computed, watch, reactive, onMounted, onBeforeUnmount } from 'vue'
import { useTenantStore } from '../stores/tenant'
import { useDoctorsStore } from '../stores/doctors'
import { useAuthStore } from '../stores/auth'
import { DOCTOR_SPECIALTIES } from '../api/doctors'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import Modal from '../components/Modal.vue'
import { assetUrl } from '../api/client'

const tenant  = useTenantStore()
const doctors = useDoctorsStore()
const auth    = useAuthStore()

// Roles that may edit company settings. The API doesn't gate this endpoint,
// but the UI does — store admins & managers (or a platform super-admin) can save.
const canEdit = computed(() => {
  if (auth.user?.type === 'admin') return true          // platform super-admin token
  const r = (auth.role || '').toLowerCase()
  return r === 'admin' || r === 'manager'
})

/* --- Draft mirrors tenant.current for the editable form --- */
const draft = reactive({ ...tenant.current })
watch(() => tenant.current, (v) => Object.assign(draft, v), { deep: true })

const dirty = computed(() =>
  JSON.stringify(draft) !== JSON.stringify(tenant.current)
  || !!logoFile.value
  || !!labHeaderFile.value
)

/* --- Toast --- */
const toast = ref({ show: false, tone: 'emerald', msg: '' })
let toastTimer = null
function flash(msg, tone = 'emerald') {
  toast.value = { show: true, tone, msg }
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value.show = false), 2400)
}

/* --- Load from server on mount --- */
const loading = ref(false)
const loadError = ref('')
async function reloadFromServer() {
  if (!tenant.current?.uuid) {
    loadError.value = 'No tenant is bound to this session yet.'
    return
  }
  loading.value = true
  loadError.value = ''
  try {
    await tenant.loadCurrentFromApi()
  } catch (e) {
    loadError.value = e?.message || 'Failed to load company settings'
  } finally {
    loading.value = false
  }
}
async function reloadDoctors() {
  try { await doctors.fetch({ page_number: 0, page_size: 500 }) }
  catch (_) { /* non-fatal — card just shows empty */ }
}
onMounted(async () => {
  await reloadFromServer()
  await reloadDoctors()
})

/* --- Doctors CRUD — independent of the Company Settings save button --- */
const showDoctorModal = ref(false)
const editingDoctor   = ref(null)
const doctorForm      = ref({ name: '', license_number: '', specialty: 'Pathologist' })
const doctorFile      = ref(null)
const doctorObjectUrl = ref('')
const doctorError     = ref('')
const savingDoctor    = ref(false)
const confirmDeleteDoctor = ref({ show: false, doc: null })

function releaseDoctorObjectUrl() {
  if (doctorObjectUrl.value) URL.revokeObjectURL(doctorObjectUrl.value)
  doctorObjectUrl.value = ''
}
onBeforeUnmount(releaseDoctorObjectUrl)

function openAddDoctor() {
  editingDoctor.value = null
  doctorForm.value = { name: '', license_number: '', specialty: 'Pathologist' }
  doctorFile.value = null
  releaseDoctorObjectUrl()
  doctorError.value = ''
  showDoctorModal.value = true
}
function openEditDoctor(d) {
  editingDoctor.value = d
  doctorForm.value = {
    name: d.name || '',
    license_number: d.license_number || '',
    specialty: d.specialty || 'Pathologist',
  }
  doctorFile.value = null
  releaseDoctorObjectUrl()
  doctorError.value = ''
  showDoctorModal.value = true
}
function onDoctorFilePick(e) {
  const file = e.target.files?.[0]
  if (!file) return
  // PNG-only guard — API rejects anything else and the print layer relies
  // on transparent-background PNG so the signature overlays the sig line.
  const isPng = file.type === 'image/png' || /\.png$/i.test(file.name)
  if (!isPng) {
    doctorError.value = 'E-signature must be a PNG image (transparent background recommended).'
    e.target.value = ''
    return
  }
  doctorError.value = ''
  doctorFile.value = file
  releaseDoctorObjectUrl()
  doctorObjectUrl.value = URL.createObjectURL(file)
}
function discardDoctorFile() {
  doctorFile.value = null
  releaseDoctorObjectUrl()
}
const doctorPreviewSrc = computed(() =>
  doctorObjectUrl.value ||
  (editingDoctor.value?.esignature_image ? assetUrl(editingDoctor.value.esignature_image) : '')
)

async function saveDoctor() {
  doctorError.value = ''
  const name = doctorForm.value.name.trim()
  const specialty = doctorForm.value.specialty
  if (!name)      { doctorError.value = 'Doctor name is required'; return }
  if (!specialty) { doctorError.value = 'Specialty is required'; return }
  const basePayload = {
    name,
    license_number: doctorForm.value.license_number.trim() || undefined,
    specialty,
  }
  savingDoctor.value = true
  try {
    if (editingDoctor.value) {
      // Update never accepts tenant_uuid — the row is scoped by its own uuid
      // and the DTO whitelists this field out (would 400 with "should not exist").
      await doctors.update(editingDoctor.value.uuid, basePayload, doctorFile.value || undefined)
      flash(`Updated ${name}`)
    } else {
      // Create allows tenant_uuid (admin-only override); default to current tenant.
      await doctors.create({ ...basePayload, tenant_uuid: tenant.current?.uuid }, doctorFile.value || undefined)
      flash(`Added ${name}`)
    }
    showDoctorModal.value = false
    discardDoctorFile()
  } catch (e) {
    doctorError.value = e?.message || 'Failed to save doctor'
  } finally {
    savingDoctor.value = false
  }
}
async function doDeleteDoctor() {
  const doc = confirmDeleteDoctor.value.doc
  confirmDeleteDoctor.value = { show: false, doc: null }
  try {
    await doctors.remove(doc.uuid)
    flash(`Removed ${doc.name}`)
  } catch (e) {
    flash(e?.message || 'Failed to delete doctor', 'rose')
  }
}


/* --- Logo upload (File → multipart) --- */
const logoFile = ref(null)
const logoObjectUrl = ref('')

function releaseObjectUrl() {
  if (logoObjectUrl.value) URL.revokeObjectURL(logoObjectUrl.value)
  logoObjectUrl.value = ''
}

function onLogoUpload(e) {
  const file = e.target.files?.[0]
  if (!file) return
  logoFile.value = file
  releaseObjectUrl()
  logoObjectUrl.value = URL.createObjectURL(file)
}
function discardLogoPick() {
  logoFile.value = null
  releaseObjectUrl()
}

// Preview src: prefer freshly-picked file, else current server logo.
const logoPreviewSrc = computed(() =>
  logoObjectUrl.value || (draft.logo ? assetUrl(draft.logo) : '')
)

/* --- Lab report header image upload (separate multipart field) --- */
const labHeaderFile = ref(null)
const labHeaderObjectUrl = ref('')

function releaseLabHeaderObjectUrl() {
  if (labHeaderObjectUrl.value) URL.revokeObjectURL(labHeaderObjectUrl.value)
  labHeaderObjectUrl.value = ''
}
onBeforeUnmount(() => { releaseObjectUrl(); releaseLabHeaderObjectUrl() })

function onLabHeaderUpload(e) {
  const file = e.target.files?.[0]
  if (!file) return
  labHeaderFile.value = file
  releaseLabHeaderObjectUrl()
  labHeaderObjectUrl.value = URL.createObjectURL(file)
}
function discardLabHeaderPick() {
  labHeaderFile.value = null
  releaseLabHeaderObjectUrl()
}
const labHeaderPreviewSrc = computed(() =>
  labHeaderObjectUrl.value || (draft.labHeaderImage ? assetUrl(draft.labHeaderImage) : '')
)

// Generate a 1600×400 PNG "guide" showing the recommended header dimensions
// with a safe-area outline and centered instructions, then trigger a browser
// download. Client-side canvas — no server round-trip, no shipped asset.
function downloadHeaderTemplate() {
  const W = 1600, H = 400
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  // Background
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)
  // Outer safe-area frame (24px inset)
  ctx.strokeStyle = '#cbd5e1'
  ctx.setLineDash([12, 8])
  ctx.lineWidth = 2
  ctx.strokeRect(24, 24, W - 48, H - 48)
  ctx.setLineDash([])
  // Corner tick marks (bleed markers)
  ctx.fillStyle = '#94a3b8'
  const tick = 20
  ;[[0, 0], [W - tick, 0], [0, H - tick], [W - tick, H - tick]].forEach(([x, y]) => {
    ctx.fillRect(x, y, tick, 4)
    ctx.fillRect(x, y, 4, tick)
  })
  // Centered instruction text
  ctx.fillStyle = '#334155'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = 'bold 36px system-ui, -apple-system, Segoe UI, sans-serif'
  ctx.fillText('Lab Report Header — Template', W / 2, H / 2 - 32)
  ctx.font = '24px system-ui, -apple-system, Segoe UI, sans-serif'
  ctx.fillStyle = '#64748b'
  ctx.fillText(`Recommended: ${W} × ${H} px  ·  Aspect 4:1`, W / 2, H / 2 + 12)
  ctx.font = '18px system-ui, -apple-system, Segoe UI, sans-serif'
  ctx.fillStyle = '#94a3b8'
  ctx.fillText('Keep the important content inside the dashed safe area.', W / 2, H / 2 + 48)
  // Trigger download
  canvas.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'lab-report-header-template-1600x400.png'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, 'image/png')
}

/* --- Save --- */
const saving = ref(false)
async function save() {
  if (!canEdit.value) return
  saving.value = true
  try {
    // Save local-only tenant field FIRST so a later API failure can't drop it.
    tenant.update({ currencySymbol: draft.currencySymbol })

    const apiPayload = {
      display_name:       draft.name,
      legal_name:         draft.legalName,
      owner_name:         draft.ownerName,
      store_code:         draft.code,
      branch:             draft.branch,
      terminal_id:        draft.terminalId,
      currency:           draft.currency,
      address_street1:    draft.address1,
      address_street2:    draft.address2,
      city:               draft.city,
      province:           draft.province,
      postal_code:        draft.postalCode,
      country:            draft.country,
      contact_number:     draft.phone,
      email_address:      draft.email,
      website:            draft.website,
      tin_number:         draft.tin,
      is_vat_registered:  !!draft.vatRegistered,
      lab_header_mode:    draft.labHeaderMode || 'logo_text',
      lab_header_text:    draft.labHeaderText || '',
      receipt_header:     draft.receiptHeader || ''
    }
    await tenant.updateCurrentViaApi(apiPayload, {
      company_logo:     logoFile.value || undefined,
      lab_header_image: labHeaderFile.value || undefined
    })
    logoFile.value = null
    releaseObjectUrl()
    labHeaderFile.value = null
    releaseLabHeaderObjectUrl()
    flash('Store settings saved ✓')
  } catch (e) {
    flash(e?.message || 'Failed to save settings', 'rose')
  } finally {
    saving.value = false
  }
}

function discard() {
  Object.assign(draft, tenant.current)
  discardLogoPick()
  discardLabHeaderPick()
}

</script>

<template>
  <div class="space-y-4">
    <!-- Header / actions -->
    <div class="card">
      <div class="card-body flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div class="text-sm font-semibold text-slate-800">Company Settings</div>
          <div class="text-xs text-slate-500">
            Company info, address, and contact details.
            <span class="font-mono">UUID: {{ tenant.uuid }}</span>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span v-if="loading" class="text-xs text-brand-600">Loading…</span>
          <span v-if="dirty" class="badge-warn">Unsaved changes</span>
          <button class="btn-ghost !text-xs" :disabled="loading" @click="reloadFromServer">
            Reload from server
          </button>
          <button class="btn-secondary" :disabled="!dirty || saving" @click="discard">Discard</button>
          <button class="btn-primary" :disabled="!dirty || !canEdit || saving" @click="save">
            {{ saving ? 'Saving…' : 'Save changes' }}
          </button>
        </div>
      </div>

      <transition name="fade">
        <div v-if="toast.show"
             class="border-t px-4 py-2 text-sm"
             :class="toast.tone === 'emerald'
                     ? 'border-emerald-100 bg-emerald-50 text-emerald-800'
                     : 'border-rose-100 bg-rose-50 text-rose-800'">
          {{ toast.msg }}
        </div>
      </transition>

      <div v-if="loadError" class="border-t border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-700">
        {{ loadError }}
      </div>

      <div v-if="!canEdit" class="border-t border-slate-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
        You are signed in as <b>{{ auth.role || auth.user?.type || 'guest' }}</b>. Only a store <b>admin</b> or <b>manager</b> can save changes to company settings.
      </div>
    </div>

    <div class="space-y-4">
        <!-- Identity -->
        <div class="card">
          <div class="card-header">
            <div>
              <div class="text-sm font-semibold text-slate-800">Company Identity</div>
              <div class="text-xs text-slate-500">Displayed on receipts and reports</div>
            </div>
          </div>
          <div class="card-body grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                <label class="btn-secondary cursor-pointer !text-xs" :class="!canEdit && 'opacity-50 pointer-events-none'">
                  {{ draft.logo || logoFile ? 'Replace' : 'Upload' }}
                  <input type="file" accept="image/*" class="hidden" @change="onLogoUpload" />
                </label>
                <button v-if="logoFile" class="btn-ghost !text-xs" @click="discardLogoPick">Discard pick</button>
              </div>
              <p class="mt-1 text-[11px] text-slate-500">
                JPG, PNG, WebP, GIF or SVG · up to 5 MB.
                <span class="italic">Removing an existing logo isn't supported by the API — you can only replace it.</span>
              </p>
            </div>

            <!-- Names -->
            <div class="sm:col-span-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label class="label">Display Name</label>
                <input v-model="draft.name" :disabled="!canEdit" class="input" />
              </div>
              <div>
                <label class="label">Legal Name</label>
                <input v-model="draft.legalName" :disabled="!canEdit" class="input" />
              </div>
              <div>
                <label class="label">Owner Name</label>
                <input v-model="draft.ownerName" :disabled="!canEdit" autocomplete="name" class="input" />
              </div>
              <div>
                <label class="label">Store Code</label>
                <input v-model="draft.code" :disabled="!canEdit" class="input uppercase" />
              </div>
              <div>
                <label class="label">Branch</label>
                <input v-model="draft.branch" :disabled="!canEdit" class="input" />
              </div>
              <div>
                <label class="label">Terminal ID</label>
                <input v-model="draft.terminalId" :disabled="!canEdit" class="input font-mono" />
              </div>
              <div>
                <label class="label">Currency</label>
                <div class="grid grid-cols-2 gap-2">
                  <input v-model="draft.currency" :disabled="!canEdit" class="input" placeholder="PHP" />
                  <input v-model="draft.currencySymbol" :disabled="!canEdit" class="input text-center" placeholder="₱" />
                </div>
                <p class="mt-1 text-[11px] text-slate-500">
                  <span class="font-semibold">currency</span> is synced with the server.
                  <span class="text-amber-700"><span class="font-semibold">currencySymbol</span> is not in the API</span> — kept locally only.
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Address -->
        <div class="card">
          <div class="card-header">
            <div class="text-sm font-semibold text-slate-800">Address</div>
          </div>
          <div class="card-body grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div class="sm:col-span-2">
              <label class="label">Street Address 1</label>
              <input v-model="draft.address1" :disabled="!canEdit" class="input" />
            </div>
            <div class="sm:col-span-2">
              <label class="label">Street Address 2</label>
              <input v-model="draft.address2" :disabled="!canEdit" class="input" />
            </div>
            <div>
              <label class="label">City</label>
              <input v-model="draft.city" :disabled="!canEdit" class="input" />
            </div>
            <div>
              <label class="label">Province / State</label>
              <input v-model="draft.province" :disabled="!canEdit" class="input" />
            </div>
            <div>
              <label class="label">Postal Code</label>
              <input v-model="draft.postalCode" :disabled="!canEdit" class="input" />
            </div>
            <div>
              <label class="label">Country</label>
              <input v-model="draft.country" :disabled="!canEdit" class="input" />
            </div>
          </div>
        </div>

        <!-- Contact -->
        <div class="card">
          <div class="card-header">
            <div class="text-sm font-semibold text-slate-800">Contact</div>
          </div>
          <div class="card-body grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label class="label">Phone</label>
              <input v-model="draft.phone" :disabled="!canEdit" class="input" />
            </div>
            <div>
              <label class="label">Email</label>
              <input type="email" v-model="draft.email" :disabled="!canEdit" class="input" />
            </div>
            <div>
              <label class="label">Website</label>
              <input v-model="draft.website" :disabled="!canEdit" class="input" />
            </div>
          </div>
        </div>

        <!-- Lab Report Header -->
        <div class="card">
          <div class="card-header">
            <div>
              <div class="text-sm font-semibold text-slate-800">Lab Report Result Header</div>
              <div class="text-xs text-slate-500">Rendered at the top of every printed lab report.</div>
            </div>
          </div>
          <div class="card-body space-y-3">
            <div class="flex flex-wrap gap-4">
              <label class="inline-flex items-center gap-2 text-sm">
                <input type="radio" value="logo_text" v-model="draft.labHeaderMode" :disabled="!canEdit" />
                <span>Logo + text</span>
              </label>
              <label class="inline-flex items-center gap-2 text-sm">
                <input type="radio" value="image" v-model="draft.labHeaderMode" :disabled="!canEdit" />
                <span>Full-width image</span>
              </label>
            </div>

            <div v-if="draft.labHeaderMode !== 'image'">
              <label class="label">Header text</label>
              <textarea v-model="draft.labHeaderText" :disabled="!canEdit"
                        rows="4" maxlength="2000" class="input"
                        placeholder="Clinic name&#10;Address line 1&#10;Address line 2&#10;Contact number · Email"></textarea>
              <p class="mt-1 text-[11px] text-slate-500">
                Printed on the right side of the header, next to the company logo above.
              </p>
            </div>

            <div v-else>
              <label class="label">Header banner image</label>
              <div class="flex min-h-[8rem] items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50">
                <img v-if="labHeaderPreviewSrc" :src="labHeaderPreviewSrc" class="max-h-40 w-full object-contain" />
                <div v-else class="text-center text-xs text-slate-500 p-4">
                  Upload a wide banner (e.g. 1600×400) that fills the report header.
                </div>
              </div>
              <div class="mt-2 flex flex-wrap gap-2">
                <label class="btn-secondary cursor-pointer !text-xs" :class="!canEdit && 'opacity-50 pointer-events-none'">
                  {{ draft.labHeaderImage || labHeaderFile ? 'Replace' : 'Upload' }}
                  <input type="file" accept="image/*" class="hidden" @change="onLabHeaderUpload" />
                </label>
                <button v-if="labHeaderFile" class="btn-ghost !text-xs" @click="discardLabHeaderPick">Discard pick</button>
                <button type="button" class="btn-ghost !text-xs" @click="downloadHeaderTemplate">
                  ⬇ Download template (1600×400 PNG)
                </button>
              </div>
              <p class="mt-1 text-[11px] text-slate-500">
                Recommended: <b>1600 × 400 px</b> (aspect 4:1). JPG, PNG, WebP, GIF or SVG · up to 5 MB. Renders full-width on the report; pick artwork with good contrast against white paper.
              </p>
            </div>
          </div>
        </div>

        <!-- Cashier Receipt Header -->
        <div class="card">
          <div class="card-header">
            <div>
              <div class="text-sm font-semibold text-slate-800">Cashier Receipt Header</div>
              <div class="text-xs text-slate-500">
                Printed at the top of every cashier receipt (payment slip). Leave blank to auto-generate
                from the company name and address above.
              </div>
            </div>
          </div>
          <div class="card-body">
            <label class="label">Header text</label>
            <textarea v-model="draft.receiptHeader" :disabled="!canEdit"
                      rows="4" maxlength="500" class="input"
                      placeholder="COMPANY NAME&#10;Address line&#10;Tel: +63 000 000 0000"></textarea>
            <p class="mt-1 text-[11px] text-slate-500">
              Each line is centered on the receipt. Blank lines are preserved.
            </p>
          </div>
        </div>

        <!-- Tax / Registration -->
        <!-- Doctors — signatories for lab / imaging reports. Independent
             CRUD: add/edit/delete each doctor saves on its own, not tied to
             the Company Settings save button. -->
        <div class="card">
          <div class="card-header flex items-center justify-between">
            <div>
              <div class="text-sm font-semibold text-slate-800">Doctors</div>
              <div class="text-xs text-slate-500">
                Pathologists, radiologists and other signatories that sign off on generated reports.
              </div>
            </div>
            <button v-if="canEdit" class="btn-primary !text-xs" @click="openAddDoctor">+ Add Doctor</button>
          </div>
          <div class="card-body">
            <div v-if="!doctors.items.length && !doctors.loading"
                 class="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-500">
              No doctors yet. Click <b>+ Add Doctor</b> to create one.
            </div>
            <table v-else class="w-full text-sm">
              <thead class="text-[10px] uppercase text-slate-500">
                <tr class="border-b border-slate-200">
                  <th class="w-16 py-1.5 text-left font-semibold">Sign.</th>
                  <th class="py-1.5 text-left font-semibold">Name</th>
                  <th class="py-1.5 text-left font-semibold">Specialty</th>
                  <th class="py-1.5 text-left font-semibold">License #</th>
                  <th class="w-32 py-1.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="d in doctors.items" :key="d.uuid" class="border-b border-slate-100">
                  <td class="py-1.5">
                    <img v-if="d.esignature_image" :src="assetUrl(d.esignature_image)"
                         class="h-8 max-w-[3rem] object-contain" alt="signature" />
                    <span v-else class="text-[10px] text-slate-400">—</span>
                  </td>
                  <td class="py-1.5 text-slate-800">{{ d.name }}</td>
                  <td class="py-1.5 text-slate-600">{{ d.specialty }}</td>
                  <td class="py-1.5 font-mono text-[11px] text-slate-500">{{ d.license_number || '—' }}</td>
                  <td class="py-1.5 text-right">
                    <button class="btn-secondary !py-0.5 !text-[11px]" @click="openEditDoctor(d)">Edit</button>
                    <button v-if="canEdit"
                            class="ml-1 rounded p-1 text-rose-500 hover:bg-rose-50 hover:text-rose-700"
                            @click="confirmDeleteDoctor = { show: true, doc: d }" title="Remove">
                      <svg viewBox="0 0 24 24" class="h-3.5 w-3.5 inline" fill="none" stroke="currentColor" stroke-width="2"
                           stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                        <path d="M10 11v6M14 11v6"/>
                      </svg>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="text-sm font-semibold text-slate-800">Tax &amp; Registration</div>
          </div>
          <div class="card-body grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label class="label">TIN</label>
              <input v-model="draft.tin" :disabled="!canEdit" class="input font-mono" placeholder="000-000-000-000" />
            </div>
            <div class="flex items-center gap-4 sm:col-span-2">
              <label class="mt-6 inline-flex items-center gap-2 text-sm">
                <input type="checkbox" v-model="draft.vatRegistered" :disabled="!canEdit" class="h-4 w-4" />
                <span class="font-medium text-slate-700">VAT-registered</span>
              </label>
            </div>
          </div>
        </div>

    </div>

    <!-- Doctor add / edit modal (independent save; doesn't touch Company Settings) -->
    <Modal :show="showDoctorModal"
           :title="editingDoctor ? 'Edit Doctor' : 'Add Doctor'"
           size="md" @close="showDoctorModal = false">
      <div class="space-y-3">
        <div>
          <label class="label">Name</label>
          <input v-model="doctorForm.name" maxlength="255" class="input" placeholder="Joe P. Balabag, M.D." />
        </div>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label class="label">Specialty</label>
            <select v-model="doctorForm.specialty" class="input">
              <option v-for="s in DOCTOR_SPECIALTIES" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>
          <div>
            <label class="label">License # <span class="text-slate-400">(optional)</span></label>
            <input v-model="doctorForm.license_number" maxlength="100" class="input font-mono" placeholder="00112233" />
          </div>
        </div>
        <div>
          <label class="label">E-signature <span class="text-slate-400">(optional)</span></label>
          <div class="flex h-24 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50">
            <img v-if="doctorPreviewSrc" :src="doctorPreviewSrc" class="max-h-full max-w-full object-contain" />
            <div v-else class="text-center text-xs text-slate-500">No signature uploaded</div>
          </div>
          <div class="mt-2 flex flex-wrap gap-2">
            <label class="btn-secondary cursor-pointer !text-xs">
              {{ editingDoctor?.esignature_image || doctorFile ? 'Replace' : 'Upload' }} PNG
              <input type="file" accept="image/png,.png" class="hidden" @change="onDoctorFilePick" />
            </label>
            <button v-if="doctorFile" class="btn-ghost !text-xs" @click="discardDoctorFile">Discard pick</button>
          </div>
          <p class="mt-1 text-[11px] text-slate-500">
            PNG with transparent background recommended. JPG / PNG / WebP / SVG up to 5 MB.
          </p>
        </div>
        <div v-if="doctorError" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ doctorError }}
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" :disabled="savingDoctor" @click="showDoctorModal = false">Cancel</button>
        <button class="btn-primary" :disabled="savingDoctor" @click="saveDoctor">
          {{ savingDoctor ? 'Saving…' : (editingDoctor ? 'Save' : 'Add') }}
        </button>
      </template>
    </Modal>

    <ConfirmDialog
      :show="confirmDeleteDoctor.show"
      title="Remove doctor"
      :message="confirmDeleteDoctor.doc ? `Permanently remove ${confirmDeleteDoctor.doc.name}?` : ''"
      confirm-text="Remove"
      @close="confirmDeleteDoctor = { show: false, doc: null }"
      @confirm="doDeleteDoctor"
    />
  </div>
</template>
