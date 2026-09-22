<script setup>
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const loading  = ref(true)
const errorMsg = ref('')

// Backend origin — mirrors client.js's rule so dev (absolute
// http://127.0.0.1:3010/api) and prod (nginx-proxied /api) both work.
const apiBase = (import.meta.env?.VITE_API_BASE || '/api').replace(/\/+$/, '')

onMounted(async () => {
  const token = String(route.query.t || route.params.token || '')
  if (!token) {
    errorMsg.value = 'Missing token.'
    loading.value = false
    return
  }
  try {
    // Backend renders the report to a self-contained HTML page. We fetch
    // it and inline-swap the whole document — the URL bar stays on
    // /lab/view?t=... (no navigation), but the DOM is now the rendered
    // report. No JSON payload ever loads on this client.
    const res = await fetch(`${apiBase}/lab-report/public/render?t=${encodeURIComponent(token)}`, {
      headers: { Accept: 'text/html' },
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(text || `Failed to load lab report (${res.status}).`)
    }
    const html = await res.text()
    // document.open()/write()/close() replaces the entire document
    // without triggering a navigation — the address bar stays put.
    document.open()
    document.write(html)
    document.close()
    // Any further Vue lifecycle work stops here — the SPA's root element
    // has been overwritten, so no reactive updates apply.
  } catch (e) {
    errorMsg.value = e?.message || 'Failed to load lab report.'
    loading.value = false
  }
})
</script>

<template>
  <div class="min-h-screen bg-slate-100 py-6">
    <div class="mx-auto max-w-3xl px-4">
      <div v-if="loading && !errorMsg" class="rounded-lg bg-white p-8 text-center text-sm text-slate-500 shadow">
        Loading lab report…
      </div>
      <div v-else-if="errorMsg" class="rounded-lg border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800 shadow">
        {{ errorMsg }}
      </div>
    </div>
  </div>
</template>
