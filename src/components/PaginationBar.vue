<script setup>
import { computed } from 'vue'

// Frontend pagination bar. Emits update:page / update:pageSize so callers can
// v-model the two ends. `total` is the full unpaged row count.
const props = defineProps({
  page:     { type: Number,  default: 1 },
  pageSize: { type: Number,  default: 20 },
  total:    { type: Number,  default: 0 },
  sizes:    { type: Array,   default: () => [20, 50, 100, 200, 500] }
})
const emit = defineEmits(['update:page', 'update:pageSize'])

const totalPages = computed(() =>
  Math.max(1, Math.ceil((Number(props.total) || 0) / Math.max(1, Number(props.pageSize) || 1)))
)
const clampedPage = computed(() =>
  Math.min(Math.max(1, Number(props.page) || 1), totalPages.value)
)
const firstOnPage = computed(() =>
  props.total > 0 ? ((clampedPage.value - 1) * props.pageSize) + 1 : 0
)
const lastOnPage = computed(() =>
  Math.min(props.total, clampedPage.value * props.pageSize)
)

function goto(n) {
  const target = Math.min(Math.max(1, Number(n) || 1), totalPages.value)
  if (target !== clampedPage.value) emit('update:page', target)
}
function onSizeChange(e) {
  const next = Number(e.target.value) || props.pageSize
  emit('update:pageSize', next)
  // Snap back to page 1 so the user isn't stranded past the new tail.
  emit('update:page', 1)
}
</script>

<template>
  <div class="flex flex-col gap-2 border-t border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
    <div class="flex items-center gap-2">
      <label class="flex items-center gap-1">
        Rows
        <select
          class="input !h-7 !px-2 !py-0 !text-xs"
          :value="pageSize"
          @change="onSizeChange"
        >
          <option v-for="n in sizes" :key="n" :value="n">{{ n }}</option>
        </select>
      </label>
      <span class="text-slate-400">·</span>
      <span>
        <template v-if="total > 0">
          Showing <b class="text-slate-800">{{ firstOnPage }}–{{ lastOnPage }}</b>
          of <b class="text-slate-800">{{ total }}</b>
        </template>
        <template v-else>No rows</template>
      </span>
    </div>

    <div class="flex items-center gap-1">
      <button
        type="button"
        class="btn-secondary !h-7 !px-2 !py-0 !text-xs"
        :disabled="clampedPage <= 1"
        @click="goto(1)"
        title="First page"
      >« First</button>
      <button
        type="button"
        class="btn-secondary !h-7 !px-2 !py-0 !text-xs"
        :disabled="clampedPage <= 1"
        @click="goto(clampedPage - 1)"
        title="Previous page"
      >‹ Prev</button>

      <span class="mx-1 whitespace-nowrap">
        Page
        <input
          type="number"
          min="1"
          :max="totalPages"
          class="input !h-7 !w-14 !px-2 !py-0 !text-center !text-xs"
          :value="clampedPage"
          @change="e => goto(e.target.value)"
        />
        of <b class="text-slate-800">{{ totalPages }}</b>
      </span>

      <button
        type="button"
        class="btn-secondary !h-7 !px-2 !py-0 !text-xs"
        :disabled="clampedPage >= totalPages"
        @click="goto(clampedPage + 1)"
        title="Next page"
      >Next ›</button>
      <button
        type="button"
        class="btn-secondary !h-7 !px-2 !py-0 !text-xs"
        :disabled="clampedPage >= totalPages"
        @click="goto(totalPages)"
        title="Last page"
      >Last »</button>
    </div>
  </div>
</template>
