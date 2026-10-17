<script setup>
import { nextTick, ref, watch } from 'vue'
import Modal from './Modal.vue'

const props = defineProps({
  show: Boolean,
  title: { type: String, default: 'Confirm password' },
  message: { type: String, default: 'Enter your password to continue.' },
  confirmText: { type: String, default: 'Confirm' },
  danger: { type: Boolean, default: true },
  // When true, lock the inputs + show "Working..." on the confirm button.
  // Owner (parent) toggles this during the async submit; the dialog does
  // not close itself so parent can decide to keep it open on error.
  busy: { type: Boolean, default: false },
})
const emit = defineEmits(['close', 'confirm'])

const password = ref('')
const inputRef = ref(null)

// Clear + focus the password field whenever the dialog opens, so switching
// between actions never leaks the previous entry.
watch(() => props.show, (now) => {
  if (now) {
    password.value = ''
    nextTick(() => inputRef.value?.focus())
  }
})

function onConfirm() {
  if (props.busy || !password.value) return
  emit('confirm', password.value)
}

function onKey(e) {
  if (e.key === 'Enter') onConfirm()
}
</script>

<template>
  <Modal :show="show" :title="title" size="sm" @close="busy ? null : $emit('close')">
    <p class="text-sm text-slate-600 dark:text-slate-300">{{ message }}</p>
    <div class="mt-3">
      <label class="label">Your password</label>
      <input
        ref="inputRef"
        v-model="password"
        type="password"
        class="input"
        :disabled="busy"
        autocomplete="current-password"
        @keydown="onKey"
      />
    </div>
    <template #footer>
      <button class="btn-secondary" :disabled="busy" @click="$emit('close')">Cancel</button>
      <button
        :class="danger ? 'btn-danger' : 'btn-primary'"
        :disabled="busy || !password"
        @click="onConfirm"
      >
        <span v-if="busy">Working…</span>
        <span v-else>{{ confirmText }}</span>
      </button>
    </template>
  </Modal>
</template>
