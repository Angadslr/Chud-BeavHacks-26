import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { customAlphabet } from 'nanoid'
import { createRoom, roomExists } from '../firebase/roomService'
import { setDisplayName, getDisplayName, getUserId } from '../lib/session'
import LandingRibCanvas from '../components/LandingRibCanvas'

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
        <span className="text-sm font-medium text-white/85">{label}</span>
        {sublabel && <span className="text-xs text-white/45">{sublabel}</span>}
      </span>
      <div
        role="switch"
        aria-checked={checked}
        tabIndex={0}
        onClick={() => onChange(!checked)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-400/35 ${
          checked ? 'bg-cyan-400/90' : 'bg-white/15'
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

function RoomSettingsModal({ onStart, onBack, busy }) {
  const [allowSkip, setAllowSkip] = useState(true)
  const [allowPause, setAllowPause] = useState(true)
  const [allowRequests, setAllowRequests] = useState(true)
  const [playOnAllDevices, setPlayOnAllDevices] = useState(true)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 px-4 backdrop-blur-md">
      <div className="app-glass-modal w-full max-w-md p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-wide text-white">Room settings</h2>
            <p className="mt-0.5 text-xs text-white/40">Before you start</p>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg px-3 py-1.5 text-sm text-white/45 hover:bg-white/5 hover:text-white/75"
          >
            Back
          </button>
        </div>

        <div className="space-y-4">
          <Toggle
            checked={allowSkip}
            onChange={setAllowSkip}
            label="Participants can skip"
            sublabel="Let anyone skip the current track"
          />
          <div className="app-divider" />
          <Toggle
            checked={allowPause}
            onChange={setAllowPause}
            label="Participants can pause"
            sublabel="Let anyone pause playback"
          />
          <div className="app-divider" />
          <Toggle
            checked={allowRequests}
            onChange={setAllowRequests}
            label="Allow song requests from guests"
            sublabel="Let participants add songs to the queue"
          />
          <div className="app-divider" />
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
          onClick={() =>
            onStart({ allowSkip, allowPause, allowRequests, playOnAllDevices })
          }
          disabled={busy}
          className="app-btn-cta mt-8"
        >
          {busy ? 'Creating…' : 'Start room'}
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
  const [createBusy, setCreateBusy] = useState(false)
  const [joinBusy, setJoinBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const busy = createBusy || joinBusy

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

  const onClickCreate = () => {
    setErr(null)
    if (!saveName()) return
    setShowSettings(true)
  }

  const onStartRoom = async (settings) => {
    setCreateBusy(true)
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
      setCreateBusy(false)
    }
  }

  const wait = (ms) => new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })

  const roomExistsWithRetry = async (code) => {
    try {
      return await roomExists(code)
    } catch (firstError) {
      await wait(300)
      try {
        return await roomExists(code)
      } catch {
        throw firstError
      }
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
    setJoinBusy(true)
    try {
      const ok = await roomExistsWithRetry(code)
      if (!ok) {
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
      setJoinBusy(false)
    }
  }

  void getUserId()

  return (
    <div className="app-page overflow-hidden">
      <LandingRibCanvas />

      <div
        className="pointer-events-none fixed -left-[20%] -top-[15%] h-[55vmin] w-[55vmin] rounded-full bg-cyan-400/34 blur-[105px]"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed -bottom-[20%] -left-[15%] h-[50vmin] w-[50vmin] rounded-full bg-amber-300/22 blur-[98px]"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed -right-[15%] -top-[10%] h-[48vmin] w-[48vmin] rounded-full bg-fuchsia-500/28 blur-[104px]"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed -bottom-[15%] -right-[12%] h-[55vmin] w-[55vmin] rounded-full bg-violet-500/30 blur-[110px]"
        aria-hidden
      />

      {showSettings && (
        <RoomSettingsModal
          onStart={onStartRoom}
          onBack={() => setShowSettings(false)}
          busy={createBusy}
        />
      )}

      <div className="relative z-10 flex min-h-svh flex-col items-center justify-center px-5 py-16">
        <div className="w-full max-w-xl text-center">
          <p
            className="font-display text-[11px] font-bold uppercase tracking-[0.45em] text-white/50"
          >
            Shared Jukebox
          </p>

          <h1
            className="font-display mt-4 text-[clamp(2rem,10vw,3.25rem)] font-bold uppercase leading-[1.05] tracking-[0.08em] text-white"
          >
            House Party
          </h1>

          <p className="mx-auto mt-5 max-w-[26rem] text-pretty text-sm leading-relaxed text-white/45">
            Start a room, invite friends, and build the playlist together. Queue tracks and vote on
            what plays next in real time.
          </p>

          {wasKicked && (
            <div className="mt-6 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-200">
              You were removed from the room.
            </div>
          )}

          <div className="app-glass-card mx-auto mt-10 w-1/2 min-w-0 p-4 text-left max-sm:w-full">
            <label className="app-label">Display name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="app-input"
              autoComplete="name"
            />

            <label className="app-label mt-4 block">Room code</label>
            {wasAutofilled ? (
              <p className="mt-1 text-[9px] font-semibold uppercase tracking-wider text-cyan-300/65">
                Rejoin last room
              </p>
            ) : null}
            <input
              value={joinCode}
              onChange={(e) => {
                setJoinCode(e.target.value.toUpperCase())
                setWasAutofilled(false)
              }}
              onKeyDown={(e) => e.key === 'Enter' && onJoin()}
              placeholder="Enter room code"
              maxLength={8}
              className={`app-input font-mono text-sm tracking-[0.2em] ${wasAutofilled ? 'border-cyan-400/25' : ''}`}
              autoComplete="off"
            />

            {err && (
              <p className="mt-3 text-xs leading-snug text-rose-300" role="alert">
                {err}
              </p>
            )}

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onClickCreate}
                disabled={busy}
                className="app-btn-secondary w-full"
              >
                Create
              </button>
              <button
                type="button"
                onClick={onJoin}
                disabled={busy}
                className="app-btn-secondary w-full"
              >
                {joinBusy ? 'Joining...' : 'Join'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
