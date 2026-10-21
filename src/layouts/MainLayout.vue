<script setup>
import { ref, watch, watchEffect, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import Sidebar from '../components/Sidebar.vue'
import Topbar from '../components/Topbar.vue'
import SubscriptionExpiredGate from '../components/SubscriptionExpiredGate.vue'
import { useThemeStore } from '../stores/theme'
import { useOfflineStore } from '../stores/offline'
import { useTenantStore } from '../stores/tenant'
import { applyTenantTheme, clearTenantTheme } from '../theme/apply'

const sidebarOpen = ref(false)  // mobile drawer
const collapsed   = ref(JSON.parse(localStorage.getItem('pos_sidebar_collapsed') || 'false'))
const route = useRoute()

watch(collapsed, v => localStorage.setItem('pos_sidebar_collapsed', JSON.stringify(v)))

function toggleCollapse() { collapsed.value = !collapsed.value }

// Dark mode and tenant brand color are both scoped to MainLayout —
// super-admin and public/landing routes never receive the 'dark' class
// or the --brand-* CSS custom properties, so they always render in the
// shipped light + red palette regardless of the signed-in tenant.
const theme = useThemeStore()
const tenant = useTenantStore()
let stopThemeWatch = null
let stopBrandWatch = null
// Wake the offline store as soon as the authenticated shell mounts — hooks
// browser online/offline events, restores the engine if this station had
// offline mode enabled before, and kicks a background sync when applicable.
const offline = useOfflineStore()
onMounted(() => {
  theme.startWatchingSystem()
  stopThemeWatch = watchEffect(() => {
    document.documentElement.classList.toggle('dark', theme.isDark)
  })
  stopBrandWatch = watchEffect(() => {
    applyTenantTheme(tenant.current?.themePrimaryColor)
  })
  offline.initialize().catch(() => {})
})
onBeforeUnmount(() => {
  if (stopThemeWatch) stopThemeWatch()
  if (stopBrandWatch) stopBrandWatch()
  document.documentElement.classList.remove('dark')
  clearTenantTheme()
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
