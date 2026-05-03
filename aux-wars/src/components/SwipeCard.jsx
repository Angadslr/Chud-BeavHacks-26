import { useRef, useState, useCallback, useEffect, useMemo } from 'react'

const SWIPE_THRESHOLD = 80

const BAR_TRANSITION = 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)'

/** Match NowPlaying.jsx: read `title` and `artist` only (Firebase queue shape). */
function displayTitle(song) {
  if (song?.title == null) return ''
  return String(song.title).trim()
}

function displayArtist(song) {
  if (song?.artist == null) return ''
  return String(song.artist).trim()
}

function displayAddedBy(song) {
  if (song?.addedBy == null) return ''
  const s = String(song.addedBy).trim()
  return s
}

function SingleSwipeCard({ song, isTop, onVibe, onSkip }) {
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [flyDir, setFlyDir] = useState(null)
  const startXRef = useRef(null)

  const titleText = displayTitle(song)
  const artistText = displayArtist(song)
  const addedByLine = displayAddedBy(song)
  const hasVideoId = Boolean(song?.videoId)
  const showTextSkeleton = !titleText && !artistText && hasVideoId

  const vibeRatio = Math.min(1, Math.max(0, dragX / SWIPE_THRESHOLD))
  const skipRatio = Math.min(1, Math.max(0, -dragX / SWIPE_THRESHOLD))

  const triggerFly = useCallback(
    (dir) => {
      setDragging(false)
      setFlyDir(dir)
      const id = song.id
      window.setTimeout(() => {
        if (dir === 'right') onVibe?.(id)
        else onSkip?.(id)
      }, 420)
    },
    [song.id, onVibe, onSkip],
  )

  const onPointerDown = useCallback(
    (e) => {
      if (!isTop || flyDir) return
      e.currentTarget.setPointerCapture(e.pointerId)
      startXRef.current = e.clientX
      setDragging(true)
    },
    [isTop, flyDir],
  )

  const onPointerMove = useCallback(
    (e) => {
      if (!dragging || startXRef.current === null) return
      setDragX(e.clientX - startXRef.current)
    },
    [dragging],
  )

  const onPointerUp = useCallback(
    (e) => {
      if (!dragging) return
      const dx = e.clientX - (startXRef.current ?? e.clientX)
      startXRef.current = null
      setDragging(false)
      if (dx >= SWIPE_THRESHOLD) triggerFly('right')
      else if (dx <= -SWIPE_THRESHOLD) triggerFly('left')
      else setDragX(0)
    },
    [dragging, triggerFly],
  )

  let transform, transition
  if (flyDir === 'right') {
    transform = 'translateX(150vw) rotate(25deg)'
    transition = 'transform 0.42s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
  } else if (flyDir === 'left') {
    transform = 'translateX(-150vw) rotate(-25deg)'
    transition = 'transform 0.42s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
  } else if (dragging) {
    transform = `translateX(${dragX}px) rotate(${dragX * 0.06}deg)`
    transition = 'none'
  } else {
    transform = 'translateX(0) rotate(0deg)'
    transition = 'transform 0.3s ease'
  }

  const borderColor =
    vibeRatio > 0
      ? `rgba(30,215,96,${vibeRatio})`
      : skipRatio > 0
        ? `rgba(255,68,88,${skipRatio})`
        : 'transparent'
  const boxShadow =
    vibeRatio > 0
      ? `0 0 ${40 * vibeRatio}px rgba(30,215,96,${0.45 * vibeRatio}), 0 20px 40px rgba(0,0,0,0.45)`
      : skipRatio > 0
        ? `0 0 ${40 * skipRatio}px rgba(255,68,88,${0.45 * skipRatio}), 0 20px 40px rgba(0,0,0,0.45)`
        : '0 20px 40px rgba(0,0,0,0.45)'

  const up = song.upvotes ?? 0
  const down = song.downvotes ?? 0
  const total = up + down
  const downPct = total > 0 ? (down / total) * 100 : 50
  const upPct = total > 0 ? (up / total) * 100 : 50

  if (!hasVideoId) return null

  return (
    <div
      style={{ transform, transition, willChange: 'transform' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={`absolute inset-0 select-none touch-none ${isTop && !flyDir ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      <div
        style={{
          borderColor,
          boxShadow,
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
        }}
        className="relative h-full min-h-[65vh] w-full overflow-hidden rounded-[20px] border-2 bg-[#0a0a0c]"
      >
        <img
          src={song.thumbnail || ''}
          alt=""
          draggable={false}
          className="absolute inset-0 z-0 h-full w-full object-cover"
        />

        {/* Bottom fade: transparent → dark — sits behind text only (no box) */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[21] h-[45%] bg-gradient-to-t from-[rgba(0,0,0,0.85)] to-transparent"
          aria-hidden
        />

        {/* Title / artist / added by — anchored bottom (bottom ~25% zone), 16px inset; extra pb clears vibe bar */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-[22] box-border p-4 pb-28 text-left">
          <div className="flex min-h-0 flex-col justify-end">
            {showTextSkeleton ? (
              <div className="space-y-2" role="status" aria-label="Loading song details">
                <div className="h-8 w-[90%] max-w-md animate-pulse bg-white/25" />
                <div className="h-4 w-[55%] max-w-sm animate-pulse bg-white/20" />
              </div>
            ) : (
              <>
                <p className="line-clamp-3 break-words text-2xl font-bold leading-tight text-white sm:text-3xl">
                  {song.title ?? ''}
                </p>
                {(song.artist ?? '') !== '' ? (
                  <p className="mt-1 line-clamp-2 break-words text-sm text-white/75 sm:text-base">
                    {song.artist ?? ''}
                  </p>
                ) : null}
                {addedByLine ? (
                  <p
                    className="mt-1.5 text-[12px] leading-snug"
                    style={{ color: 'rgba(255,255,255,0.5)' }}
                  >
                    added by {addedByLine}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-4 left-4 right-4 z-30">
          <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-black/40">
            <div
              className="h-full bg-aux-coral"
              style={{
                width: `${downPct}%`,
                transition: BAR_TRANSITION,
              }}
            />
            <div
              className="h-full bg-aux-mint"
              style={{
                width: `${upPct}%`,
                transition: BAR_TRANSITION,
              }}
            />
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-14 left-4 z-30 rounded-full bg-black/55 px-2.5 py-1 text-sm font-bold tabular-nums text-aux-coral backdrop-blur-sm">
          👎 {down}
        </div>
        <div className="pointer-events-none absolute bottom-14 right-4 z-30 rounded-full bg-black/55 px-2.5 py-1 text-sm font-bold tabular-nums text-aux-mint backdrop-blur-sm">
          👍 {up}
        </div>
      </div>
    </div>
  )
}

export default function SwipeStack({ items = [], onVote, onAddSong }) {
  const [dismissed, setDismissed] = useState(new Set())

  const eligibleItems = useMemo(() => {
    return (items || []).filter((s) => Boolean(s?.videoId))
  }, [items])

  useEffect(() => {
    if (!eligibleItems.length) return
    const currentIds = new Set(eligibleItems.map((i) => i.id))
    queueMicrotask(() => {
      setDismissed((prev) => {
        const cleaned = new Set()
        for (const id of prev) {
          if (currentIds.has(id)) cleaned.add(id)
        }
        return cleaned.size === prev.size ? prev : cleaned
      })
    })
  }, [eligibleItems])

  const visible = eligibleItems.filter((s) => !dismissed.has(s.id)).slice(0, 3)

  const handleVibe = useCallback(
    (songId) => {
      setDismissed((prev) => new Set([...prev, songId]))
      onVote(songId, 'up')
    },
    [onVote],
  )

  const handleSkip = useCallback(
    (songId) => {
      setDismissed((prev) => new Set([...prev, songId]))
      onVote(songId, 'down')
    },
    [onVote],
  )

  if (!visible.length) {
    const emptyMsg =
      eligibleItems.length === 0 && items.length > 0
        ? 'No valid songs in queue'
        : items.length === 0
          ? 'Tap to add the first song'
          : "You've voted on everything!"
    const isAddable = items.length === 0 && Boolean(onAddSong)

    return (
      <div
        className={`flex min-h-[30vh] flex-col items-center justify-center gap-3 rounded-[20px] border border-aux-border bg-aux-surface/80 transition-colors ${
          isAddable ? 'cursor-pointer hover:bg-aux-surface active:bg-aux-surface/60' : ''
        }`}
        onClick={isAddable ? onAddSong : undefined}
        role={isAddable ? 'button' : undefined}
        tabIndex={isAddable ? 0 : undefined}
        onKeyDown={isAddable ? (e) => (e.key === 'Enter' || e.key === ' ') && onAddSong() : undefined}
      >
        {isAddable && (
          <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-white/20 bg-white/5">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-white/40" aria-hidden>
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
        )}
        <p className="text-sm text-white/40">{emptyMsg}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-left text-sm font-semibold uppercase tracking-wider text-white/45">
          Vote on every track
        </h3>
        <span className="text-[10px] font-medium uppercase tracking-wider text-white/35">
          Swipe to vote
        </span>
      </div>

      <div
        className="relative mx-auto w-full max-w-md"
        style={{ minHeight: '65vh', height: '65vh' }}
      >
        {[...visible].reverse().map((song, revIdx) => {
          const stackIdx = visible.length - 1 - revIdx
          const isTop = stackIdx === 0
          const scale = 1 - stackIdx * 0.04
          const translateY = stackIdx * 10

          return (
            <div
              key={song.id}
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 10 - stackIdx,
                transform: isTop
                  ? undefined
                  : `scale(${scale}) translateY(${translateY}px)`,
                transition: 'transform 0.3s ease',
                transformOrigin: 'bottom center',
                pointerEvents: isTop ? undefined : 'none',
              }}
            >
              <SingleSwipeCard
                song={song}
                isTop={isTop}
                onVibe={handleVibe}
                onSkip={handleSkip}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
