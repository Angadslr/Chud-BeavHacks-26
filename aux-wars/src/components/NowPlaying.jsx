import { useEffect, useRef, useCallback, useState, memo } from 'react'

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

const AlbumCover = memo(function AlbumCover({ videoId, storedThumb }) {
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

function NowPlayingActive({
  nowPlaying,
  onEnded,
  onSkip,
  canSkip,
  onPrevious,
  canPrevious,
  hasNextInQueue = false,
}) {
  const hostRef = useRef(null)
  const playerRef = useRef(null)
  const endedVideoRef = useRef(null)
  const progressBarRef = useRef(null)
  const isScrubbingRef = useRef(false)
  const scrubTimeRef = useRef(0)

  const [ytState, setYtState] = useState(-1)
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
              syncStateFromPlayer()
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
          setProgress({ current: c, duration: d })
        }
      } catch {
        /* noop */
      }
    }, 250)

    return () => window.clearInterval(id)
  }, [videoId, ytState])

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
    if (!prevEnabled) return
    onPrevious()
  }, [prevEnabled, onPrevious])

  return (
    <div className="relative overflow-hidden rounded-lg border border-aux-border bg-aux-surface shadow-[0_1px_3px_rgba(28,25,23,0.06)]">
      <div
        ref={hostRef}
        className="pointer-events-none fixed -left-[9999px] bottom-0 h-[180px] w-[320px] opacity-[0.02]"
        aria-hidden
      />

      <div className="relative px-5 pb-6 pt-5 sm:px-7 sm:pb-7 sm:pt-6">
        <div className="mb-5 flex items-center justify-between gap-3 border-b border-aux-border pb-4">
          <div>
            <p className="text-xs font-medium text-aux-mint">Now playing</p>
            <p className="mt-0.5 text-xs text-aux-fg-subtle">YouTube</p>
          </div>
        </div>

        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:gap-8">
          <div className="relative mx-auto w-full max-w-[240px] shrink-0 sm:mx-0 sm:w-[200px]">
            <div className="relative aspect-square w-full overflow-hidden rounded-md shadow-[0_4px_20px_rgba(28,25,23,0.08)] ring-1 ring-black/5">
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
            </div>
          </div>

          <div className="min-w-0 flex-1 text-left">
            <h2 className="font-display line-clamp-2 text-pretty text-xl font-semibold leading-snug tracking-tight text-aux-ink sm:text-2xl">
              {nowPlaying.title}
            </h2>
            <p className="mt-1 line-clamp-1 text-sm text-aux-fg-muted sm:text-base">
              {nowPlaying.artist}
            </p>

            <div className="mt-6">
              <div className="flex items-center justify-between tabular-nums text-[11px] text-aux-fg-muted sm:text-xs">
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
                <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-stone-200" />
                <div
                  className="pointer-events-none absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-aux-mint"
                  style={{ width: `${progressPct}%` }}
                />
                <div
                  className={`pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-aux-elevated bg-aux-elevated shadow-sm transition-transform ${isScrubbing ? 'scale-110' : 'scale-100'}`}
                  style={{ left: `${progressPct}%` }}
                />
              </div>
            </div>

            <div className="mt-7 grid max-w-md grid-cols-3 items-center gap-2 sm:mt-8">
              <button
                type="button"
                onClick={handlePrevious}
                disabled={!prevEnabled}
                title={
                  prevEnabled
                    ? 'Previous track'
                    : 'No previous track yet — skip or finish a song first'
                }
                className="justify-self-start flex h-12 w-12 items-center justify-center rounded-full border border-aux-border bg-aux-elevated text-lg text-aux-fg transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-35 active:scale-95 sm:h-14 sm:w-14"
                aria-label="Previous track"
              >
                ⏮
              </button>

              <button
                type="button"
                onClick={togglePlayPause}
                className="justify-self-center flex h-14 w-14 items-center justify-center rounded-full bg-aux-ink text-lg text-stone-50 shadow-md transition-transform hover:bg-stone-800 active:scale-95 sm:h-16 sm:w-16 sm:text-xl"
                aria-label={showPlaying ? 'Pause' : 'Play'}
              >
                {showPlaying ? '⏸' : '▶'}
              </button>

              <button
                type="button"
                onClick={handleSkip}
                disabled={!skipEnabled}
                title={skipTitle}
                className="justify-self-end flex h-12 w-12 items-center justify-center rounded-full border border-aux-border bg-aux-elevated text-lg text-aux-fg transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-35 active:scale-95 sm:h-14 sm:w-14"
                aria-label="Skip forward"
              >
                ⏭
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function NowPlaying(props) {
  const videoId = props.nowPlaying?.videoId
  if (!videoId) {
    return (
      <div className="overflow-hidden rounded-lg border border-aux-border border-dashed bg-aux-surface/60">
        <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
          <div
            className="mb-5 h-px w-12 bg-aux-border"
            aria-hidden
          />
          <p className="text-sm font-medium text-aux-fg-muted">Nothing on yet</p>
          <p className="mt-2 max-w-[260px] text-sm leading-relaxed text-aux-fg-subtle">
            Add something to the queue. When a track ends, the next one in line
            starts.
          </p>
        </div>
      </div>
    )
  }

  return <NowPlayingActive key={videoId} {...props} />
}
