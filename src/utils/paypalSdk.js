// Lazy loader for the PayPal JS SDK.
//
// Loads https://www.paypal.com/sdk/js on demand, keyed on client id + currency
// so switching currency (rare) re-loads the SDK against the right settlement
// account. The returned promise resolves with `window.paypal` — the caller
// then does `.Buttons({...}).render(container)`.
//
// Kept out of index.html because (a) the Subscription page is a small subset
// of users and (b) we don't want a network round-trip to paypal.com on every
// page load.

const loaders = new Map()

export function loadPaypalSdk({ clientId, currency = 'PHP', intent = 'capture' } = {}) {
  if (!clientId) return Promise.reject(new Error('PayPal client id is not configured.'))
  const key = `${clientId}|${currency}|${intent}`
  if (loaders.has(key)) return loaders.get(key)

  const p = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('PayPal SDK requires a browser environment.'))
      return
    }
    if (window.paypal) {
      resolve(window.paypal)
      return
    }
    const params = new URLSearchParams({
      'client-id': clientId,
      currency,
      intent,
      // Buttons only — we're not using card fields or advanced flows.
      components: 'buttons',
    })
    const script = document.createElement('script')
    script.src = `https://www.paypal.com/sdk/js?${params.toString()}`
    script.async = true
    script.onload = () => {
      if (window.paypal) resolve(window.paypal)
      else reject(new Error('PayPal SDK loaded but window.paypal is undefined.'))
    }
    script.onerror = () => reject(new Error('Failed to load the PayPal SDK.'))
    document.head.appendChild(script)
  })
  loaders.set(key, p)
  return p
}
