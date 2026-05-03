import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useRoom } from '../hooks/useRoom'
import { useQueue } from '../hooks/useQueue'
import { useVoting } from '../hooks/useVoting'
import {
  upsertUser,
  advanceToNextSong,
  forceSkipToNext,
  goToPreviousTrack,
  kickUser,
} from '../firebase/roomService'
import { getDisplayName, getUserId } from '../lib/session'
import NowPlaying from '../components/NowPlaying'
import VibeLeaderboard, {
  PlayHistorySection,
} from '../components/VibeLeaderboard'
import SwipeStack from '../components/SwipeCard'
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
  // 'swipe' | 'list' — only relevant on mobile
  const [voteTab, setVoteTab] = useState('swipe')
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

  // Kicked detection: redirect if the host removed this user
  useEffect(() => {
    if (!room || loading || !userId) return
    if (room.users && !room.users[userId] && room.hostId && userId !== room.hostId) {
      navigate('/?kicked=1', { replace: true })
    }
  }, [room, loading, userId, navigate])

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

  const handleKickUser = useCallback(
    (targetUserId) => {
      if (!roomId) return
      kickUser(roomId, targetUserId).catch(console.error)
    },
    [roomId],
  )

  // Persist roomId so Landing can auto-fill on return
  useEffect(() => {
    if (roomId && !loading && exists) {
      localStorage.setItem('lastRoomId', roomId)
    }
  }, [roomId, loading, exists])

  const copyLink = async () => {
    const url = `${window.location.origin}/room/${roomId}`
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Join my No Skip room', url })
      } else {
        await navigator.clipboard.writeText(url)
      }
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
          className="rounded-xl bg-aux-mint px-6 py-3 font-semibold text-black"
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

  const isHost = Boolean(room?.hostId && userId === room.hostId)
  const settings = room?.settings || {}
  const allowSkip = settings.allowSkip !== false
  const allowPause = settings.allowPause !== false
  const playOnAllDevices = settings.playOnAllDevices !== false
  const unvotedQueue = queueSorted.filter((s) => !getMyVote(s.id))

  return (
    <div className="min-h-svh bg-gradient-to-b from-aux-bg via-[#101012] to-aux-bg">
      <header className="sticky top-0 z-20 border-b border-aux-border bg-[#0d0d0f]/90 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-sm font-semibold text-white/50 hover:text-white">
              ← Home
            </Link>
            <div className="h-6 w-px bg-white/15" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                Room code
              </p>
              <p className="font-mono text-xl font-bold tracking-[0.2em] text-aux-mint">
                {roomId}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={copyLink}
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
            >
              {copied ? 'Shared!' : 'Share link'}
            </button>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="rounded-xl bg-aux-mint px-4 py-2 text-sm font-bold text-black hover:brightness-110"
            >
              Add song
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
              isHost={isHost}
              allowSkip={allowSkip}
              allowPause={allowPause}
              playOnAllDevices={playOnAllDevices}
              roomId={roomId}
            />
            <UserList
              users={room.users}
              isHost={isHost}
              currentUserId={userId}
              onKick={handleKickUser}
            />
            <HallOfShame users={room.users} />
          </div>

          <div className="space-y-4">
            {/* Mobile tab switcher — Swipe vs List */}
            <div className="flex rounded-xl border border-aux-border bg-black/25 p-1 lg:hidden">
              <button
                type="button"
                onClick={() => setVoteTab('swipe')}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
                  voteTab === 'swipe'
                    ? 'bg-aux-mint text-black'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                Swipe
              </button>
              <button
                type="button"
                onClick={() => setVoteTab('list')}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
                  voteTab === 'list'
                    ? 'bg-aux-mint text-black'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                Leaderboard
              </button>
            </div>

            {/* Swipe view: active on mobile when swipe tab, always on desktop */}
            <div className={`${voteTab === 'swipe' ? 'block' : 'hidden'} lg:block`}>
              <SwipeStack items={unvotedQueue} onVote={vote} onAddSong={() => setSearchOpen(true)} />
            </div>

            {/* Leaderboard: active on mobile when list tab, always on desktop */}
            <div className={`${voteTab === 'list' ? 'block' : 'hidden'} lg:block`}>
              <div>
                <h2 className="mb-2 text-left text-sm font-semibold uppercase tracking-wider text-white/45">
                  Leaderboard
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
