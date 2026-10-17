<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import Modal from './Modal.vue'

const props = defineProps({
  show: Boolean,
  tenants: { type: Array, default: () => [] },
  title: { type: String, default: 'Select tenant' },
  // UUIDs to drop from the picker (e.g. the current target tenant that
  // shouldn't be allowed as its own copy source).
  excludeUuids: { type: Array, default: () => [] },
  // Optional preselected UUID — rendered as a check mark in the list.
  selectedUuid: { type: String, default: '' },
})
const emit = defineEmits(['close', 'select'])

const search = ref('')
const searchRef = ref(null)

watch(() => props.show, (now) => {
  if (!now) return
  search.value = ''
  nextTick(() => searchRef.value?.focus())
})

const filtered = computed(() => {
  const exclude = new Set(props.excludeUuids || [])
  const kw = search.value.trim().toLowerCase()
  return (props.tenants || [])
    .filter((t) => t?.uuid && !exclude.has(t.uuid))
    .filter((t) => {
      if (!kw) return true
      return [t.display_name, t.legal_name, t.store_code, t.email_address, t.city, t.province, t.branch, t.owner_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(kw))
    })
})

function pick(t) {
  emit('select', t)
  emit('close')
}
</script>

<template>
  <Modal :show="show" :title="title" size="lg" @close="emit('close')">
    <div class="space-y-3">
      <div>
        <input
          ref="searchRef"
          v-model="search"
          type="text"
          class="input"
          placeholder="Search by name, store code, email, city…"
        />
      </div>

      <div class="max-h-[55vh] overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700">
        <table class="w-full text-xs">
          <thead class="sticky top-0 bg-slate-50 dark:bg-slate-800 text-left text-[10px] uppercase text-slate-500">
            <tr>
              <th class="px-3 py-2 font-semibold">Store code</th>
              <th class="px-3 py-2 font-semibold">Name</th>
              <th class="px-3 py-2 font-semibold">Branch / City</th>
              <th class="px-3 py-2 font-semibold">Status</th>
              <th class="px-3 py-2 font-semibold text-right">Pick</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in filtered" :key="t.uuid"
                class="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer"
                @click="pick(t)">
              <td class="px-3 py-1.5 font-mono text-slate-600 dark:text-slate-300">{{ t.store_code || '—' }}</td>
              <td class="px-3 py-1.5">
                <div class="font-semibold text-slate-800 dark:text-slate-100">{{ t.display_name || '—' }}</div>
                <div v-if="t.legal_name && t.legal_name !== t.display_name" class="text-[10px] text-slate-500">{{ t.legal_name }}</div>
              </td>
              <td class="px-3 py-1.5 text-slate-500">
                <span v-if="t.branch">{{ t.branch }}</span>
                <span v-if="t.branch && (t.city || t.province)"> · </span>
                <span v-if="t.city">{{ t.city }}</span>
                <span v-if="t.city && t.province">, </span>
                <span v-if="t.province">{{ t.province }}</span>
                <span v-if="!t.branch && !t.city && !t.province">—</span>
              </td>
              <td class="px-3 py-1.5">
                <span v-if="t.status === 'active'" class="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Active</span>
                <span v-else class="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{{ t.status || '—' }}</span>
              </td>
              <td class="px-3 py-1.5 text-right">
                <span v-if="selectedUuid === t.uuid" class="text-brand-600">✓ selected</span>
                <span v-else class="text-xs text-brand-600 hover:underline">Pick</span>
              </td>
            </tr>
            <tr v-if="!filtered.length">
              <td colspan="5" class="px-3 py-6 text-center text-slate-500">
                <span v-if="search">No tenants match "{{ search }}".</span>
                <span v-else>No tenants to choose from.</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="text-[11px] text-slate-500">
        {{ filtered.length }} shown<span v-if="search"> · filtered from {{ tenants.length - (excludeUuids?.length || 0) }}</span>
      </div>
    </div>

    <template #footer>
      <button class="btn-secondary" @click="emit('close')">Cancel</button>
    </template>
  </Modal>
</template>
