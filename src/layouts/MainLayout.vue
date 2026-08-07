<script setup>
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import Sidebar from '../components/Sidebar.vue'
import Topbar from '../components/Topbar.vue'
import SubscriptionExpiredGate from '../components/SubscriptionExpiredGate.vue'

const sidebarOpen = ref(false)  // mobile drawer
const collapsed   = ref(JSON.parse(localStorage.getItem('pos_sidebar_collapsed') || 'false'))
const route = useRoute()

watch(collapsed, v => localStorage.setItem('pos_sidebar_collapsed', JSON.stringify(v)))

function toggleCollapse() { collapsed.value = !collapsed.value }
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
