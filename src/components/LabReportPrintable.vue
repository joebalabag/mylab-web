<script setup>
/**
 * Shared print block for a lab report. Same markup used by:
 *   - LaboratoryView.vue          (the real "Print Report" modal)
 *   - TestItemsView.vue           (the "Print Preview" of a test-item)
 *
 * Kept as a single-source-of-truth component so the two places stay in sync.
 * The wrapping `<div id="lab-print-area">` and inner `id="lab-print-header"`
 * / `id="lab-print-body"` markers are load-bearing — LaboratoryView.doPrint()
 * scrapes those IDs to restructure the content into a repeating-header
 * table for multi-page prints.
 */
import { computed } from 'vue'
import { assetUrl } from '../api/client'
import { formatDateTime } from '../utils/format'

const props = defineProps({
  // Report record — matches the shape returned by `/lab-report/view/:uuid`
  // (LaboratoryView) or a synthesized mock (TestItemsView preview).
  report: { type: Object, required: true },
  // Tenant snapshot for the header (name, logo, address, labHeaderMode/Image/Text).
  tenant: { type: Object, required: true },
  // Data-URL of the QR code for the public-share link. Optional — hidden if empty.
  qrDataUrl: { type: String, default: '' },
  // Physical paper height in CSS pixels — drives the body min-height so the
  // signature block pins to the bottom of a full page.
  paperHeight: { type: Number, default: 1056 },
})

// First non-blank line of the tenant's lab header text = "company name",
// printed larger. Falls back to the tenant display name.
const headerCompanyName = computed(() => {
  const raw = String(props.tenant?.labHeaderText || '').split(/\r?\n/).map((s) => s.trim())
  const first = raw.find((l) => l.length > 0) || ''
  return first || props.tenant?.name || ''
})
const headerRestLines = computed(() => {
  const raw = String(props.tenant?.labHeaderText || '')
  const lines = raw.split(/\r?\n/)
  let dropped = false
  const out = []
  for (const l of lines) {
    if (!dropped && l.trim().length > 0) { dropped = true; continue }
    if (dropped) out.push(l)
  }
  return out.join('\n').trim()
})

// Detailed age from a birthdate — "11Y-5M-4D" style. Returns '' when
// unparseable so callers can render '—' without a NaN. Day math borrows
// from the previous month's length (matches how clinicians speak an
// infant/child age, e.g. "0Y-2M-14D").
function ageFromBirthdate(v) {
  if (!v) return ''
  const bd = v instanceof Date ? v : new Date(v)
  if (isNaN(bd.getTime())) return ''
  const now = new Date()
  let years  = now.getFullYear() - bd.getFullYear()
  let months = now.getMonth()    - bd.getMonth()
  let days   = now.getDate()     - bd.getDate()
  if (days < 0) {
    months--
    // Days in the calendar month just before `now` — day 0 of current
    // month === last day of previous month.
    const prevMonthLen = new Date(now.getFullYear(), now.getMonth(), 0).getDate()
    days += prevMonthLen
  }
  if (months < 0) { years--; months += 12 }
  return `${years}Y-${months}M-${days}D`
}

