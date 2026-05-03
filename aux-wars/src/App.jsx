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
  background: '#ebe6dd',
  color: '#57534e',
  fontFamily:
    'Inter, ui-sans-serif, system-ui, sans-serif',
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
            <h1 style={{ color: '#1c1917', fontFamily: 'Fraunces, Georgia, serif', fontSize: '1.5rem', fontWeight: 600 }}>
              Couldn’t open the room
            </h1>
            <p style={{ color: '#78716c', maxWidth: 480, fontSize: 15, lineHeight: 1.5 }}>
              Usually a network hiccup or a failed chunk load. Check the console.
            </p>
            <pre
              style={{
                marginTop: 12,
                textAlign: 'left',
                maxWidth: 560,
                fontSize: 12,
                color: '#b45348',
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
      <h1
        style={{
          color: '#1c1917',
          margin: '0 0 12px',
          fontSize: '1.75rem',
          fontFamily: 'Fraunces, Georgia, serif',
          fontWeight: 600,
        }}
      >
        Aux Wars
      </h1>
      <p style={{ color: '#57534e', maxWidth: 480, margin: 0, fontSize: 15, lineHeight: 1.55 }}>
        Firebase isn’t configured. Add your Realtime Database keys to{' '}
        <code style={{ background: 'rgba(28,25,23,0.06)', padding: '2px 8px', borderRadius: 4, fontSize: 13 }}>
          aux-wars/.env
        </code>{' '}
        (see{' '}
        <code style={{ background: 'rgba(28,25,23,0.06)', padding: '2px 8px', borderRadius: 4, fontSize: 13 }}>
          .env.example
        </code>
        ), then restart <code style={{ background: 'rgba(28,25,23,0.06)', padding: '2px 8px', borderRadius: 4, fontSize: 13 }}>npm run dev</code>.
      </p>
      <ul
        style={{
          marginTop: 20,
          textAlign: 'left',
          maxWidth: 480,
          color: '#78716c',
          fontSize: 14,
          lineHeight: 1.55,
        }}
      >
        <li>
          <strong style={{ color: '#292524' }}>VITE_FIREBASE_API_KEY</strong> and{' '}
          <strong style={{ color: '#292524' }}>VITE_FIREBASE_DATABASE_URL</strong> are required.
        </li>
        <li>The database URL is for Realtime Database (often ends in .firebaseio.com).</li>
      </ul>
      {!configured && (
        <p
          style={{
            marginTop: 20,
            maxWidth: 480,
            padding: '12px 14px',
            borderRadius: 8,
            border: '1px solid rgba(180, 83, 72, 0.25)',
            background: 'rgba(180, 83, 72, 0.06)',
            color: '#7f2d2d',
            fontSize: 14,
          }}
        >
          Env vars look empty — fill <code>.env</code> with real values.
        </p>
      )}
      {configured && initErr && (
        <p
          style={{
            marginTop: 20,
            maxWidth: 560,
            padding: '12px 14px',
            borderRadius: 8,
            border: '1px solid rgba(180, 83, 72, 0.3)',
            background: 'rgba(180, 83, 72, 0.08)',
            color: '#7f1d1d',
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
      <Suspense fallback={<div style={fallbackStyle}>Loading…</div>}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/room/:roomId" element={<Room />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
