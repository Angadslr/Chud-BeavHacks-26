import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import {
  getDb,
  getFirebaseInitError,
  isFirebaseConfigured,
} from './firebase/config'
import Landing from './pages/Landing'

const fallbackStyle = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#0d0d0f',
  color: '#e8e8ed',
  fontFamily: 'system-ui, sans-serif',
}

const Room = lazy(async () => {
  try {
    return await import('./pages/Room')
  } catch (err) {
    console.error('Failed to load Room page:', err)
    return {
      default: function RoomChunkError() {
        return (
          <div style={{ ...fallbackStyle, flexDirection: 'column', padding: 24, textAlign: 'center' }}>
            <h1 style={{ color: '#fff' }}>Couldn’t load the room screen</h1>
            <p style={{ color: 'rgba(232,232,237,0.7)', maxWidth: 480 }}>
              This is often a network or bundler issue while loading the room chunk. Check the browser console.
            </p>
            <pre
              style={{
                marginTop: 12,
                textAlign: 'left',
                maxWidth: 560,
                fontSize: 12,
                color: '#fda4af',
                overflow: 'auto',
              }}
            >
              {String(err?.message || err)}
            </pre>
          </div>
        )
      },
    }
  }
})

function FirebaseSetupScreen() {
  const configured = isFirebaseConfigured()
  const initErr = getFirebaseInitError()

  return (
    <div
      style={{
        ...fallbackStyle,
        flexDirection: 'column',
        padding: 24,
        textAlign: 'center',
        boxSizing: 'border-box',
      }}
    >
      <h1 style={{ color: '#fff', margin: '0 0 12px', fontSize: 28 }}>Aux Wars</h1>
      <p style={{ color: 'rgba(232,232,237,0.75)', maxWidth: 480, margin: 0 }}>
        Firebase isn’t ready yet. Add your Realtime Database keys to{' '}
        <code style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: 6 }}>
          aux-wars/.env
        </code>{' '}
        (see <code style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: 6 }}>.env.example</code>
        ), then stop and run <code style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: 6 }}>npm run dev</code> again.
      </p>
      <ul
        style={{
          marginTop: 20,
          textAlign: 'left',
          maxWidth: 480,
          color: 'rgba(232,232,237,0.55)',
          fontSize: 14,
          lineHeight: 1.5,
        }}
      >
        <li>
          <strong style={{ color: 'rgba(255,255,255,0.85)' }}>VITE_FIREBASE_API_KEY</strong> and{' '}
          <strong style={{ color: 'rgba(255,255,255,0.85)' }}>VITE_FIREBASE_DATABASE_URL</strong> are required.
        </li>
        <li>Database URL usually ends in .firebaseio.com (Realtime Database, not Firestore).</li>
      </ul>
      {!configured && (
        <p
          style={{
            marginTop: 20,
            maxWidth: 480,
            padding: 12,
            borderRadius: 12,
            border: '1px solid rgba(245,158,11,0.35)',
            background: 'rgba(245,158,11,0.12)',
            color: '#fde68a',
            fontSize: 14,
          }}
        >
          Env vars look missing or empty — fill <code>.env</code>, don’t leave placeholders blank.
        </p>
      )}
      {configured && initErr && (
        <p
          style={{
            marginTop: 20,
            maxWidth: 560,
            padding: 12,
            borderRadius: 12,
            border: '1px solid rgba(239,68,68,0.35)',
            background: 'rgba(239,68,68,0.12)',
            color: '#fecaca',
            fontSize: 14,
            textAlign: 'left',
          }}
        >
          Firebase error: {String(initErr.message || initErr)}
        </p>
      )}
    </div>
  )
}

export default function App() {
  if (!isFirebaseConfigured() || !getDb()) {
    return <FirebaseSetupScreen />
  }

  return (
    <BrowserRouter>
      <div style={{ overflowX: 'hidden', maxWidth: '100vw' }}>
        <Suspense fallback={<div style={fallbackStyle}>Loading room…</div>}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/room/:roomId" element={<Room />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </div>
    </BrowserRouter>
  )
}
