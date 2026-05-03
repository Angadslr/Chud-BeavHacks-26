import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { customAlphabet } from 'nanoid'
import { createRoom, roomExists } from '../firebase/roomService'
import { setDisplayName, getDisplayName, getUserId } from '../lib/session'

const genRoomCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6)

async function uniqueRoomCode() {
  for (let i = 0; i < 12; i += 1) {
    const code = genRoomCode()
    if (!(await roomExists(code))) return code
  }
  return genRoomCode()
}

function Toggle({ checked, onChange, label, sublabel }) {
  return (
    <label className="flex cursor-pointer select-none items-center justify-between gap-3">
      <span className="flex flex-col">
        <span className="text-sm font-medium text-white/80">{label}</span>
        {sublabel && <span className="text-xs text-white/40">{sublabel}</span>}
      </span>
      <div
        role="switch"
        aria-checked={checked}
        tabIndex={0}
        onClick={() => onChange(!checked)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-aux-mint/40 ${
          checked ? 'bg-aux-mint' : 'bg-white/20'
        }`}
      >
        <div
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </div>
    </label>
  )
}

function RoomSettingsModal({ name, onStart, onBack, busy }) {
  const [allowSkip, setAllowSkip] = useState(true)
  const [allowPause, setAllowPause] = useState(true)
  const [allowRequests, setAllowRequests] = useState(true)
  const [playOnAllDevices, setPlayOnAllDevices] = useState(true)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-aux-border bg-[#111113] p-6 shadow-2xl shadow-black/60">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Room Settings</h2>
            <p className="mt-0.5 text-xs text-white/40">Configure before starting</p>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg px-3 py-1.5 text-sm text-white/40 hover:bg-white/5 hover:text-white/70"
          >
            ← Back
          </button>
        </div>

        <div className="space-y-4">
          <Toggle
            checked={allowSkip}
            onChange={setAllowSkip}
            label="Participants can skip"
            sublabel="Let anyone skip the current track"
          />
          <div className="h-px bg-white/7" />
          <Toggle
            checked={allowPause}
            onChange={setAllowPause}
            label="Participants can pause"
            sublabel="Let anyone pause playback"
          />
          <div className="h-px bg-white/7" />
          <Toggle
            checked={allowRequests}
            onChange={setAllowRequests}
            label="Allow song requests from guests"
            sublabel="Let participants add songs to the queue"
          />
          <div className="h-px bg-white/7" />
          <Toggle
            checked={playOnAllDevices}
            onChange={setPlayOnAllDevices}
            label="Play music on everyone's device"
            sublabel={
              playOnAllDevices
                ? 'YouTube plays on all devices simultaneously'
                : "Music plays on host's device only — guests see song info"
            }
          />
        </div>

        <button
          type="button"
          onClick={() => onStart({ allowSkip, allowPause, allowRequests, playOnAllDevices })}
          disabled={busy}
          className="mt-8 w-full rounded-xl bg-aux-mint py-4 text-base font-bold text-black hover:brightness-110 disabled:opacity-50"
        >
          {busy ? 'Creating room…' : 'Start Room'}
        </button>
      </div>
    </div>
  )
}

export default function Landing() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const wasKicked = searchParams.get('kicked') === '1'

  const [name, setName] = useState(getDisplayName())
  const [joinCode, setJoinCode] = useState('')
  const [wasAutofilled, setWasAutofilled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [showSettings, setShowSettings] = useState(false)

  // Auto-fill last room code from localStorage
  useEffect(() => {
    const lastRoom = localStorage.getItem('lastRoomId')
    if (lastRoom) {
      setJoinCode(lastRoom)
      setWasAutofilled(true)
    }
  }, [])

  const saveName = () => {
    if (!name.trim()) {
      setErr('Pick a display name')
      return false
    }
    setDisplayName(name.trim())
    return true
  }

  // Called when user clicks "Create a new room" — validates name then shows settings
  const onClickCreate = () => {
    setErr(null)
    if (!saveName()) return
    setShowSettings(true)
  }

  // Called from the settings modal "Start Room" button
  const onStartRoom = async (settings) => {
    setBusy(true)
    try {
      const code = await uniqueRoomCode()
      await createRoom(code, getUserId(), settings)
      localStorage.setItem('lastRoomId', code)
      navigate(`/room/${code}`)
    } catch (e) {
      console.error(e)
      setErr('Could not create room — check Firebase config')
      setShowSettings(false)
    } finally {
      setBusy(false)
    }
  }

  const onJoin = async () => {
    setErr(null)
    if (!saveName()) return
    const code = joinCode.trim().toUpperCase()
    if (code.length < 4) {
      setErr('Enter a room code')
      return
    }
    setBusy(true)
    try {
      const ok = await roomExists(code)
      if (!ok) {
        // Room gone — clear autofill
        if (wasAutofilled) {
          localStorage.removeItem('lastRoomId')
          setWasAutofilled(false)
        }
        setErr('Room not found')
        return
      }
      localStorage.setItem('lastRoomId', code)
      navigate(`/room/${code}`)
    } catch (e) {
      console.error(e)
      setErr('Could not join — check Firebase')
    } finally {
      setBusy(false)
    }
  }

  void getUserId()

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-gradient-to-b from-[#0d0d0f] via-[#121214] to-[#0a0a0c] px-4 py-12">
      {showSettings && (
        <RoomSettingsModal
          name={name}
          onStart={onStartRoom}
          onBack={() => setShowSettings(false)}
          busy={busy}
        />
      )}

      <div className="w-full max-w-md text-center">
        <h1 className="text-5xl font-black tracking-tight text-white sm:text-6xl">
          No Skip
        </h1>

        {wasKicked && (
          <div className="mt-6 rounded-xl border border-aux-coral/35 bg-aux-coral/10 px-4 py-3 text-sm font-medium text-aux-coral">
            You were removed from the room.
          </div>
        )}

        <div className="mt-10 rounded-2xl border border-aux-border bg-aux-surface/60 p-6 text-left shadow-xl shadow-black/30 backdrop-blur-sm">
          {/* Display name */}
          <label className="block text-xs font-semibold uppercase tracking-wider text-white/45">
            Display name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="mt-2 w-full rounded-xl border border-aux-border bg-black/35 px-4 py-3 text-white placeholder:text-white/35 focus:border-aux-mint/50 focus:outline-none focus:ring-1 focus:ring-aux-mint/40"
          />

          {/* Room code */}
          {wasAutofilled && (
            <p className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-aux-mint/70">
              Rejoin your last room
            </p>
          )}
          {!wasAutofilled && (
            <label className="mt-5 block text-xs font-semibold uppercase tracking-wider text-white/45">
              Room code
            </label>
          )}
          <input
            value={joinCode}
            onChange={(e) => {
              setJoinCode(e.target.value.toUpperCase())
              setWasAutofilled(false)
            }}
            onKeyDown={(e) => e.key === 'Enter' && onJoin()}
            placeholder="e.g. X7K2M9"
            maxLength={8}
            className={`mt-2 w-full rounded-xl border bg-black/35 px-4 py-3 font-mono text-lg tracking-widest text-white placeholder:text-white/35 focus:outline-none focus:ring-1 focus:ring-aux-mint/40 ${
              wasAutofilled
                ? 'border-aux-mint/30 focus:border-aux-mint/50'
                : 'border-aux-border focus:border-aux-mint/50'
            }`}
          />

          {err && (
            <p className="mt-3 text-sm text-aux-coral" role="alert">
              {err}
            </p>
          )}

          {/* Primary action — join */}
          <button
            type="button"
            onClick={onJoin}
            disabled={busy}
            className="mt-3 w-full rounded-xl bg-aux-mint py-3.5 text-base font-bold text-black hover:brightness-110 disabled:opacity-50"
          >
            {busy ? 'Working…' : 'Join room'}
          </button>

          {/* Separator */}
          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-xs uppercase tracking-wider text-white/35">or</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          {/* Secondary action — create */}
          <button
            type="button"
            onClick={onClickCreate}
            disabled={busy}
            className="w-full rounded-xl border border-white/20 bg-transparent py-4 text-sm font-semibold text-white/70 hover:bg-white/5 hover:text-white/90 disabled:opacity-50"
          >
            Create a new room
          </button>
        </div>
      </div>
    </div>
  )
}
