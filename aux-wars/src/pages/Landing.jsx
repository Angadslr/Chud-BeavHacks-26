import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
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

export default function Landing() {
  const navigate = useNavigate()
  const [name, setName] = useState(getDisplayName())
  const [joinCode, setJoinCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const saveName = () => {
    if (!name.trim()) {
      setErr('Pick a display name')
      return false
    }
    setDisplayName(name.trim())
    return true
  }

  const onCreate = async () => {
    setErr(null)
    if (!saveName()) return
    setBusy(true)
    try {
      const code = await uniqueRoomCode()
      await createRoom(code, getUserId())
      navigate(`/room/${code}`)
    } catch (e) {
      console.error(e)
      setErr('Could not create room — check Firebase config')
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
        setErr('Room not found')
        return
      }
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
      <div className="w-full max-w-md text-center">
        <h1 className="text-5xl font-black tracking-tight text-white sm:text-6xl">
          No Skip
        </h1>

        <div className="mt-10 rounded-2xl border border-aux-border bg-aux-surface/60 p-6 text-left shadow-xl shadow-black/30 backdrop-blur-sm">
          {/* Display name */}
          <label className="block text-xs font-semibold uppercase tracking-wider text-white/45">
            Display name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="How judges see you"
            className="mt-2 w-full rounded-xl border border-aux-border bg-black/35 px-4 py-3 text-white placeholder:text-white/35 focus:border-aux-mint/50 focus:outline-none focus:ring-1 focus:ring-aux-mint/40"
          />

          {/* Room code */}
          <label className="mt-5 block text-xs font-semibold uppercase tracking-wider text-white/45">
            Room code
          </label>
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && onJoin()}
            placeholder="e.g. X7K2M9"
            maxLength={8}
            className="mt-2 w-full rounded-xl border border-aux-border bg-black/35 px-4 py-3 font-mono text-lg tracking-widest text-white placeholder:text-white/35 focus:border-aux-mint/50 focus:outline-none focus:ring-1 focus:ring-aux-mint/40"
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
            onClick={onCreate}
            disabled={busy}
            className="w-full rounded-xl border border-white/20 bg-transparent py-3 text-sm font-medium text-white/65 hover:bg-white/5 hover:text-white/90 disabled:opacity-50"
          >
            {busy ? 'Working…' : 'Create a new room'}
          </button>
        </div>
      </div>
    </div>
  )
}
