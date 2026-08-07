// Local persistence for user-access grants.
//
// User-access endpoint isn't wired yet, so we cache the array of granted
// navigation_ids per user in localStorage. When the backend endpoint lands,
// swap the three helpers below for API calls and the Assign Access modal
// won't need to change.

const STORAGE_KEY = 'pos_user_access'

function readStore() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    return (raw && typeof raw === 'object') ? raw : {}
  } catch (_) { return {} }
}
function writeStore(map) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map || {}))
}

// Returns an array of navigation_id numbers previously granted to the user.
export function loadUserAccess(userUuid) {
  if (!userUuid) return []
  const store = readStore()
  const arr = store[userUuid]
  return Array.isArray(arr) ? arr : []
}

export function saveUserAccess(userUuid, ids) {
  if (!userUuid) return
  const store = readStore()
  store[userUuid] = Array.isArray(ids) ? [...new Set(ids)] : []
  writeStore(store)
}

// Remove a user's entry entirely (call after a user delete so the local
// store doesn't accumulate orphans).
export function clearUserAccess(userUuid) {
  if (!userUuid) return
  const store = readStore()
  delete store[userUuid]
  writeStore(store)
}
