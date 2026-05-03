import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { customAlphabet } from 'nanoid'
import { createRoom, roomExists } from '../firebase/roomService'
import { setDisplayName, getDisplayName, getUserId } from '../lib/session'
import WavySpiralGraphic from '../components/WavySpiralGraphic'

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
  const cardRef = useRef(null)
  const graphicRef = useRef(null)

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
    <div
      ref={cardRef}
      className="box-border flex min-h-svh w-full flex-col overflow-hidden bg-aux-surface lg:h-svh lg:min-h-0 lg:flex-row"
    >
      {/* Copy + form */}
      <div className="flex min-h-0 flex-1 flex-col justify-between gap-3 overflow-y-auto px-5 py-5 sm:gap-4 sm:px-8 sm:py-8 lg:basis-0 lg:flex-1 lg:overflow-visible lg:px-12 lg:py-12 xl:px-16">
          <div>
            <p
              className="text-[10px] font-bold uppercase tracking-[0.35em] text-slate-400 sm:text-xs"
              style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
            >
              Shared jukebox
            </p>
            <h1
              className="mt-1 text-[clamp(1.85rem,5.5vw,3.25rem)] font-extrabold uppercase leading-[1.05] tracking-[0.06em] text-white"
              style={{ fontFamily: "'Syne', ui-sans-serif, system-ui, sans-serif" }}
            >
              Aux Wars
            </h1>
            <p
              className="mt-3 max-w-[22rem] text-[11px] leading-relaxed text-slate-300 sm:text-xs md:text-[13px]"
              style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
            >
              {'>'} shared_queue · live_vote · one_room<br />
              Battle for the aux. May the best song win.
            </p>
          </div>

          <div className="flex min-h-0 flex-col gap-3 lg:gap-3.5">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
                Display name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="your_handle"
                className="mt-1 w-full rounded-xl border border-slate-500/50 bg-black/35 px-3 py-2 text-sm font-medium text-white outline-none placeholder:text-slate-500 focus:border-slate-400 sm:py-2.5 sm:text-[15px]"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              />
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
                Room code
              </label>
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="JOIN_CODE"
                maxLength={8}
                className="mt-1 w-full rounded-xl border border-slate-500/50 bg-black/35 px-3 py-2 font-mono text-sm font-semibold uppercase tracking-[0.18em] text-white outline-none placeholder:text-slate-500 focus:border-slate-400 sm:py-2.5 sm:text-base"
              />
            </div>

            {err && (
              <p className="text-xs font-medium text-white" role="alert">
                {err}
              </p>
            )}

            {/* Both primary actions on one row — fits above the fold */}
            <div className="grid grid-cols-2 gap-2.5 pt-1 sm:gap-3">
              <button
                type="button"
                onClick={onCreate}
                disabled={busy}
                className="rounded-full bg-black px-3 py-2.5 text-center text-[11px] font-bold uppercase tracking-wide text-white shadow-md shadow-black/40 ring-1 ring-white/10 transition hover:bg-zinc-950 disabled:opacity-50 sm:text-xs sm:py-3"
              >
                {busy ? '…' : 'Create'}
              </button>
              <button
                type="button"
                onClick={onJoin}
                disabled={busy}
                className="rounded-full border-2 border-slate-400 bg-transparent px-3 py-2.5 text-center text-[11px] font-bold uppercase tracking-wide text-white transition hover:bg-slate-800/60 disabled:opacity-50 sm:text-xs sm:py-3"
              >
                Join
              </button>
            </div>
          </div>
      </div>

      {/* Wavy ribbon */}
      <div
        ref={graphicRef}
        className="relative min-h-[22vh] shrink-0 sm:min-h-[26vh] lg:min-h-0 lg:flex-1 lg:basis-0 lg:shrink"
      >
        <WavySpiralGraphic pointerRef={cardRef} sizeRef={graphicRef} lineTone="slate" />
      </div>
    </div>
  )
}
