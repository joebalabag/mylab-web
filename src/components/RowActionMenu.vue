<script setup>
import { ref, onBeforeUnmount } from 'vue'

/**
 * Row action menu: kebab trigger + teleported positioned panel.
 *
 * Usage:
 *   <RowActionMenu :actions="[
 *     { label: 'Edit', icon: 'edit', onClick: () => openEdit(u) },
 *     { label: 'Change password', icon: 'password', onClick: () => openPassword(u) },
 *     { label: u.active ? 'Deactivate' : 'Activate', icon: u.active ? 'deactivate' : 'activate',
 *       variant: u.active ? 'danger' : 'success', onClick: () => askToggleStatus(u) },
 *     { divider: true },
 *     { label: 'Delete', icon: 'trash', variant: 'danger', onClick: () => askDelete(u) }
 *   ]" />
 */
const props = defineProps({
  actions: { type: Array, required: true }
})

const open = ref(false)
const pos = ref({ x: 0, y: 0 })

const MENU_WIDTH = 224
const MENU_HEIGHT_EST = 240

function toggle(evt) {
  if (open.value) { close(); return }
  const rect = evt.currentTarget.getBoundingClientRect()
  const room = window.innerHeight - rect.bottom
  const openUp = room < MENU_HEIGHT_EST + 12
  const y = openUp
    ? Math.max(8, rect.top - MENU_HEIGHT_EST - 4)
    : rect.bottom + 4
  const x = Math.max(8, Math.min(window.innerWidth - MENU_WIDTH - 8, rect.right - MENU_WIDTH))
  pos.value = { x, y }
  open.value = true
}
function close() { open.value = false }

function fire(a) {
  if (a.disabled) return
  close()
  a.onClick?.()
}

function onDocClick(e) {
  if (!e.target.closest('.row-action-trigger') && !e.target.closest('.row-action-panel')) close()
}
function onEsc(e) { if (e.key === 'Escape') close() }

document.addEventListener('click', onDocClick)
document.addEventListener('keydown', onEsc)
window.addEventListener('scroll', close, true)
window.addEventListener('resize', close)
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onEsc)
  window.removeEventListener('scroll', close, true)
  window.removeEventListener('resize', close)
})

const variantClass = (v) => ({
  danger:  '!text-rose-600    hover:!bg-rose-50',
  success: '!text-emerald-600 hover:!bg-emerald-50',
  warn:    '!text-amber-600   hover:!bg-amber-50'
}[v] || '')

const iconColor = (v) => ({
  danger:  'text-rose-500',
  success: 'text-emerald-500',
  warn:    'text-amber-500'
}[v] || 'text-slate-500 dark:text-slate-400 dark:text-slate-500')
</script>

<template>
  <button
    class="row-action-trigger inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-100"
    :class="open && 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100'"
    @click.stop="toggle"
    aria-label="Row actions"
  >
    <svg viewBox="0 0 24 24" class="h-5 w-5" fill="currentColor">
      <circle cx="5" cy="12" r="1.6"/>
      <circle cx="12" cy="12" r="1.6"/>
      <circle cx="19" cy="12" r="1.6"/>
    </svg>
  </button>

  <Teleport to="body">
    <transition name="fade">
      <div
        v-if="open"
        class="row-action-panel fixed z-50 w-56 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1 shadow-lg"
        :style="{ top: pos.y + 'px', left: pos.x + 'px' }"
        @click.stop
      >
        <template v-for="(a, i) in actions" :key="i">
          <div v-if="a.divider" class="my-1 h-px bg-slate-100 dark:bg-slate-800"></div>
          <button
            v-else
            class="menu-item flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            :class="variantClass(a.variant)"
            :disabled="a.disabled"
            @click="fire(a)"
          >
            <!-- icon -->
            <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0" :class="iconColor(a.variant)"
                 fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <!-- edit -->
              <template v-if="a.icon === 'edit'">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </template>
              <!-- password / lock -->
              <template v-else-if="a.icon === 'password'">
                <rect x="3" y="11" width="18" height="10" rx="2"/>
                <path d="M7 11V7a5 5 0 0110 0v4"/>
              </template>
              <!-- activate / check -->
              <template v-else-if="a.icon === 'activate'">
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </template>
              <!-- deactivate / disable -->
              <template v-else-if="a.icon === 'deactivate'">
                <circle cx="12" cy="12" r="10"/>
                <line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/>
              </template>
              <!-- trash -->
              <template v-else-if="a.icon === 'trash'">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/>
              </template>
              <!-- copy -->
              <template v-else-if="a.icon === 'copy'">
                <rect x="9" y="9" width="13" height="13" rx="2"/>
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </template>
              <!-- history / clock -->
              <template v-else-if="a.icon === 'history'">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </template>
              <!-- eye / view -->
              <template v-else-if="a.icon === 'eye'">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/>
                <circle cx="12" cy="12" r="3"/>
              </template>
              <!-- default dot -->
              <template v-else>
                <circle cx="12" cy="12" r="3"/>
              </template>
            </svg>
            {{ a.label }}
          </button>
        </template>
      </div>
    </transition>
  </Teleport>
</template>
