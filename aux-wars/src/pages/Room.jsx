import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useRoom } from '../hooks/useRoom'
import { useSortedQueue } from '../hooks/useQueue'
import { useVoting } from '../hooks/useVoting'
import {
  upsertUser,
  advanceToNextSong,
  cleanupInvalidQueueEntries,
  forceSkipToNext,
  goToPreviousTrack,
  kickUser,
  subscribeUserPresence,
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
import LandingRibCanvas from '../components/LandingRibCanvas'

const INACTIVITY_MS = 3 * 60 * 60 * 1000

export default function Room() {
  const { roomId: roomParam } = useParams()
  const roomId = useMemo(() => (roomParam || '').toUpperCase(), [roomParam])
  const navigate = useNavigate()
  const { room, loading, exists } = useRoom(roomId)
  const queueSorted = useSortedQueue(roomId)
  const userId = getUserId()
  const displayName = getDisplayName()
  const { vote, getMyVote, toast, voteErrorFlash } = useVoting(
    roomId,
    userId,
    room?.votes,
  )

  const [searchOpen, setSearchOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [joinTimedOut, setJoinTimedOut] = useState(false)
  const [roomAlert, setRoomAlert] = useState(null)
  // 'swipe' | 'list' — only relevant on mobile
  const [voteTab, setVoteTab] = useState('swipe')
  const queueCleanupRoomIdRef = useRef(null)
  const hasJoinedRef = useRef(false)
  useEffect(() => {
    if (!roomId || !displayName.trim() || !userId) return undefined
    let cancelled = false
    let seenInitialSnapshot = false
    let unsubscribePresence = null
    let graceTimer = null

    hasJoinedRef.current = false

    ;(async () => {
      try {
        await upsertUser(roomId, userId, displayName.trim())
        if (cancelled) return

        graceTimer = window.setTimeout(() => {
          if (cancelled) return
          hasJoinedRef.current = true
          unsubscribePresence = subscribeUserPresence(roomId, userId, (existsInRoom) => {
            if (!hasJoinedRef.current) return
            if (!seenInitialSnapshot) {
              seenInitialSnapshot = true
              return
            }
            if (!existsInRoom) {
              navigate('/?kicked=1', { replace: true })
            }
          })
        }, 1000)
      } catch (err) {
        console.error(err)
      }
    })()

    return () => {
      cancelled = true
      hasJoinedRef.current = false
      if (graceTimer) window.clearTimeout(graceTimer)
      if (unsubscribePresence) unsubscribePresence()
    }
  }, [roomId, userId, displayName, navigate])

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
    if (!loading) {
      setJoinTimedOut(false)
      return undefined
    }
    const timer = window.setTimeout(() => {
      setJoinTimedOut(true)
    }, 5000)
    return () => window.clearTimeout(timer)
  }, [loading, roomId])

  // Only the host should trigger queue advances — prevents all guests from
  // racing to write Firebase when the song ends or on initial idle load.
  useEffect(() => {
    if (!roomId || !room) return
    if (userId !== room?.hostId) return
    const np = room.nowPlaying
    const hasQueue = queueSorted.length > 0
    if (!np?.videoId && hasQueue) {
      advanceToNextSong(roomId, null).catch(console.error)
    }
  }, [roomId, room, queueSorted.length, userId])

  const onEnded = useCallback(
    (videoId) => {
      if (!roomId || !videoId) return
      if (userId !== room?.hostId) return  // only host advances the queue
      advanceToNextSong(roomId, videoId).catch(console.error)
    },
    [roomId, userId, room?.hostId],
  )

  const onSkipTrack = useCallback(() => {
    console.log('[AuxWars] skip: handler invoked', {
      roomId,
      userId,
      hostId: room?.hostId,
    })
    if (!roomId || !room) return
    if (userId !== room.hostId) return
    forceSkipToNext(roomId).catch(console.error)
  }, [roomId, room, userId])

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

  const unvotedQueue = useMemo(() => {
    const name = displayName.trim()
    return queueSorted.filter((s) => {
      if (getMyVote(s.id)) return false
      if (userId && s.addedByUserId && s.addedByUserId === userId) return false
      if (name && String(s.addedBy || '').trim() === name) return false
      return true
    })
  }, [queueSorted, getMyVote, displayName, userId])

  // Persist roomId so Landing can auto-fill on return
  useEffect(() => {
    if (roomId && !loading && exists) {
      localStorage.setItem('lastRoomId', roomId)
    }
  }, [roomId, loading, exists])

  useEffect(() => {
    queueCleanupRoomIdRef.current = null
  }, [roomId])

  useEffect(() => {
    if (!roomId || loading || !room) return
    if (queueCleanupRoomIdRef.current === roomId) return
    queueCleanupRoomIdRef.current = roomId
    cleanupInvalidQueueEntries(roomId).catch(console.error)
  }, [roomId, loading, room])

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
      <div className="app-page flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-sm text-white/70">Set your display name on the home page first.</p>
        <Link to="/" className="app-btn-secondary px-6">
          Go back
        </Link>
      </div>
    )
  }

  if (loading || !room) {
    if (joinTimedOut) {
      return (
        <div className="app-page flex min-h-svh flex-col items-center justify-center gap-4 px-4 text-center">
          <p className="text-sm text-white/75">
            Could not connect to room — check the room code and try again
          </p>
          <Link to="/" className="app-btn-secondary px-6">
            Back to home
          </Link>
        </div>
      )
    }
    return (
      <div className="app-page flex items-center justify-center text-sm text-white/50">
        Loading room…
      </div>
    )
  }

  const isHost = Boolean(room?.hostId && userId === room.hostId)
  const settings = room?.settings || {}
  const allowSkip = settings.allowSkip !== false
  const allowPause = settings.allowPause !== false
  const allowGuestRequests =
    settings.allowGuestRequests ?? settings.allowRequests !== false
  const playOnAllDevices = settings.playOnAllDevices !== false
  const canRequestSongs = isHost || allowGuestRequests

  const openAddSong = () => {
    if (!canRequestSongs) {
      setSearchOpen(false)
      setRoomAlert('The host has disabled song requests')
      window.setTimeout(() => setRoomAlert(null), 2500)
      return
    }
    setSearchOpen(true)
  }

  return (
    <div className="app-page relative w-full min-w-0 max-w-full overflow-x-hidden">
      <LandingRibCanvas />
      <div
        className="pointer-events-none fixed -left-[20%] -top-[15%] h-[55vmin] w-[55vmin] rounded-full bg-cyan-500/25 blur-[100px]"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed -bottom-[20%] -left-[15%] h-[50vmin] w-[50vmin] rounded-full bg-amber-400/15 blur-[90px]"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed -right-[15%] -top-[10%] h-[48vmin] w-[48vmin] rounded-full bg-fuchsia-600/20 blur-[100px]"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed -bottom-[15%] -right-[12%] h-[55vmin] w-[55vmin] rounded-full bg-violet-500/22 blur-[110px]"
        aria-hidden
      />

      <header className="sticky top-0 z-20 box-border w-full max-w-full overflow-hidden border-b border-white/10 bg-[#0a0c14]/90 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-3 min-[481px]:flex-row min-[481px]:flex-wrap min-[481px]:items-center min-[481px]:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              to="/"
              className="shrink-0 text-sm font-semibold text-white/50 transition-colors hover:text-white"
            >
              ← Home
            </Link>
            <div className="h-6 w-px shrink-0 bg-white/15" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                Room code
              </p>
              <p
                className="break-all font-mono font-bold tracking-[0.12em] text-cyan-300 min-[481px]:tracking-[0.2em]"
                style={{ fontSize: 'clamp(14px, 4vw, 20px)' }}
              >
                {roomId}
              </p>
            </div>
          </div>
          <div className="flex w-full min-w-0 shrink-0 items-stretch gap-2 min-[481px]:w-auto min-[481px]:items-center min-[481px]:justify-end">
            <button
              type="button"
              onClick={copyLink}
              className="app-btn-secondary min-h-11 min-w-0 flex-1 text-sm font-semibold normal-case tracking-normal min-[481px]:flex-none"
            >
              {copied ? 'Shared!' : 'Share link'}
            </button>
            {canRequestSongs ? (
              <button
                type="button"
                onClick={openAddSong}
                className="app-btn-secondary min-h-11 min-w-0 flex-1 text-sm font-semibold normal-case tracking-normal min-[481px]:flex-none"
              >
                Add song
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto box-border w-full min-w-0 max-w-6xl overflow-x-hidden px-4 py-6">
        {toast && (
          <div
            className="mb-4 rounded-xl border border-aux-coral/40 bg-aux-coral/10 px-4 py-3 text-center text-sm font-medium text-white"
            role="status"
          >
            {toast}
          </div>
        )}
        {roomAlert && (
          <div
            className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center text-sm font-medium text-amber-100"
            role="status"
          >
            {roomAlert}
          </div>
        )}
        {voteErrorFlash && (
          <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-sm text-amber-200">
            Couldn&apos;t update vote — try again.
          </div>
        )}

        <div className="grid min-w-0 gap-6 lg:grid-cols-2">
          <div className="min-w-0 space-y-4">
            <NowPlaying
              nowPlaying={room.nowPlaying}
              onEnded={onEnded}
              onSkip={onSkipTrack}
              canSkip={
                queueSorted.length > 0 || Boolean(room.nowPlaying?.videoId)
              }
              onPrevious={onPreviousTrack}
              canPrevious={Boolean(
                room.previousSong?.videoId ?? room.previousTrack?.videoId,
              )}
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
            <HallOfShame users={room.users} queue={queueSorted} />
          </div>

          <div className="min-w-0 space-y-4">
            {/* Mobile tab switcher — Swipe vs List */}
            <div className="app-tab-track lg:hidden">
              <button
                type="button"
                onClick={() => setVoteTab('swipe')}
                className={`app-tab-pill ${voteTab === 'swipe' ? 'app-tab-pill-active' : 'app-tab-pill-idle'}`}
              >
                Swipe
              </button>
              <button
                type="button"
                onClick={() => setVoteTab('list')}
                className={`app-tab-pill ${voteTab === 'list' ? 'app-tab-pill-active' : 'app-tab-pill-idle'}`}
              >
                Leaderboard
              </button>
            </div>

            {/* Swipe view: active on mobile when swipe tab, always on desktop */}
            <div className={`${voteTab === 'swipe' ? 'block' : 'hidden'} lg:block`}>
              <SwipeStack items={unvotedQueue} onVote={vote} onAddSong={canRequestSongs ? openAddSong : undefined} />
            </div>

            {/* Leaderboard: active on mobile when list tab, always on desktop */}
            <div className={`${voteTab === 'list' ? 'block' : 'hidden'} lg:block`}>
              <div>
                <h2 className="mb-2 text-left text-sm font-semibold uppercase tracking-wider text-white/45">
                  Leaderboard
                </h2>
                <p className="mb-3 text-left text-sm leading-relaxed text-white/45">
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
        canRequestSongs={canRequestSongs}
        onGuestRequestsBlocked={() => {
          setSearchOpen(false)
          setRoomAlert('The host has disabled song requests')
          window.setTimeout(() => setRoomAlert(null), 2500)
        }}
      />
    </div>
  )
}
