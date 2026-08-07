<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { publicViewLabReport } from '../api/laboratory'
import { assetUrl } from '../api/client'
import { formatDate, formatDateTime } from '../utils/format'

const route = useRoute()
const loading = ref(true)
const errorMsg = ref('')
const report = ref(null)

onMounted(async () => {
  const token = String(route.query.t || route.params.token || '')
  if (!token) {
    errorMsg.value = 'Missing token.'
    loading.value = false
    return
  }
  try {
    report.value = await publicViewLabReport(token)
  } catch (e) {
    errorMsg.value = e?.message || 'Failed to load lab report.'
  } finally {
    loading.value = false
  }
})

// Column-visibility + option helpers, mirrored from LaboratoryView.
function lookupOptions(v) {
  const raw = String(v?.lookup_values || '').trim()
  if (!raw) return []
  return raw.split(',').map((s) => s.trim()).filter(Boolean)
}
function anyUnit(it)      { return (it.values || []).some((v) => !!(v.unit_of_measure && String(v.unit_of_measure).trim())) }
function anyReference(it) { return (it.values || []).some((v) => !!(v.reference_range && String(v.reference_range).trim())) }

function categoryHeaderStyle(report) {
  const raw = String(report?.item_category_color || '#64748b').trim()
  const m = /^#([0-9a-f]{6})$/i.exec(raw)
  let fill = 'rgba(100, 116, 139, 0.08)'
  if (m) {
    const r = parseInt(m[1].slice(0, 2), 16)
    const g = parseInt(m[1].slice(2, 4), 16)
    const b = parseInt(m[1].slice(4, 6), 16)
    fill = `rgba(${r}, ${g}, ${b}, 0.08)`
  }
  return { borderColor: raw, backgroundColor: fill }
}

function groupValuesBySection(values) {
  if (!Array.isArray(values) || !values.length) return []
  const map = new Map()
  const order = []
  for (const v of values) {
    const key = v.section || ''
    if (!map.has(key)) { map.set(key, []); order.push(key) }
    map.get(key).push(v)
  }
  return order.map((k) => ({ section: k, values: map.get(k) }))
}
function buildMatrixGrid(it) {
  const cfg = it?.matrix_config || {}
  const rows = Array.isArray(cfg.rows) ? cfg.rows : []
  const cols = Array.isArray(cfg.cols) ? cfg.cols : []
  const cells = new Map()
  for (const v of (it.values || [])) cells.set(v.component_code, v)
  return { rows, cols, cells }
}

function ageFromBirthdate(v) {
  if (!v) return ''
  const bd = v instanceof Date ? v : new Date(v)
  if (isNaN(bd.getTime())) return ''
  const now = new Date()
  let age = now.getFullYear() - bd.getFullYear()
  const m = now.getMonth() - bd.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < bd.getDate())) age--
  return age >= 0 ? age : ''
}

const headerMode = computed(() => report.value?.tenant?.lab_header_mode || 'logo_text')
const headerImage = computed(() => report.value?.tenant?.lab_header_image || '')
const headerText  = computed(() => report.value?.tenant?.lab_header_text  || '')
const tenantLogo  = computed(() => report.value?.tenant?.company_logo || '')
const tenantName  = computed(() => report.value?.tenant?.display_name || '')

// Split the header text into a "company name" (first non-blank line, larger)
// and the remaining lines (smaller). Fall back to tenant display_name when
// no header text is configured.
const headerCompanyName = computed(() => {
  const lines = String(headerText.value).split(/\r?\n/).map((s) => s.trim())
  const first = lines.find((l) => l.length > 0) || ''
  return first || tenantName.value
})
const headerRestLines = computed(() => {
  const lines = String(headerText.value).split(/\r?\n/)
  let dropped = false
  const out = []
  for (const l of lines) {
    if (!dropped && l.trim().length > 0) { dropped = true; continue }
    if (dropped) out.push(l)
  }
  return out.join('\n').trim()
})

function statusLabel(s) {
  if (s === 'finalized') return 'FINAL'
  if (s === 'draft')     return 'DRAFT'
  if (s === 'voided')    return 'VOIDED'
  return String(s || '').toUpperCase()
}
</script>

