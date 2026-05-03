import { useEffect, useRef, useCallback, useState, memo } from 'react'
import { updatePlaybackSync, subscribePlayback } from '../firebase/roomService'

let ytApiPromise = null

const YT_ENDED = 0
const YT_PLAYING = 1
const YT_BUFFERING = 3

function ensureYouTubeAPI() {
  if (window.YT && window.YT.Player) return Promise.resolve()
  if (!ytApiPromise) {
    ytApiPromise = new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prev === 'function') prev()
        resolve()
      }
      if (document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const iv = setInterval(() => {
          if (window.YT && window.YT.Player) {
            clearInterval(iv)
            resolve()
          }
        }, 50)
        return
      }
      const tag = document.createElement('script')
      tag.src = 'https://www.youtube.com/iframe_api'
      document.body.appendChild(tag)
    })
  }
  return ytApiPromise
}

function youtubePosterCandidates(videoId, storedThumb) {
  if (!videoId) return storedThumb ? [storedThumb] : []
  return [
    `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/default.jpg`,
    storedThumb,
  ].filter(Boolean)
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export const AlbumCover = memo(function AlbumCover({ videoId, storedThumb }) {
  const candidates = youtubePosterCandidates(videoId, storedThumb)
  const [posterIndex, setPosterIndex] = useState(0)
  const posterSrc =
    candidates[Math.min(posterIndex, Math.max(0, candidates.length - 1))] || ''

  return (
    <img
      src={posterSrc || storedThumb}
      alt=""
      className="h-full w-full object-cover"
      onError={() => {
        if (posterIndex < candidates.length - 1) {
          setPosterIndex((i) => i + 1)
        }
      }}
    />
  )
})

function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M4 2L14 8L4 14V2Z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x="3" y="2" width="4" height="12" rx="1" />
      <rect x="9" y="2" width="4" height="12" rx="1" />
    </svg>
  )
}

