<script setup>
import { ref, watch, watchEffect, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import Sidebar from '../components/Sidebar.vue'
import Topbar from '../components/Topbar.vue'
import SubscriptionExpiredGate from '../components/SubscriptionExpiredGate.vue'
import { useThemeStore } from '../stores/theme'
import { useOfflineStore } from '../stores/offline'

const sidebarOpen = ref(false)  // mobile drawer
const collapsed   = ref(JSON.parse(localStorage.getItem('pos_sidebar_collapsed') || 'false'))
const route = useRoute()

watch(collapsed, v => localStorage.setItem('pos_sidebar_collapsed', JSON.stringify(v)))

function toggleCollapse() { collapsed.value = !collapsed.value }

// Dark mode is scoped to MainLayout only — super-admin and public routes
// never receive the 'dark' class on <html>, so they always render light.
const theme = useThemeStore()
let stopThemeWatch = null
// Wake the offline store as soon as the authenticated shell mounts — hooks
// browser online/offline events, restores the engine if this station had
// offline mode enabled before, and kicks a background sync when applicable.
const offline = useOfflineStore()
onMounted(() => {
  theme.startWatchingSystem()
  stopThemeWatch = watchEffect(() => {
    document.documentElement.classList.toggle('dark', theme.isDark)
  })
  offline.initialize().catch(() => {})
})
onBeforeUnmount(() => {
  if (stopThemeWatch) stopThemeWatch()
  document.documentElement.classList.remove('dark')
  theme.stopWatchingSystem()
})
</script>

<template>
  <div class="flex h-full">
    <Sidebar
      :open="sidebarOpen"
      :collapsed="collapsed"
      @close="sidebarOpen = false"
      @toggle-collapse="toggleCollapse"
    />

    <div
      class="flex min-h-full min-w-0 flex-1 flex-col transition-[padding] duration-200"
      :class="collapsed ? 'md:pl-20' : 'md:pl-64'"
    >
      <Topbar
        :collapsed="collapsed"
        @toggle-sidebar="sidebarOpen = !sidebarOpen"
        @toggle-collapse="toggleCollapse"
      />
      <main class="flex-1 overflow-y-auto p-4 sm:p-6">
        <!-- No `mode="out-in"` and no wrapping `<transition>` on purpose.
             The Kitchen Display view uses a `<transition-group>` internally
             for its incoming-order toasts; nesting that under a parent
             `<transition mode="out-in">` reliably stalled the parent's leave
             phase, so the next module rendered white until a browser refresh.
             `:key="route.fullPath"` still forces a clean per-route mount. -->
        <RouterView v-slot="{ Component }">
          <component :is="Component" :key="route.fullPath" />
        </RouterView>
      </main>
    </div>
  </div>

  <Teleport to="body">
    <SubscriptionExpiredGate />
  </Teleport>
</template>
