import { initializeApp, getApps, getApp } from 'firebase/app'
import { getDatabase } from 'firebase/database'

/** True when required vars look present (does not guarantee init succeeds). */
export function isFirebaseConfigured() {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY
  const databaseURL = import.meta.env.VITE_FIREBASE_DATABASE_URL
  return Boolean(
    apiKey &&
      String(apiKey).trim() !== '' &&
      databaseURL &&
      String(databaseURL).trim() !== '',
  )
}

let cachedDb = null
let initAttempted = false
let initError = null

/** Last error from initializeApp / getDatabase, if any. */
export function getFirebaseInitError() {
  return initError
}

/**
 * Lazily initializes Firebase. Returns null if env is missing or init fails
 * (does not throw — safe to call on every route).
 */
export function getDb() {
  if (cachedDb) return cachedDb
  if (!isFirebaseConfigured()) {
    return null
  }
  if (initAttempted) {
    return null
  }
  initAttempted = true

  const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  }

  try {
    const app =
      getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)
    cachedDb = getDatabase(app)
    initError = null
    return cachedDb
  } catch (e) {
    initError = e
    console.error('Firebase initialization failed:', e)
    return null
  }
}
