<script setup>
defineProps({
  label: String,
  value: [String, Number],
  hint: String,
  tone: { type: String, default: 'brand' } // brand, emerald, amber, rose
})

const toneMap = {
  brand:   'bg-brand-50   text-brand-700',
  emerald: 'bg-emerald-50 text-emerald-700',
  amber:   'bg-amber-50   text-amber-700',
  rose:    'bg-rose-50    text-rose-700'
}
</script>

<template>
  <div class="card">
    <div class="card-body flex items-start justify-between gap-3">
      <div>
        <div class="text-xs font-semibold uppercase tracking-wide text-slate-500">{{ label }}</div>
        <div class="mt-1 text-2xl font-bold text-slate-800">{{ value }}</div>
        <div v-if="hint" class="mt-1 text-xs text-slate-500">{{ hint }}</div>
      </div>
      <div :class="['flex h-10 w-10 items-center justify-center rounded-lg', toneMap[tone]]">
        <slot name="icon">
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8"
               stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20V10"/>
            <path d="M18 20V4"/>
            <path d="M6 20v-6"/>
          </svg>
        </slot>
      </div>
    </div>
  </div>
</template>
