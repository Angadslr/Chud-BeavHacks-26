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
      await createRoom(code)
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
    <div className="flex min-h-svh flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-[420px]">
        <p className="font-display text-lg font-medium text-aux-fg-muted">
          Shared listening
        </p>
        <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight text-aux-ink sm:text-[2.75rem] sm:leading-[1.1]">
          Aux Wars
        </h1>
        <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-aux-fg-muted">
          One queue, everyone votes, the room hears what actually lands.
        </p>

        <div className="mt-10 rounded-lg border border-aux-border bg-aux-surface p-6 shadow-[0_1px_2px_rgba(28,25,23,0.05)]">
          <label className="text-sm font-medium text-aux-fg" htmlFor="display-name">
            Your name
          </label>
          <input
            id="display-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="How others see you"
            className="mt-2 w-full rounded-md border border-aux-border bg-aux-elevated px-3 py-2.5 text-[15px] text-aux-fg placeholder:text-aux-fg-subtle focus:border-aux-fg-muted focus:outline-none focus:ring-1 focus:ring-aux-fg-muted/30"
          />

          {err && (
            <p className="mt-3 text-sm text-aux-coral" role="alert">
              {err}
            </p>
          )}

          <button
            type="button"
            onClick={onCreate}
            disabled={busy}
            className="mt-6 w-full rounded-md bg-aux-ink py-3 text-[15px] font-semibold text-stone-50 transition-colors hover:bg-stone-800 disabled:opacity-50"
          >
            {busy ? 'One moment…' : 'Start a room'}
          </button>

          <div className="my-7 flex items-center gap-4">
            <div className="h-px flex-1 bg-aux-border" />
            <span className="text-sm text-aux-fg-subtle">or join</span>
            <div className="h-px flex-1 bg-aux-border" />
          </div>

          <label className="text-sm font-medium text-aux-fg" htmlFor="room-code">
            Room code
          </label>
          <input
            id="room-code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="Six letters or digits"
            maxLength={8}
            className="mt-2 w-full rounded-md border border-aux-border bg-aux-elevated px-3 py-2.5 font-mono text-base tracking-[0.2em] text-aux-fg placeholder:text-aux-fg-subtle placeholder:tracking-normal focus:border-aux-fg-muted focus:outline-none focus:ring-1 focus:ring-aux-fg-muted/30"
          />
          <button
            type="button"
            onClick={onJoin}
            disabled={busy}
            className="mt-3 w-full rounded-md border border-aux-border bg-transparent py-3 text-[15px] font-semibold text-aux-fg transition-colors hover:bg-stone-900/[0.04] disabled:opacity-50"
          >
            Join
          </button>
        </div>
      </div>
    </div>
  )
}
