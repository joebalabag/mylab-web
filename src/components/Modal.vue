<script setup>
defineProps({
  show: Boolean,
  title: String,
  size: { type: String, default: 'md' } // sm, md, lg, xl, 2xl
})
defineEmits(['close'])
</script>

<template>
  <transition name="fade">
    <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div class="absolute inset-0 bg-slate-900/40" @click="$emit('close')" />
      <div
        class="relative flex max-h-[calc(100vh-1rem)] w-full flex-col rounded-xl bg-white shadow-xl sm:max-h-[calc(100vh-2rem)]"
        :class="{
          'max-w-sm': size === 'sm',
          'max-w-lg': size === 'md',
          'max-w-2xl': size === 'lg',
          'max-w-4xl': size === 'xl',
          'max-w-6xl': size === '2xl'
        }"
      >
        <div class="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5">
          <h3 class="text-base font-semibold text-slate-800">{{ title }}</h3>
          <button type="button" class="btn-icon" @click="$emit('close')" aria-label="Close">
            <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <!-- Optional toolbar slot — renders between the title bar and the
             scrolling body, so persistent controls like a search input stay
             pinned while the body scrolls beneath them. -->
        <div v-if="$slots.toolbar"
             class="shrink-0 border-b border-slate-100 bg-white px-4 py-2 sm:px-5">
          <slot name="toolbar" />
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <slot />
        </div>
        <div v-if="$slots.footer" class="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-100 px-4 py-3 sm:px-5">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </transition>
</template>