<template>
  <div class="min-h-screen bg-slate-100 py-6">
    <div class="mx-auto max-w-3xl px-4">
      <div v-if="loading" class="rounded-lg bg-white p-8 text-center text-sm text-slate-500 shadow">
        Loading lab report…
      </div>
      <div v-else-if="errorMsg" class="rounded-lg border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800 shadow">
        {{ errorMsg }}
      </div>
      <div v-else-if="report" class="relative rounded-lg bg-white p-6 text-sm text-slate-900 shadow sm:p-8">
        <!-- Result Header (image mode OR logo+text mode) -->
        <div v-if="headerMode === 'image' && headerImage" class="mb-4">
          <img :src="assetUrl(headerImage)" class="max-h-40 w-full object-contain" :alt="tenantName" />
        </div>
        <div v-else class="mb-4 flex items-start gap-4 border-b border-slate-200 pb-3">
          <img v-if="tenantLogo" :src="assetUrl(tenantLogo)" class="h-24 w-24 shrink-0 object-contain" :alt="tenantName" />
          <div class="min-w-0 flex-1 leading-tight">
            <div v-if="headerCompanyName" class="text-2xl font-bold text-slate-900 leading-snug">{{ headerCompanyName }}</div>
            <div v-if="headerRestLines" class="whitespace-pre-line text-sm text-slate-600">{{ headerRestLines }}</div>
          </div>
        </div>

        <!-- Draft watermark -->
        <div v-if="report.status === 'draft'"
             class="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
          <div class="rotate-[-30deg] text-[120px] font-black tracking-widest text-slate-200/60 select-none">DRAFT</div>
        </div>

        <div class="relative">
          <!-- Fixed-width right column so the three right-hand labels align. -->
          <div class="mb-3 space-y-0.5 text-xs">
            <div class="flex items-baseline justify-between gap-4">
              <div class="min-w-0">
                <span class="text-slate-500">Patient:</span>
                <span class="ml-1 font-medium">{{ [report.patient_first_name, report.patient_last_name].filter(Boolean).join(' ') || '—' }}</span>
                <span v-if="ageFromBirthdate(report.patient_birthdate) !== '' || report.patient_sex"
                      class="ml-1 text-slate-600">
                  · {{ ageFromBirthdate(report.patient_birthdate) !== '' ? `${ageFromBirthdate(report.patient_birthdate)} y/o` : '' }}
                  <span v-if="report.patient_sex" class="capitalize">{{ ageFromBirthdate(report.patient_birthdate) !== '' ? '· ' : '' }}{{ report.patient_sex }}</span>
                </span>
              </div>
              <div class="w-64 shrink-0 whitespace-nowrap text-left">
                <span class="text-slate-500">Laboratory #:</span>
                <span class="ml-1 font-mono font-semibold">{{ report.lab_number }}</span>
              </div>
            </div>
            <div class="flex items-baseline justify-between gap-4">
              <div class="min-w-0">
                <span class="text-slate-500">Case #:</span>
                <span class="ml-1">{{ report.patient_case_number || '—' }}</span>
                <span v-if="report.item_category_name" class="ml-2 text-slate-500">-
                  <span class="text-slate-700">{{ report.item_category_name }}</span></span>
              </div>
              <div class="w-64 shrink-0 whitespace-nowrap text-left">
                <span class="text-slate-500">Status:</span>
                <span class="ml-1 font-semibold" :class="report.status === 'finalized' ? 'text-emerald-700' : 'text-amber-700'">
                  {{ statusLabel(report.status) }}
                </span>
                <span v-if="report.finalized_at" class="ml-1 text-slate-500">{{ formatDateTime(report.finalized_at) }}</span>
              </div>
            </div>
            <div class="flex items-baseline justify-between gap-4 text-[11px] text-slate-500">
              <div class="min-w-0">
                Patient #: <span class="ml-0.5 text-slate-700 font-mono">{{ report.patient_number || '—' }}</span>
                <span class="ml-3">Requisition #: <span class="text-slate-700 font-mono">{{ report.requisition_number || '—' }}</span></span>
              </div>
              <div class="w-64 shrink-0 whitespace-nowrap text-left">Lab Created: <span class="text-slate-700">{{ formatDateTime(report.created_at) }}</span></div>
            </div>
          </div>

          <div v-if="report.item_category_print_title || report.item_category_name"
               class="my-3 flex items-center border-l-4 px-3 py-1"
               :style="categoryHeaderStyle(report)">
            <div class="text-sm font-bold tracking-wide text-slate-800">
              {{ report.item_category_print_title || report.item_category_name }}
            </div>
          </div>

          <div v-for="it in (report.items || [])" :key="it.uuid" class="mb-5">
            <div class="mb-1 border-b border-slate-200 pb-1">
              <div class="flex flex-wrap items-baseline gap-2">
                <div class="text-sm font-semibold">{{ it.test_name }}</div>
                <div class="text-[10px] font-mono text-slate-500">{{ it.test_code }}</div>
                <div v-if="it.specimen" class="text-[10px] text-slate-500">· specimen: {{ it.specimen }}</div>
              </div>
              <div v-if="it.method" class="text-[10px] italic text-slate-600">Method: {{ it.method }}</div>
            </div>
            <div v-if="it.result_type === 'single' || it.result_type === 'panel'">
              <table class="w-full text-xs">
                <thead class="text-[10px] uppercase text-slate-500">
                  <tr>
                    <th class="w-1/3 text-left font-semibold">Analyte</th>
                    <th class="text-left font-semibold">Result</th>
                    <th v-if="anyUnit(it)" class="w-16 text-left font-semibold">Unit</th>
                    <th v-if="anyReference(it)" class="w-40 text-left font-semibold">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="grp in groupValuesBySection(it.values)" :key="grp.section || 'none'">
                    <tr v-if="grp.section">
                      <td colspan="4" class="pt-2 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-700">
                        {{ grp.section }}
                      </td>
                    </tr>
                    <tr v-for="v in grp.values" :key="v.uuid" class="border-b border-slate-100">
                      <td class="py-1">{{ v.component_name }}</td>
                      <td class="py-1">{{ v.value_text || '' }}</td>
                      <td v-if="anyUnit(it)" class="py-1 text-slate-500">{{ v.unit_of_measure || '' }}</td>
                      <td v-if="anyReference(it)" class="py-1 text-slate-500">{{ v.reference_range || '' }}</td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
            <div v-else-if="it.result_type === 'matrix'">
              <table class="w-full text-xs border-collapse">
                <thead class="text-[10px] uppercase text-slate-500">
                  <tr>
                    <th class="text-left font-semibold border-b border-slate-200"></th>
                    <th v-for="c in buildMatrixGrid(it).cols" :key="c"
                        class="text-left font-semibold border-b border-slate-200 px-2">{{ c }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in buildMatrixGrid(it).rows" :key="r" class="border-b border-slate-100">
                    <td class="py-1 pr-3 font-medium text-slate-700">{{ r }}</td>
                    <td v-for="c in buildMatrixGrid(it).cols" :key="c" class="py-1 px-2">
                      {{ (buildMatrixGrid(it).cells.get(r+'|'+c) || {}).value_text || '' }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="whitespace-pre-wrap text-xs">{{ it.narrative_text || '—' }}</div>
          </div>

          <div v-if="report.remarks" class="mt-4 border-t border-slate-200 pt-2 text-xs">
            <span class="font-semibold">Remarks:</span> {{ report.remarks }}
          </div>

          <div class="mt-10 grid grid-cols-2 gap-8">
            <div>
              <div class="relative h-16"></div>
              <div class="border-b border-slate-400"></div>
              <div class="mt-1 text-center text-xs">
                <div class="font-semibold min-h-[1em]">{{ report.status === 'finalized' ? (report.medtech_name || '') : '' }}</div>
                <div class="min-h-[1em] text-[10px] text-slate-500">
                  <template v-if="report.status === 'finalized' && report.medtech_license">
                    Lic. No. {{ report.medtech_license }}
                  </template>
                  <template v-else>&nbsp;</template>
                </div>
                <div class="text-slate-500">{{ report.item_group_tester_role || 'Medical Technologist' }}</div>
              </div>
            </div>
            <div>
              <div class="relative h-16">
                <img v-if="report.status === 'finalized' && report.pathologist_esignature_image"
                     :src="assetUrl(report.pathologist_esignature_image)"
                     alt="signature"
                     class="absolute inset-x-0 bottom-0 mx-auto max-h-full max-w-[70%] object-contain" />
              </div>
              <div class="border-b border-slate-400"></div>
              <div class="mt-1 text-center text-xs">
                <div class="font-semibold min-h-[1em]">{{ report.status === 'finalized' ? (report.pathologist_name || '') : '' }}</div>
                <div class="min-h-[1em] text-[10px] text-slate-500">
                  <template v-if="report.status === 'finalized' && report.pathologist_license">
                    Lic. No. {{ report.pathologist_license }}
                  </template>
                  <template v-else>&nbsp;</template>
                </div>
                <div class="text-slate-500">Pathologist</div>
              </div>
            </div>
          </div>

          <div class="mt-6 border-t border-slate-200 pt-2 text-center text-[10px] text-slate-500">
            Viewed via secure link · {{ formatDateTime(new Date()) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
