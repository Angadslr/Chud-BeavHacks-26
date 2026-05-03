import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import confetti from 'canvas-confetti'
import { useRoom } from '../hooks/useRoom'
import { useQueue } from '../hooks/useQueue'
import { useVoting } from '../hooks/useVoting'
import {
  upsertUser,
  advanceToNextSong,
  forceSkipToNext,
  goToPreviousTrack,
} from '../firebase/roomService'
import { getDisplayName, getUserId } from '../lib/session'
import NowPlaying from '../components/NowPlaying'
import VibeLeaderboard, {
  PlayHistorySection,
} from '../components/VibeLeaderboard'
import SearchModal from '../components/SearchModal'
import UserList from '../components/UserList'
import HallOfShame from '../components/HallOfShame'

const INACTIVITY_MS = 3 * 60 * 60 * 1000

export default function Room() {
  const { roomId: roomParam } = useParams()
  const roomId = useMemo(() => (roomParam || '').toUpperCase(), [roomParam])
  const navigate = useNavigate()
  const { room, loading, exists } = useRoom(roomId)
  const queueSorted = useQueue(room?.queue)
  const userId = getUserId()
  const displayName = getDisplayName()
  const { vote, getMyVote, toast, voteErrorFlash } = useVoting(
    roomId,
    userId,
    room?.votes,
  )

  const [searchOpen, setSearchOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const prevVideoRef = useRef(undefined)

  useEffect(() => {
    if (!roomId || !displayName.trim()) return undefined
    upsertUser(roomId, userId, displayName.trim()).catch(console.error)
    return undefined
  }, [roomId, userId, displayName])

  useEffect(() => {
    if (!roomId) {
      navigate('/', { replace: true })
    }
  }, [roomId, navigate])

  useEffect(() => {
    if (!loading && !exists) {
      navigate('/', { replace: true })
    }
  }, [loading, exists, navigate])

  useEffect(() => {
    if (!room || loading) return
    const la = room.lastActivityAt
    if (la && Date.now() - la > INACTIVITY_MS) {
      navigate('/', { replace: true })
    }
  }, [room, loading, navigate])

  useEffect(() => {
    if (!roomId || !room) return
    const np = room.nowPlaying
    const hasQueue = queueSorted.length > 0
    if (!np?.videoId && hasQueue) {
      advanceToNextSong(roomId, null).catch(console.error)
    }
  }, [roomId, room, queueSorted.length])

  const onEnded = useCallback(
    (videoId) => {
      if (!roomId || !videoId) return
      advanceToNextSong(roomId, videoId).catch(console.error)
    },
    [roomId],
  )

  const onSkipTrack = useCallback(() => {
    if (!roomId) return
    forceSkipToNext(roomId).catch(console.error)
  }, [roomId])

  const onPreviousTrack = useCallback(() => {
    if (!roomId) return
    goToPreviousTrack(roomId).catch(console.error)
  }, [roomId])

  useEffect(() => {
    const v = room?.nowPlaying?.videoId
    if (v && prevVideoRef.current !== undefined && prevVideoRef.current !== v) {
      confetti({
        particleCount: 90,
        spread: 70,
        origin: { y: 0.35 },
        colors: ['#e2e8f0', '#ffffff', '#94a3b8'],
      })
    }
    prevVideoRef.current = v
  }, [room?.nowPlaying?.videoId])

  const copyLink = async () => {
    const url = `${window.location.origin}/room/${roomId}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* noop */
    }
  }

  if (!displayName.trim()) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-aux-bg px-4">
        <p className="text-white/70">Set your display name on the home page first.</p>
        <Link
          to="/"
          className="rounded-xl bg-aux-mint px-6 py-3 font-semibold text-[#0a1224]"
        >
          Go back
        </Link>
      </div>
    )
  }

  if (loading || !room) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-aux-bg text-white/50">
        Loading room…
      </div>
    )
  }

  return (
    <div className="min-h-svh bg-black">
      <header className="sticky top-0 z-20 border-b border-slate-700/60 bg-[#0a1224]/95 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-sm font-semibold text-white/50 hover:text-white">
              ← Home
            </Link>
            <div className="h-6 w-px bg-slate-600/50" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                Room code
              </p>
              <p className="font-mono text-xl font-bold tracking-[0.2em] text-aux-mint">
                {roomId}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-aux-mint px-5 py-3 text-sm font-extrabold uppercase tracking-[0.08em] text-[#0a1224] shadow-[0_0_0_1px_rgba(255,255,255,0.25),0_6px_28px_rgba(226,232,240,0.28)] ring-2 ring-aux-ice/55 transition hover:brightness-105 active:scale-[0.98] sm:px-7 sm:text-[15px]"
            >
              <span className="text-xl font-bold leading-none" aria-hidden>
                +
              </span>
              Add songs
            </button>
            <button
              type="button"
              onClick={copyLink}
              className="rounded-xl border border-slate-500/40 bg-black/30 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800/50"
            >
              {copied ? 'Copied!' : 'Copy link'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {toast && (
          <div
            className="mb-4 rounded-xl border border-aux-coral/40 bg-aux-coral/10 px-4 py-3 text-center text-sm font-medium text-white"
            role="status"
          >
            {toast}
          </div>
        )}
        {voteErrorFlash && (
          <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-sm text-amber-200">
            Couldn&apos;t update vote — try again.
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <NowPlaying
              nowPlaying={room.nowPlaying}
              onEnded={onEnded}
              onSkip={onSkipTrack}
              canSkip={
                queueSorted.length > 0 || Boolean(room.nowPlaying?.videoId)
              }
              onPrevious={onPreviousTrack}
              canPrevious={Boolean(room.previousTrack?.videoId)}
              hasNextInQueue={queueSorted.length > 0}
            />
            <UserList users={room.users} />
            <HallOfShame users={room.users} />
          </div>

          <div className="space-y-4">
            <div>
              <h2 className="mb-2 text-left text-sm font-semibold uppercase tracking-wider text-white/45">
                Vote on every track
              </h2>
              <p className="mb-3 text-left text-xs text-white/40">
                Thumbs up or down on each song. Change your mind anytime — your
                latest vote counts.
              </p>
              <VibeLeaderboard
                items={queueSorted}
                emptyHint="Add songs to start the battle"
                onVote={vote}
                getMyVote={getMyVote}
              />
              <PlayHistorySection playHistory={room.playHistory} />
            </div>
          </div>
        </div>
      </main>

      <SearchModal
        key={`${searchOpen ? 'open' : 'closed'}-${roomId}`}
        roomId={roomId}
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
      />
    </div>
  )
}
