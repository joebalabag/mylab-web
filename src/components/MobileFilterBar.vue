<script setup>
import { ref } from 'vue'

// Mobile-collapsible filter bar for list views.
//
// Mobile layout:
//   Row 1  → [Filters ▼] toggle + optional #action slot (always visible)
//   Row 2  → filter inputs (default slot), shown only when toggle is open
//
// sm+ (≥ 640px) layout:
//   Everything renders in a single flex row: [filters] + [action], matching
//   the pre-existing desktop card-header design.
//
// Usage:
//   <MobileFilterBar>
//     <input class="input w-full sm:w-64" />
//     <select class="input w-full sm:w-40">…</select>
//     <template #action>
//       <button class="btn-secondary">Refresh</button>
//       <button class="btn-primary">+ Add</button>
//     </template>
//   </MobileFilterBar>

defineProps({
  label: { type: String, default: 'Filters' }
})

const open = ref(false)
</script>

<template>
  <!-- Mobile-only bar: filter toggle + primary action, always visible on phones. -->
  <div class="flex w-full items-center gap-2 sm:hidden">
    <button
      type="button"
      class="btn-secondary flex-1 !justify-between !text-sm"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span class="inline-flex items-center gap-2">
        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>
        </svg>
        {{ label }}
      </span>
      <svg viewBox="0 0 24 24" class="h-4 w-4 transition-transform" :class="open && 'rotate-180'"
           fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </button>
    <slot name="action" />
  </div>

  <!-- Filter body: hidden on mobile when collapsed, always visible on sm+.
       On sm+ the primary action slot also renders here so the whole row stays
       inline like the pre-existing card-header layout. -->
  <div
    :class="[
      open ? 'flex' : 'hidden sm:flex',
      'w-full flex-wrap items-center gap-2 sm:w-auto'
    ]"
  >
    <slot />
    <div class="hidden sm:contents">
      <slot name="action" />
    </div>
  </div>
</template>
