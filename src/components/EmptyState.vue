<script setup>
defineProps({
  title:   { type: String, default: 'Nothing here yet' },
  message: { type: String, default: '' }
})
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-2 py-16 text-center text-slate-500 dark:text-slate-400 dark:text-slate-500">
    <svg viewBox="0 0 24 24" class="h-10 w-10 text-slate-300" fill="none" stroke="currentColor" stroke-width="1.5"
         stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="9"/>
      <path d="M8 15c1.2-1 2.6-1.5 4-1.5s2.8.5 4 1.5"/>
      <line x1="9" y1="10" x2="9" y2="10"/>
      <line x1="15" y1="10" x2="15" y2="10"/>
    </svg>
    <div class="text-sm font-semibold text-slate-700 dark:text-slate-200">{{ title }}</div>
    <div v-if="message" class="max-w-sm text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{{ message }}</div>
    <div class="mt-2"><slot /></div>
  </div>
</template>
