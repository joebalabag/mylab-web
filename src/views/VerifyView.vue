<script setup>
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { verifyRegistration } from '../api/publicRegistration'

const route  = useRoute()
const router = useRouter()

onMounted(async () => {
  const token = String(route.query.token || '').trim()

  // No token in the URL → immediate failure, nothing to validate.
  if (!token) {
    router.replace({
      name: 'register-verify-failed',
      query: { reason: 'missing-token' }
    })
    return
  }

  try {
    const res = await verifyRegistration(token)
    // Prefer whatever the server returns; fall back to any query-forwarded
    // hints (useful when clicking the preview link from the login page).
    const email = String(res?.email      ?? route.query.email ?? '').trim()
    const store = String(res?.store_name ?? res?.display_name ?? route.query.store ?? '').trim()
    const query = {}
    if (email) query.email = email
    if (store) query.store = store
    router.replace({ name: 'register-verified', query })
  } catch (e) {
    // Map common backend messages to short reason codes for the fail screen.
    const raw = String(e?.message || '').toLowerCase()
    let reason = 'invalid'
    if (e?.status === 410 || raw.includes('expire'))       reason = 'expired'
    else if (e?.status === 409 || raw.includes('used') ||
             raw.includes('already'))                       reason = 'used'
    else if (e?.status === 400 || raw.includes('invalid') ||
             raw.includes('malformed'))                     reason = 'invalid'
    else if (!e?.status || e.status === 0)                  reason = 'network'
    router.replace({
      name: 'register-verify-failed',
      query: {
        reason,
        detail: e?.message || ''
      }
    })
  }
})
</script>

<template>
  <div class="flex min-h-full items-center justify-center bg-slate-50 p-6">
    <div class="w-full max-w-sm text-center">
      <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-brand-600">
        <svg viewBox="0 0 24 24" class="h-7 w-7 animate-spin" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12a9 9 0 11-6.219-8.56"/>
        </svg>
      </div>
      <div class="text-base font-semibold text-slate-800">Verifying your email…</div>
      <div class="mt-1 text-xs text-slate-500">This should only take a moment.</div>
    </div>
  </div>
</template>
