<script setup>
import { ref, watch } from 'vue'
import Modal from './Modal.vue'

const props = defineProps({
  show: Boolean,
  title: { type: String, default: 'Change Password' },
  subtitle: { type: String, default: '' },
  // Preferred: atomic (oldPw, newPw) => Promise<{ ok, message } | void>
  submit: { type: Function, default: null },
  // Legacy pair — used only when `submit` is not provided.
  verify: { type: Function, default: null },
  save:   { type: Function, default: null },
  minLength: { type: Number, default: 6 }
})
const emit = defineEmits(['close', 'saved'])

const current = ref('')
const next    = ref('')
const confirm = ref('')
const showCurrent = ref(false)
const showNext    = ref(false)
const error = ref('')
const busy  = ref(false)

function reset() {
  current.value = ''
  next.value = ''
  confirm.value = ''
  showCurrent.value = false
  showNext.value = false
  error.value = ''
  busy.value = false
}

watch(() => props.show, (v) => { if (v) reset() })

function close() {
  emit('close')
}

async function submit() {
  error.value = ''
  if (!current.value) { error.value = 'Enter your current password'; return }
  if (next.value.length < props.minLength) {
    error.value = `New password must be at least ${props.minLength} characters`
    return
  }
  if (next.value === current.value) {
    error.value = 'New password must be different from the current one'
    return
  }
  if (next.value !== confirm.value) {
    error.value = 'New password and confirmation do not match'
    return
  }
  busy.value = true
  try {
    if (props.submit) {
      const res = await Promise.resolve(props.submit(current.value, next.value))
      if (res && res.ok === false) {
        error.value = res.message || 'Password change failed'
        return
      }
    } else if (props.verify && props.save) {
      const ok = await Promise.resolve(props.verify(current.value))
      if (!ok) {
        error.value = 'Current password is incorrect'
        return
      }
      await Promise.resolve(props.save(next.value))
    } else {
      error.value = 'Change password not configured'
      return
    }
    emit('saved')
    emit('close')
  } catch (e) {
    error.value = e?.message || 'Password change failed'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Modal :show="show" :title="title" size="sm" @close="close">
    <p v-if="subtitle" class="mb-2 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{{ subtitle }}</p>
    <form class="space-y-3" @submit.prevent="submit">
      <div>
        <label class="label">Current password</label>
        <div class="relative">
          <input
            :type="showCurrent ? 'text' : 'password'"
            v-model="current"
            class="input pr-10"
            autocomplete="current-password"
            required
          />
          <button type="button" class="absolute inset-y-0 right-2 my-auto btn-icon"
                  @click="showCurrent = !showCurrent" tabindex="-1">
            <svg v-if="!showCurrent" viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <path d="M17.94 17.94A10.05 10.05 0 0112 19c-6.5 0-10-7-10-7a17.6 17.6 0 013.94-4.66"/>
              <line x1="1" y1="1" x2="23" y2="23"/>
            </svg>
          </button>
        </div>
      </div>

      <div>
        <label class="label">New password</label>
        <div class="relative">
          <input
            :type="showNext ? 'text' : 'password'"
            v-model="next"
            class="input pr-10"
            :minlength="minLength"
            autocomplete="new-password"
            required
          />
          <button type="button" class="absolute inset-y-0 right-2 my-auto btn-icon"
                  @click="showNext = !showNext" tabindex="-1">
            <svg v-if="!showNext" viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <path d="M17.94 17.94A10.05 10.05 0 0112 19c-6.5 0-10-7-10-7a17.6 17.6 0 013.94-4.66"/>
              <line x1="1" y1="1" x2="23" y2="23"/>
            </svg>
          </button>
        </div>
        <div class="mt-1 text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500">At least {{ minLength }} characters.</div>
      </div>

      <div>
        <label class="label">Confirm new password</label>
        <input
          :type="showNext ? 'text' : 'password'"
          v-model="confirm"
          class="input"
          :minlength="minLength"
          autocomplete="new-password"
          required
        />
      </div>

      <div v-if="error" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
        {{ error }}
      </div>
    </form>
    <template #footer>
      <button class="btn-secondary" :disabled="busy" @click="close">Cancel</button>
      <button class="btn-primary" :disabled="busy" @click="submit">
        {{ busy ? 'Saving…' : 'Update password' }}
      </button>
    </template>
  </Modal>
</template>
