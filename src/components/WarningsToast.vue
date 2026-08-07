<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useWarningsStore, WARNING_AUTO_DISMISS_MS } from '../stores/warnings'

const warnings = useWarningsStore()
const items = computed(() => warnings.items)

// Auto-dismiss: for each new warning, schedule a removal after N ms.
// We track timer ids per warning id so a manual dismiss cancels it cleanly.
const timers = ref(new Map())

function scheduleDismiss(id) {
  if (timers.value.has(id)) return
  const t = setTimeout(() => {
    warnings.dismiss(id)
    timers.value.delete(id)
  }, WARNING_AUTO_DISMISS_MS)
  timers.value.set(id, t)
}

function manualDismiss(id) {
  const t = timers.value.get(id)
  if (t) { clearTimeout(t); timers.value.delete(id) }
  warnings.dismiss(id)
}

watch(items, (list) => {
  for (const w of list) scheduleDismiss(w.id)
}, { immediate: true, deep: true })

onBeforeUnmount(() => {
  for (const t of timers.value.values()) clearTimeout(t)
  timers.value.clear()
})
</script>

<template>
  <Teleport to="body">
    <div class="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-full max-w-sm flex-col gap-2">
      <transition-group name="warning-toast" tag="div" class="flex flex-col gap-2">
        <div v-for="w in items" :key="w.id"
             class="pointer-events-auto rounded-lg border border-amber-200 bg-amber-50 p-3 shadow-lg ring-1 ring-amber-100">
          <div class="flex items-start gap-2">
            <svg viewBox="0 0 24 24" class="mt-0.5 h-5 w-5 shrink-0 text-amber-600" fill="none"
                 stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <div class="min-w-0 flex-1">
              <div v-if="w.text" class="text-sm text-amber-900">{{ w.text }}</div>
              <div v-else class="text-sm text-amber-900">{{ w.hint || w.code || 'Notice' }}</div>
              <div v-if="w.code" class="mt-0.5 truncate font-mono text-[10px] text-amber-700/70">
                {{ w.code }}
              </div>
            </div>
            <button type="button"
                    class="rounded-md p-0.5 text-amber-700/80 hover:bg-amber-100 hover:text-amber-900"
                    aria-label="Dismiss"
                    @click="manualDismiss(w.id)">
              <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
      </transition-group>
    </div>
  </Teleport>
</template>

<style scoped>
.warning-toast-enter-active,
.warning-toast-leave-active {
  transition: opacity 200ms ease, transform 200ms ease;
}
.warning-toast-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.warning-toast-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
