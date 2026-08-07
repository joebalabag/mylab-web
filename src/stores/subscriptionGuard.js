import { defineStore } from 'pinia'

// Backend-authoritative "subscription expired" flag. Set when any API call
// returns 403 with `{ message: "subscription.expired" }`. Cleared on login /
// logout so a fresh session starts clean.
//
// SubscriptionExpiredGate.vue watches `forcedExpired` and opens its modal
// regardless of route or the client-side cached subscription snapshot, so
// the block is honored even on the Dashboard.

export const useSubscriptionGuardStore = defineStore('subscriptionGuard', {
  state: () => ({
    forcedExpired: false,
    lastPayload: null       // kept for diagnostics; e.g. server-supplied expiry date
  }),
  actions: {
    trip(payload = null) {
      this.forcedExpired = true
      this.lastPayload = payload || null
    },
    reset() {
      this.forcedExpired = false
      this.lastPayload = null
    }
  }
})