// Normalize 'm' / 'male' / 'MALE' → 'Male' so the header reads cleanly
// regardless of how the patient record stores sex.
function formatSex(v) {
  if (!v) return ''
  const s = String(v).trim().toLowerCase()
  if (s === 'm' || s === 'male')   return 'Male'
  if (s === 'f' || s === 'female') return 'Female'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function anyUnit(it)      { return (it.values || []).some((v) => !!(v.unit_of_measure && String(v.unit_of_measure).trim())) }
function anyReference(it) { return (it.values || []).some((v) => !!(v.reference_range && String(v.reference_range).trim())) }

// Whether the Clinical-Chemistry flat layout applies: one continuous
// analyte table across every test item on the report, with panel
// components indented under their parent test name (instead of each
// item getting its own header block + isolated table). Chemistry-only
// by design — Hematology (which also uses the 'default' template) still
// prefers the per-item block layout for CBC/PBS-style panels.
const isChemistryFlat = computed(() => (props.report?.item_category_code || '') === 'CHEM')

function anyUnitAcross(items) {
  return (items || []).some((it) => anyUnit(it))
}
function anyReferenceAcross(items) {
  return (items || []).some((it) => anyReference(it))
}

// Group a panel's values by `section` snapshot, preserving display_order.
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
</script>

<template>
  <div id="lab-print-area" class="relative bg-white p-6 text-sm text-slate-900">
    <div v-if="report.status === 'draft'"
         class="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
      <div class="rotate-[-30deg] text-[128px] font-black tracking-widest text-slate-200/60 select-none">
        DRAFT
      </div>
    </div>

    <div class="relative">
      <div id="lab-print-header">
        <!-- Result Header — image-mode banner OR logo+text side-by-side,
             with the QR code pinned to the right. -->
        <div class="mb-4 flex items-start gap-4 border-b border-slate-300 pb-3">
          <div class="min-w-0 flex-1">
            <div v-if="tenant.labHeaderMode === 'image' && tenant.labHeaderImage">
              <img :src="assetUrl(tenant.labHeaderImage)" class="max-h-32 w-full object-contain"
                   :alt="tenant.name" />
            </div>
            <div v-else class="flex items-start gap-3">
              <img v-if="tenant.logo" :src="assetUrl(tenant.logo)"
                   class="h-24 w-24 shrink-0 object-contain" :alt="tenant.name" />
              <div class="min-w-0 flex-1 leading-tight">
                <div v-if="headerCompanyName" class="text-2xl font-bold text-slate-900 leading-snug">
                  {{ headerCompanyName }}
                </div>
                <div v-if="headerRestLines" class="whitespace-pre-line text-sm text-slate-600">
                  {{ headerRestLines }}
                </div>
              </div>
            </div>
          </div>
          <div v-if="qrDataUrl" class="shrink-0 text-center">
            <img :src="qrDataUrl" alt="Scan to view online" class="h-24 w-24" />
            <div class="mt-0.5 text-[9px] uppercase tracking-wider text-slate-500">Scan to view</div>
          </div>
        </div>

        <!-- Patient / report info block — 3 rows, left content + fixed
             right column. Uses the same flex + w-64 pattern the rest of
             this file uses; an earlier attempt with an arbitrary-value
             grid (grid-cols-[minmax(0,1fr)_16rem]) rendered fine on
             screen but blanked out the middle of the printed page when
             the header block was pushed into the popup's thead/td
             wrapper by doPrint(). Standard classes side-step whatever
             the print-engine was choking on.
             Row 1: Patient  Age | Sex             │ Laboratory #
             Row 2: Address                         │ Time Taken
             Row 3: Physician                       │ Status  Status Date -->
        <div class="mb-3 space-y-0.5 text-xs">
          <!-- Row 1 -->
          <div class="flex items-baseline gap-4">
            <div class="min-w-0 flex-1">
              <span class="text-slate-500">Patient:</span>
              <span class="ml-1 font-medium">{{ [report.patient_first_name, report.patient_last_name].filter(Boolean).join(' ') || '—' }}</span>
              <span class="ml-2 text-slate-700">
                <template v-if="ageFromBirthdate(report.patient_birthdate)">{{ ageFromBirthdate(report.patient_birthdate) }}</template>
                <template v-else>—</template>
                <template v-if="formatSex(report.patient_sex)"> | {{ formatSex(report.patient_sex) }}</template>
              </span>
            </div>
            <div class="w-64 shrink-0 whitespace-nowrap text-left">
              <span class="text-slate-500">Laboratory #:</span>
              <span class="ml-1 font-mono font-semibold">{{ report.lab_number || '—' }}</span>
            </div>
          </div>

          <!-- Row 2 -->
          <div class="flex items-baseline gap-4">
            <div class="min-w-0 flex-1">
              <span class="text-slate-500">Address:</span>
              <span class="ml-1">{{ report.patient_address || '—' }}</span>
            </div>
            <div class="w-64 shrink-0 whitespace-nowrap text-left">
              <span class="text-slate-500">Time Taken:</span>
              <span class="ml-1">{{ report.specimen_collected_at ? formatDateTime(report.specimen_collected_at) : '—' }}</span>
            </div>
          </div>

          <!-- Row 3 -->
          <div class="flex items-baseline gap-4">
            <div class="min-w-0 flex-1">
              <span class="text-slate-500">Physician:</span>
              <span class="ml-1">{{ report.physician || '—' }}</span>
            </div>
            <div class="w-64 shrink-0 whitespace-nowrap text-left">
              <span class="text-slate-500">Status:</span>
              <span class="ml-1 font-semibold" :class="report.status === 'finalized' ? 'text-emerald-700' : 'text-amber-700'">
                {{ (report.status || '').toUpperCase() || '—' }}
              </span>
              <span v-if="report.finalized_at" class="ml-1 text-slate-500">| {{ formatDateTime(report.finalized_at) }}</span>
            </div>
          </div>
        </div>
      </div><!-- /#lab-print-header -->

      <div id="lab-print-body"
           class="flex flex-col"
           :style="`min-height: ${paperHeight - 200}px;`">

        <!-- Colored category title band. -->
        <div v-if="report.item_category_print_title || report.item_category_name"
             class="my-1.5 flex items-center border-l-4 px-3 py-0.5 leading-tight"
             :style="categoryHeaderStyle(report)">
          <div class="text-sm font-bold tracking-wide text-slate-800 [word-spacing:0.4em]"
               :class="{ uppercase: !report.item_category_print_title }">
            {{ report.item_category_print_title || report.item_category_name }}
          </div>
        </div>

        <!-- Chemistry flat layout: one continuous analyte table across
             every test item. Panels show their name as a bold parent row
             and the components sit indented under it. Matrix / narrative
             items fall through to a full-width row.

             The `<table>` is wrapped in a `<div>` on purpose — `#lab-print-body`
             becomes `display: flex; flex-direction: column` in the print
             popup, and print engines handle table children of a flex
             column inconsistently (some collapse the table to 0 height,
             which prints as a blank page). Keeping every direct flex
             child a block-level div side-steps that quirk. -->
        <div v-if="isChemistryFlat">
          <table class="w-full text-xs leading-tight">
            <thead class="text-[10px] uppercase text-slate-500">
              <tr>
                <th class="w-1/3 text-left font-semibold">Analyte</th>
                <th class="text-left font-semibold">Result</th>
                <th v-if="anyUnitAcross(report.items)" class="w-16 text-left font-semibold">Unit</th>
                <th v-if="anyReferenceAcross(report.items)" class="w-56 whitespace-nowrap text-left font-semibold">Reference</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="it in (report.items || [])" :key="it.uuid">
                <template v-if="it.result_type === 'single'">
                  <tr v-for="v in (it.values || [])" :key="v.uuid" class="border-b border-slate-100">
                    <td class="py-px">{{ it.test_name }}</td>
                    <td class="py-px">{{ v.value_text || '' }}</td>
                    <td v-if="anyUnitAcross(report.items)" class="py-px text-slate-500">{{ v.unit_of_measure || '' }}</td>
                    <td v-if="anyReferenceAcross(report.items)" class="whitespace-nowrap py-px text-slate-500">{{ v.reference_range || '' }}</td>
                  </tr>
                </template>
                <template v-else-if="it.result_type === 'panel'">
                  <tr>
                    <td colspan="4" class="pt-1 py-px font-semibold text-slate-800">{{ it.test_name }}</td>
                  </tr>
                  <tr v-for="v in (it.values || [])" :key="v.uuid" class="border-b border-slate-100">
                    <td class="py-px pl-6">{{ v.component_name }}</td>
                    <td class="py-px">{{ v.value_text || '' }}</td>
                    <td v-if="anyUnitAcross(report.items)" class="py-px text-slate-500">{{ v.unit_of_measure || '' }}</td>
                    <td v-if="anyReferenceAcross(report.items)" class="whitespace-nowrap py-px text-slate-500">{{ v.reference_range || '' }}</td>
                  </tr>
                </template>
                <tr v-else>
                  <td colspan="4" class="py-1">
                    <div class="font-semibold text-slate-800">{{ it.test_name }}</div>
                    <div class="whitespace-pre-wrap text-xs leading-tight">{{ it.narrative_text || '—' }}</div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>

        <!-- Same flex-child-must-be-div rationale as the chemistry-flat
             wrapper above. Instead of `<template v-else>` (which unwraps
             to a per-item `<div>` list and worked historically), keep an
             explicit `<div v-else>` wrapper so the flex-column of
             `#lab-print-body` always sees a single block-level child
             for the results region — matches the chemistry-flat branch
             and dodges the same 0-height-in-print quirk. -->
        <div v-else>
        <div v-for="it in (report.items || [])" :key="it.uuid" class="mb-2">
          <div class="mb-0.5 border-b border-slate-200 pb-0.5 leading-tight">
            <div class="flex flex-wrap items-baseline gap-2">
              <div class="text-sm font-semibold text-slate-800">{{ it.test_name }}</div>
              <div class="text-[10px] font-mono text-slate-500">{{ it.test_code }}</div>
              <div v-if="it.specimen" class="text-[10px] text-slate-500">· specimen: {{ it.specimen }}</div>
            </div>
            <div v-if="it.method" class="text-[10px] italic leading-tight text-slate-600">Method: {{ it.method }}</div>
          </div>

          <div v-if="it.result_type === 'single' || it.result_type === 'panel'">
            <table class="w-full text-xs leading-tight">
              <thead class="text-[10px] uppercase text-slate-500">
                <tr>
                  <th class="w-1/3 text-left font-semibold">Analyte</th>
                  <th class="text-left font-semibold">Result</th>
                  <th v-if="anyUnit(it)" class="w-16 text-left font-semibold">Unit</th>
                  <th v-if="anyReference(it)" class="w-56 whitespace-nowrap text-left font-semibold">Reference</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="grp in groupValuesBySection(it.values)" :key="grp.section || 'none'">
                  <tr v-if="grp.section">
                    <td colspan="4" class="pt-0.5 pb-0 text-[10px] font-bold uppercase tracking-wider text-slate-700 [word-spacing:0.35em]">
                      {{ grp.section }}
                    </td>
                  </tr>
                  <tr v-for="v in grp.values" :key="v.uuid" class="border-b border-slate-100">
                    <td class="py-px">{{ v.component_name }}</td>
                    <td class="py-px">{{ v.value_text || '' }}</td>
                    <td v-if="anyUnit(it)" class="py-px text-slate-500">{{ v.unit_of_measure || '' }}</td>
                    <td v-if="anyReference(it)" class="whitespace-nowrap py-px text-slate-500">{{ v.reference_range || '' }}</td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
          <div v-else-if="it.result_type === 'matrix'">
            <table class="w-full text-xs leading-tight border-collapse">
              <thead class="text-[10px] uppercase text-slate-500">
                <tr>
                  <th class="text-left font-semibold border-b border-slate-200"></th>
                  <th v-for="c in buildMatrixGrid(it).cols" :key="c"
                      class="text-left font-semibold border-b border-slate-200 px-2">{{ c }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in buildMatrixGrid(it).rows" :key="r" class="border-b border-slate-100">
                  <td class="py-px pr-3 font-medium text-slate-700">{{ r }}</td>
                  <td v-for="c in buildMatrixGrid(it).cols" :key="c" class="py-px px-2">
                    {{ (buildMatrixGrid(it).cells.get(r+'|'+c) || {}).value_text || '' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="whitespace-pre-wrap text-xs leading-tight">{{ it.narrative_text || '—' }}</div>
        </div>
        </div>

        <div v-if="report.remarks" class="mt-1 border-t border-slate-200 pt-1 text-xs leading-tight">
          <span class="font-semibold">Remarks:</span> {{ report.remarks }}
        </div>

        <!-- Signature block. mt-16 gives on-screen breathing room; pt-10
             is a *minimum* gap that survives the print popup's
             `margin-top: auto` (which collapses to ~0 when the results
             table already fills the page and leaves no free space for
             the flex layout to distribute).

             Layout: outer 2-col grid = tester(s) on the left, pathologist
             on the right. When medtech2_name is present (tenant runs with
             tester_signatory_count = 2 AND the finalizer differed from
             the creator), the tester cell nests a 2-col grid so both
             signatures print side-by-side. Otherwise the single medtech
             cell fills the left column as before. -->
        <div class="lab-signature-block mt-16 pt-10 grid grid-cols-2 gap-8">
          <div v-if="report.medtech2_name" class="grid grid-cols-2 gap-4">
            <div>
              <div class="border-b border-slate-400"></div>
              <div class="relative mt-1 text-center text-xs">
                <div class="font-semibold min-h-[1em]">
                  {{ report.status === 'finalized' ? (report.medtech_name || '') : '' }}
                </div>
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
              <div class="border-b border-slate-400"></div>
              <div class="relative mt-1 text-center text-xs">
                <div class="font-semibold min-h-[1em]">
                  {{ report.status === 'finalized' ? (report.medtech2_name || '') : '' }}
                </div>
                <div class="min-h-[1em] text-[10px] text-slate-500">
                  <template v-if="report.status === 'finalized' && report.medtech2_license">
                    Lic. No. {{ report.medtech2_license }}
                  </template>
                  <template v-else>&nbsp;</template>
                </div>
                <div class="text-slate-500">{{ report.item_group_tester_role || 'Medical Technologist' }}</div>
              </div>
            </div>
          </div>
          <div v-else>
            <div class="border-b border-slate-400"></div>
            <div class="relative mt-1 text-center text-xs">
              <div class="font-semibold min-h-[1em]">
                {{ report.status === 'finalized' ? (report.medtech_name || '') : '' }}
              </div>
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
            <div class="border-b border-slate-400"></div>
            <div class="relative mt-1 text-center text-xs">
              <img v-if="report.status === 'finalized' && report.pathologist_esignature_image"
                   :src="assetUrl(report.pathologist_esignature_image)"
                   alt="signature"
                   class="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-3/4 max-h-14 max-w-[70%] object-contain" />
              <div class="font-semibold min-h-[1em]">
                {{ report.status === 'finalized' ? (report.pathologist_name || '') : '' }}
              </div>
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

        <div class="mt-2 border-t border-slate-200 pt-1 text-[10px] leading-tight text-slate-500">
          Printed: {{ formatDateTime(new Date()) }}
        </div>
      </div><!-- /#lab-print-body -->
    </div>
  </div>
</template>
