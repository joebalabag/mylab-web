<script setup>
defineProps({
  // Number of skeleton rows to render.
  rows: { type: Number, default: 8 },
  // Caption shown under the rows.
  label: { type: String, default: 'Loading…' },
  // Column shape. Each entry describes one placeholder cell:
  //   'thumb'  – 10×10 image placeholder
  //   'avatar' – 9×9 circle
  //   'lines'  – flex-1 with two text bars (title + subtitle)
  //   'bar'    – narrow bar
  //   'wide'   – wider bar (~24)
  //   'pill'   – rounded status pill
  //   'dot'    – small square (actions kebab, etc)
  columns: { type: Array, default: () => ['avatar', 'lines', 'bar', 'bar', 'pill', 'dot'] }
})
</script>

<template>
  <div>
    <div class="divide-y divide-slate-100 dark:divide-slate-800">
      <div
        v-for="i in rows" :key="`skel-${i}`"
        class="flex items-center gap-3 px-4 py-3 animate-pulse"
      >
        <template v-for="(c, idx) in columns" :key="idx">
          <div v-if="c === 'thumb'"  class="h-10 w-10 shrink-0 rounded-md bg-slate-200 dark:bg-slate-700"></div>
          <div v-else-if="c === 'avatar'" class="h-9 w-9 shrink-0 rounded-full bg-slate-200 dark:bg-slate-700"></div>
          <div v-else-if="c === 'lines'" class="flex-1 min-w-0 space-y-1.5">
            <div class="h-3 w-1/3 rounded bg-slate-200 dark:bg-slate-700"></div>
            <div class="h-2 w-1/4 rounded bg-slate-100 dark:bg-slate-800"></div>
          </div>
          <div v-else-if="c === 'bar'"   class="h-3 w-14 rounded bg-slate-100 dark:bg-slate-800"></div>
          <div v-else-if="c === 'wide'"  class="h-3 w-24 rounded bg-slate-100 dark:bg-slate-800"></div>
          <div v-else-if="c === 'pill'"  class="h-6 w-16 rounded-full bg-slate-100 dark:bg-slate-800"></div>
          <div v-else-if="c === 'dot'"   class="h-8 w-8 rounded bg-slate-100 dark:bg-slate-800"></div>
        </template>
      </div>
    </div>
    <div class="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
      {{ label }}
    </div>
  </div>
</template>
