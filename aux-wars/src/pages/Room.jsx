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
        particleCount: 55,
        spread: 58,
        origin: { y: 0.38 },
        colors: ['#0f766e', '#ebe6dd', '#b45348', '#fffcf7'],
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
      <div className="flex min-h-svh flex-col items-center justify-center gap-5 px-4">
        <p className="max-w-sm text-center text-aux-fg-muted">
          Add your name on the home page first.
        </p>
        <Link
          to="/"
          className="rounded-md bg-aux-ink px-6 py-2.5 text-sm font-semibold text-stone-50"
        >
          Back home
        </Link>
      </div>
    )
  }

  if (loading || !room) {
    return (
      <div className="flex min-h-svh items-center justify-center text-aux-fg-muted">
        Loading…
      </div>
    )
  }

  return (
    <div className="min-h-svh">
      <header className="sticky top-0 z-20 border-b border-aux-border bg-aux-surface/90 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="text-sm font-medium text-aux-fg-muted hover:text-aux-fg"
            >
              ← Home
            </Link>
            <div className="hidden h-5 w-px bg-aux-border sm:block" />
            <div>
              <p className="text-xs text-aux-fg-subtle">Room</p>
              <p className="font-mono text-lg font-semibold tracking-[0.18em] text-aux-mint">
                {roomId}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={copyLink}
              className="rounded-md border border-aux-border bg-aux-elevated px-3 py-2 text-sm font-medium text-aux-fg shadow-[0_1px_1px_rgba(28,25,23,0.04)] hover:bg-stone-50"
            >
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="rounded-md bg-aux-ink px-3 py-2 text-sm font-semibold text-stone-50 hover:bg-stone-800"
            >
              Add a song
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {toast && (
          <div
            className="mb-5 rounded-md border border-aux-border bg-aux-surface px-4 py-3 text-center text-sm text-aux-fg"
            role="status"
          >
            {toast}
          </div>
        )}
        {voteErrorFlash && (
          <div className="mb-5 rounded-md border border-amber-800/20 bg-amber-50 px-4 py-2.5 text-center text-sm text-amber-950">
            Couldn&apos;t save that vote. Try again.
          </div>
        )}

        <div className="grid gap-10 lg:grid-cols-2 lg:gap-12">
          <div className="space-y-6">
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

          <div>
            <h2 className="font-display text-xl font-semibold text-aux-ink">
              The queue
            </h2>
            <p className="mt-1 max-w-md text-sm leading-relaxed text-aux-fg-muted">
              Vote on anything in the list. You can change your vote — it keeps
              the order honest.
            </p>
            <div className="mt-6">
              <VibeLeaderboard
                items={queueSorted}
                emptyHint="Nothing queued yet. Add a track when you’re ready."
                onVote={vote}
                getMyVote={getMyVote}
              />
              <PlayHistorySection playHistory={room.playHistory} />
            </div>
          </div>
        </div>
      </main>

      <SearchModal
        roomId={roomId}
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
      />
    </div>
  )
}
