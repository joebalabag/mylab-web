<script setup>
import Modal from './Modal.vue'

defineProps({
  show: Boolean,
  title: { type: String, default: 'Confirm' },
  message: { type: String, default: 'Are you sure?' },
  confirmText: { type: String, default: 'Confirm' },
  danger: { type: Boolean, default: true }
})
defineEmits(['close', 'confirm'])
</script>

<template>
  <Modal :show="show" :title="title" size="sm" @close="$emit('close')">
    <p class="text-sm text-slate-600">{{ message }}</p>
    <template #footer>
      <button class="btn-secondary" @click="$emit('close')">Cancel</button>
      <button :class="danger ? 'btn-danger' : 'btn-primary'" @click="$emit('confirm')">{{ confirmText }}</button>
    </template>
  </Modal>
</template>
