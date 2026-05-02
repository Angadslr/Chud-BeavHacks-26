const DISPLAY = 'auxWars_displayName'
const USER_ID = 'auxWars_userId'

function safeGet(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* private mode / blocked storage */
  }
}

export function getDisplayName() {
  return safeGet(DISPLAY) || ''
}

export function setDisplayName(name) {
  safeSet(DISPLAY, name.trim())
}

export function getUserId() {
  let id = safeGet(USER_ID)
  if (!id) {
    id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `u-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
    safeSet(USER_ID, id)
  }
  return id
}