/** Guest view when playOnAllDevices is false — shows info + synced progress, no YouTube player */
function GuestReadOnlyPlayer({ nowPlaying, roomId }) {
  const [playbackData, setPlaybackData] = useState(null)
  const [displayTime, setDisplayTime] = useState(0)

  useEffect(() => {
    if (!roomId) return
    return subscribePlayback(roomId, setPlaybackData)
  }, [roomId])

  // Interpolate progress locally so the bar stays smooth between 5-second sync pulses
  useEffect(() => {
    const id = window.setInterval(() => {
      setDisplayTime(() => {
        if (!playbackData) return 0
        if (!playbackData.isPlaying) return playbackData.currentTime ?? 0
        const elapsed = (Date.now() - (playbackData.syncedAt ?? Date.now())) / 1000
        const cap = playbackData.duration || Infinity
        return Math.min((playbackData.currentTime ?? 0) + elapsed, cap)
      })
    }, 250)
    return () => window.clearInterval(id)
  }, [playbackData])

  const duration = playbackData?.duration || 0
  const progressPct = duration > 0 ? Math.min(100, Math.max(0, (displayTime / duration) * 100)) : 0
  const videoId = nowPlaying.videoId

  return (
    <>
      {/* Mobile mini-player */}
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#1a1a1d] px-3 py-2.5 sm:hidden">
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg">
          <AlbumCover key={videoId} videoId={videoId} storedThumb={nowPlaying.thumbnail} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{nowPlaying.title}</p>
          <p className="truncate text-xs text-white/50">{nowPlaying.artist}</p>
        </div>
        <span className="shrink-0 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] font-medium text-white/40">
          Host&apos;s device
        </span>
      </div>

      {/* Desktop full player */}
      <div className="relative hidden overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-[#1a1a1d] via-[#121214] to-[#080809] shadow-2xl shadow-black/60 sm:block">
        <div className="relative px-5 pb-6 pt-5 sm:px-7 sm:pb-7 sm:pt-6">
          <div className="mb-5 flex items-center justify-between gap-3 border-b border-white/5 pb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-aux-mint">Now playing</p>
              <p className="mt-0.5 text-[11px] text-white/35">Playing on host&apos;s device</p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wider text-white/40">
              Host Only
            </span>
          </div>

          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:gap-8">
            <div className="relative mx-auto w-full max-w-[240px] shrink-0 sm:mx-0 sm:w-[200px]">
              <div className="absolute -inset-2 rounded-3xl bg-aux-mint/12 blur-2xl" aria-hidden />
              <div className="relative aspect-square w-full overflow-hidden rounded-2xl shadow-[0_20px_40px_rgba(0,0,0,0.55)] ring-1 ring-white/12">
                <AlbumCover key={videoId} videoId={videoId} storedThumb={nowPlaying.thumbnail} />
              </div>
            </div>

            <div className="min-w-0 flex-1 text-left">
              <h2 className="line-clamp-2 text-pretty text-xl font-bold leading-snug tracking-tight text-white sm:text-2xl">
                {nowPlaying.title}
              </h2>
              <p className="mt-1 line-clamp-1 text-sm font-medium text-white/45 sm:text-base">
                {nowPlaying.artist}
              </p>

              {duration > 0 && (
                <div className="mt-6">
                  <div className="flex items-center justify-between tabular-nums text-[11px] text-white/40 sm:text-xs">
                    <span>{formatTime(displayTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                  <div className="relative mt-2 h-5 py-2">
                    <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white/12" />
                    <div
                      className="pointer-events-none absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-aux-mint"
                      style={{ width: `${progressPct}%`, transition: 'width 0.25s linear' }}
                    />
                  </div>
                </div>
              )}

              <div className="mt-6">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/45">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                    <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 12.5a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11zm0-9a.75.75 0 0 1 .75.75v3.69l2.28 2.28a.75.75 0 1 1-1.06 1.06L7.47 9.78A.75.75 0 0 1 7.25 9.2V5.25A.75.75 0 0 1 8 4.5z" />
                  </svg>
                  Playing on host&apos;s device
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function NowPlayingActive({
  nowPlaying,
  onEnded,
  onSkip,
  canSkip,
  onPrevious,
  canPrevious,
  hasNextInQueue = false,
  isHost = false,
  allowSkip = true,
  allowPause = true,
  playOnAllDevices = true,
  roomId = null,
}) {
  const hostRef = useRef(null)
  const playerRef = useRef(null)
  const endedVideoRef = useRef(null)
  const progressBarRef = useRef(null)
  const isScrubbingRef = useRef(false)
  const scrubTimeRef = useRef(0)
  const autoplayCheckRef = useRef(null)
  const currentTimeRef = useRef(0)

  const [ytState, setYtState] = useState(-1)
  const [autoplayBlocked, setAutoplayBlocked] = useState(false)
  const [progress, setProgress] = useState({ current: 0, duration: 0 })
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [scrubTime, setScrubTime] = useState(null)

  const videoId = nowPlaying.videoId
  const showPlaying = ytState === YT_PLAYING || ytState === YT_BUFFERING
  const skipEnabled = Boolean(canSkip && onSkip)
  const prevEnabled = Boolean(canPrevious && onPrevious)
  const skipTitle = !skipEnabled
    ? 'Nothing to skip'
    : hasNextInQueue
      ? 'Skip to the next track in the queue'
      : 'Stop playback (queue is empty)'

  const duration = progress.duration
  const displayTime =
    isScrubbing && scrubTime !== null ? scrubTime : progress.current
  const progressPct =
    duration > 0 ? Math.min(100, Math.max(0, (displayTime / duration) * 100)) : 0

  const syncStateFromPlayer = useCallback(() => {
    const p = playerRef.current
    if (!p || typeof p.getPlayerState !== 'function') return
    try {
      setYtState(p.getPlayerState())
    } catch {
      /* noop */
    }
  }, [])

  const handleStateChange = useCallback(
    (event) => {
      const st = event.data
      setYtState(st)
      if (st === YT_PLAYING || st === YT_BUFFERING) {
        setAutoplayBlocked(false)
      }
      if (st === YT_ENDED) {
        const v = endedVideoRef.current
        if (v) onEnded?.(v)
      }
    },
    [onEnded],
  )

  useEffect(() => {
    endedVideoRef.current = videoId
  }, [videoId])

  useEffect(() => {
    let cancelled = false

    setAutoplayBlocked(false)
    if (autoplayCheckRef.current) {
      window.clearTimeout(autoplayCheckRef.current)
      autoplayCheckRef.current = null
    }

    ;(async () => {
      await ensureYouTubeAPI()
      if (cancelled || !hostRef.current) return

      setYtState(-1)

      if (!playerRef.current) {
        hostRef.current.innerHTML = ''
        const div = document.createElement('div')
        div.id = `yt-aux-wars-${videoId}`
        hostRef.current.appendChild(div)
        playerRef.current = new window.YT.Player(div.id, {
          videoId,
          playerVars: {
            autoplay: 1,
            rel: 0,
            modestbranding: 1,
            controls: 0,
            playsinline: 1,
            iv_load_policy: 3,
            showinfo: 0,
          },
          events: {
            onReady: () => {
              if (cancelled) return
              syncStateFromPlayer()
              autoplayCheckRef.current = window.setTimeout(() => {
                if (cancelled || !playerRef.current) return
                try {
                  const st = playerRef.current.getPlayerState?.()
                  if (st !== YT_PLAYING && st !== YT_BUFFERING) {
                    setAutoplayBlocked(true)
                  }
                } catch {
                  /* noop */
                }
              }, 1200)
            },
            onStateChange: handleStateChange,
          },
        })
      } else {
        try {
          playerRef.current.loadVideoById(videoId)
        } catch {
          /* noop */
        }
      }
    })()

    return () => {
      cancelled = true
      if (autoplayCheckRef.current) {
        window.clearTimeout(autoplayCheckRef.current)
        autoplayCheckRef.current = null
      }
    }
  }, [videoId, handleStateChange, syncStateFromPlayer])

  useEffect(() => {
    return () => {
      if (playerRef.current) {
        try {
          playerRef.current.destroy()
        } catch {
          /* noop */
        }
        playerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => {
      if (isScrubbingRef.current) return
      const p = playerRef.current
      if (!p || typeof p.getCurrentTime !== 'function') return
      try {
        const c = p.getCurrentTime()
        const d = p.getDuration()
        if (Number.isFinite(d) && d > 0) {
          currentTimeRef.current = c
          setProgress({ current: c, duration: d })
        }
      } catch {
        /* noop */
      }
    }, 250)

    return () => window.clearInterval(id)
  }, [videoId, ytState])

  // Host: write playback position to Firebase every 5 s so guests can display / sync
  useEffect(() => {
    if (!isHost || !roomId) return
    const id = window.setInterval(() => {
      const p = playerRef.current
      if (!p || typeof p.getCurrentTime !== 'function') return
      try {
        const ct = p.getCurrentTime()
        const d = p.getDuration()
        const st = p.getPlayerState()
        updatePlaybackSync(roomId, ct, d, st === YT_PLAYING).catch(() => {})
      } catch {
        /* noop */
      }
    }, 5000)
    return () => window.clearInterval(id)
  }, [isHost, roomId])

  // Guest in playOnAllDevices mode: subscribe and seek if drift > 3 s
  useEffect(() => {
    if (isHost || !roomId || !playOnAllDevices) return
    return subscribePlayback(roomId, (data) => {
      if (!data) return
      const p = playerRef.current
      if (!p || typeof p.getCurrentTime !== 'function') return
      try {
        const elapsed = data.isPlaying ? (Date.now() - (data.syncedAt ?? Date.now())) / 1000 : 0
        const expected = (data.currentTime ?? 0) + elapsed
        const myTime = p.getCurrentTime()
        if (Math.abs(myTime - expected) > 3) {
          p.seekTo(expected, true)
        }
        const st = p.getPlayerState()
        if (data.isPlaying && st !== YT_PLAYING && st !== YT_BUFFERING) {
          p.playVideo()
        } else if (!data.isPlaying && st === YT_PLAYING) {
          p.pauseVideo()
        }
      } catch {
        /* noop */
      }
    })
  }, [isHost, roomId, playOnAllDevices])

  const seekFromClientX = useCallback(
    (clientX) => {
      const el = progressBarRef.current
      const p = playerRef.current
      const d = duration
      if (!el || !p || !Number.isFinite(d) || d <= 0) return

      const rect = el.getBoundingClientRect()
      const x = Math.min(Math.max(0, clientX - rect.left), rect.width)
      const t = (x / rect.width) * d
      const clamped = Math.min(Math.max(0, t), d)
      scrubTimeRef.current = clamped
      setScrubTime(clamped)
    },
    [duration],
  )

  const endScrub = useCallback(() => {
    const p = playerRef.current
    const t = scrubTimeRef.current
    isScrubbingRef.current = false
    setIsScrubbing(false)
    setScrubTime(null)
    if (p && typeof p.seekTo === 'function' && Number.isFinite(t)) {
      try {
        p.seekTo(t, true)
        setProgress((prev) => ({ ...prev, current: t }))
      } catch {
        /* noop */
      }
    }
  }, [])

  const onProgressPointerDown = useCallback(
    (e) => {
      if (!duration || duration <= 0) return
      const target = progressBarRef.current
      if (!target) return
      isScrubbingRef.current = true
      setIsScrubbing(true)
      target.setPointerCapture(e.pointerId)
      seekFromClientX(e.clientX)
    },
    [duration, seekFromClientX],
  )

  const onProgressPointerMove = useCallback(
    (e) => {
      if (!isScrubbingRef.current) return
      seekFromClientX(e.clientX)
    },
    [seekFromClientX],
  )

  const onProgressPointerUp = useCallback(
    (e) => {
      if (!isScrubbingRef.current) return
      const target = progressBarRef.current
      if (target && target.hasPointerCapture(e.pointerId)) {
        target.releasePointerCapture(e.pointerId)
      }
      endScrub()
    },
    [endScrub],
  )

  const togglePlayPause = useCallback(() => {
    const p = playerRef.current
    if (!p) return
    try {
      const st = p.getPlayerState()
      if (st === YT_PLAYING || st === YT_BUFFERING) {
        p.pauseVideo()
      } else {
        p.playVideo()
        setAutoplayBlocked(false)
      }
    } catch {
      /* noop */
    }
  }, [])

  const handleSkip = useCallback(() => {
    if (!skipEnabled) return
    onSkip()
  }, [skipEnabled, onSkip])

  const handlePrevious = useCallback(() => {
    if (currentTimeRef.current > 5) {
      // Restart current song from the beginning
      const p = playerRef.current
      if (p && typeof p.seekTo === 'function') {
        try {
          p.seekTo(0, true)
          currentTimeRef.current = 0
          setProgress((prev) => ({ ...prev, current: 0 }))
        } catch {
          /* noop */
        }
      }
    } else if (prevEnabled) {
      onPrevious()
    }
  }, [prevEnabled, onPrevious])

  const tapToPlay = useCallback(() => {
    const p = playerRef.current
    if (p) {
      try {
        p.playVideo()
        setAutoplayBlocked(false)
      } catch {
        /* noop */
      }
    }
  }, [])

  return (
    <>
      {/* Hidden YouTube iframe — audio source */}
      <div
        ref={hostRef}
        className="pointer-events-none fixed -left-[9999px] bottom-0 h-[180px] w-[320px] opacity-[0.02]"
        aria-hidden
      />

      {/* Mobile mini-player (< sm) */}
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#1a1a1d] px-3 py-2.5 sm:hidden">
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg">
          <AlbumCover key={videoId} videoId={videoId} storedThumb={nowPlaying.thumbnail} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">
            {nowPlaying.title}
          </p>
          <p className="truncate text-xs text-white/50">{nowPlaying.artist}</p>
        </div>
        {autoplayBlocked ? (
          <button
            type="button"
            onClick={tapToPlay}
            className="shrink-0 rounded-full bg-aux-mint px-3 py-1.5 text-xs font-bold text-black"
          >
            Tap to play
          </button>
        ) : allowPause ? (
          <button
            type="button"
            onClick={togglePlayPause}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-black shadow transition-transform active:scale-95"
            aria-label={showPlaying ? 'Pause' : 'Play'}
          >
            {showPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>
        ) : null}
        {isHost && allowSkip && (
          <button
            type="button"
            onClick={handleSkip}
            disabled={!skipEnabled}
            title={skipTitle}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/5 text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35 active:scale-95"
            aria-label="Skip song"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M3 2L11 8L3 14V2Z" />
              <rect x="12" y="2" width="2" height="12" rx="1" />
            </svg>
          </button>
        )}
      </div>

      {/* Desktop full player (≥ sm) */}
      <div className="relative hidden overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-[#1a1a1d] via-[#121214] to-[#080809] shadow-2xl shadow-black/60 sm:block">
        <div className="relative px-5 pb-6 pt-5 sm:px-7 sm:pb-7 sm:pt-6">
          <div className="mb-5 flex items-center justify-between gap-3 border-b border-white/5 pb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-aux-mint">
                Now playing
              </p>
              <p className="mt-0.5 text-[11px] text-white/35">Aux Wars · room</p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wider text-white/40">
              YouTube
            </span>
          </div>

          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:gap-8">
            <div className="relative mx-auto w-full max-w-[240px] shrink-0 sm:mx-0 sm:w-[200px]">
              <div
                className="absolute -inset-2 rounded-3xl bg-aux-mint/12 blur-2xl"
                aria-hidden
              />
              <div className="relative aspect-square w-full overflow-hidden rounded-2xl shadow-[0_20px_40px_rgba(0,0,0,0.55)] ring-1 ring-white/12">
                <AlbumCover
                  key={videoId}
                  videoId={videoId}
                  storedThumb={nowPlaying.thumbnail}
                />
                <div
                  className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-white/5"
                  aria-hidden
                />
                <div
                  className="pointer-events-none absolute inset-0 shadow-[inset_0_0_32px_rgba(0,0,0,0.35)]"
                  aria-hidden
                />

                {/* Tap to play overlay — shown when autoplay is blocked */}
                {autoplayBlocked && (
                  <button
                    type="button"
                    onClick={tapToPlay}
                    className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/65"
                    aria-label="Tap to play"
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/30 bg-white/10 text-2xl text-white">
                      ▶
                    </div>
                    <span className="mt-2 text-sm font-semibold text-white">
                      Tap to play
                    </span>
                  </button>
                )}
              </div>
            </div>

            <div className="min-w-0 flex-1 text-left">
              <h2 className="line-clamp-2 text-pretty text-xl font-bold leading-snug tracking-tight text-white sm:text-2xl">
                {nowPlaying.title}
              </h2>
              <p className="mt-1 line-clamp-1 text-sm font-medium text-white/45 sm:text-base">
                {nowPlaying.artist}
              </p>

              <div className="mt-6">
                <div className="flex items-center justify-between tabular-nums text-[11px] text-white/40 sm:text-xs">
                  <span>{formatTime(displayTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
                <div
                  ref={progressBarRef}
                  role="slider"
                  tabIndex={0}
                  aria-label="Seek track"
                  aria-valuemin={0}
                  aria-valuemax={Math.round(duration) || 0}
                  aria-valuenow={Math.round(displayTime)}
                  aria-disabled={duration <= 0}
                  className={`relative mt-2 h-5 cursor-pointer touch-none rounded-full py-2 ${duration > 0 ? '' : 'pointer-events-none opacity-40'}`}
                  onPointerDown={onProgressPointerDown}
                  onPointerMove={onProgressPointerMove}
                  onPointerUp={onProgressPointerUp}
                  onPointerCancel={onProgressPointerUp}
                  onKeyDown={(e) => {
                    if (duration <= 0) return
                    const p = playerRef.current
                    if (!p?.seekTo) return
                    const step = Math.min(10, duration * 0.05)
                    let next = displayTime
                    if (e.key === 'ArrowRight') next = Math.min(duration, displayTime + step)
                    else if (e.key === 'ArrowLeft') next = Math.max(0, displayTime - step)
                    else return
                    e.preventDefault()
                    try {
                      p.seekTo(next, true)
                      setProgress((prev) => ({ ...prev, current: next }))
                    } catch {
                      /* noop */
                    }
                  }}
                >
                  <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white/12" />
                  <div
                    className="pointer-events-none absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-aux-mint"
                    style={{ width: `${progressPct}%` }}
                  />
                  <div
                    className={`pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-white shadow-md transition-transform ${isScrubbing ? 'scale-110' : 'scale-100'}`}
                    style={{ left: `${progressPct}%` }}
                  />
                </div>
              </div>

              <div className="mt-7 flex max-w-md items-center gap-2 sm:mt-8">
                {prevEnabled && (
                  <button
                    type="button"
                    onClick={handlePrevious}
                    title="Restart song · hold for 5 s to go to previous track"
                    className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/5 text-white transition-colors hover:bg-white/10 active:scale-95 sm:h-14 sm:w-14"
                    aria-label="Previous / restart track"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                      <rect x="2" y="2" width="2" height="12" rx="1" />
                      <path d="M13 2L5 8L13 14V2Z" />
                    </svg>
                  </button>
                )}

                {allowPause ? (
                  <button
                    type="button"
                    onClick={togglePlayPause}
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-black shadow-lg shadow-black/35 transition-transform hover:brightness-95 active:scale-95 sm:h-16 sm:w-16"
                    aria-label={showPlaying ? 'Pause' : 'Play'}
                  >
                    {showPlaying ? <PauseIcon /> : <PlayIcon />}
                  </button>
                ) : null}

                {isHost && allowSkip && (
                  <button
                    type="button"
                    onClick={handleSkip}
                    disabled={!skipEnabled}
                    title={skipTitle}
                    className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/5 text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35 active:scale-95 sm:h-14 sm:w-14"
                    aria-label="Skip song"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                      <path d="M3 2L11 8L3 14V2Z" />
                      <rect x="12" y="2" width="2" height="12" rx="1" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default function NowPlaying(props) {
  const videoId = props.nowPlaying?.videoId
  if (!videoId) {
    return (
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-[#1c1c1f] to-[#0d0d0f] shadow-xl shadow-black/50">
        <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
          <div className="mb-4 flex h-28 w-28 items-center justify-center rounded-2xl bg-white/5 ring-1 ring-white/10">
            <span className="text-4xl opacity-40" aria-hidden>
              ♪
            </span>
          </div>
          <p className="text-sm font-medium text-white/45">Nothing playing</p>
          <p className="mt-1 max-w-[240px] text-xs text-white/30">
            Add tracks to the queue — the room will pick the next winner automatically.
          </p>
        </div>
      </div>
    )
  }

  // Guest in host-only mode: show read-only info view (no YouTube player)
  if (!props.isHost && props.playOnAllDevices === false) {
    return <GuestReadOnlyPlayer nowPlaying={props.nowPlaying} roomId={props.roomId} />
  }

  return <NowPlayingActive key={videoId} {...props} />
}
