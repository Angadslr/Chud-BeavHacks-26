import { useRef, useState, useCallback, useEffect } from 'react'

const SWIPE_THRESHOLD = 80

function SingleSwipeCard({ song, isTop, onVibe, onSkip }) {
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [flyDir, setFlyDir] = useState(null)
  const startXRef = useRef(null)

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

  // Build transform and transition
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

  const net = song.netScore ?? 0

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
        className="relative flex h-full flex-col overflow-hidden rounded-2xl border-2 bg-[#1a1a1d]"
      >
        {/* VIBE stamp */}
        <div
          style={{ opacity: vibeRatio, transition: 'opacity 0.15s ease' }}
          className="pointer-events-none absolute left-4 top-5 z-10 -rotate-12 rounded-lg border-4 border-aux-mint px-3 py-1 font-black text-2xl uppercase text-aux-mint"
          aria-hidden
        >
          VIBE
        </div>

        {/* SKIP stamp */}
        <div
          style={{ opacity: skipRatio, transition: 'opacity 0.15s ease' }}
          className="pointer-events-none absolute right-4 top-5 z-10 rotate-12 rounded-lg border-4 border-aux-coral px-3 py-1 font-black text-2xl uppercase text-aux-coral"
          aria-hidden
        >
          SKIP
        </div>

        <div className="flex flex-1 flex-col p-4 pb-24">
          <img
            src={song.thumbnail}
            alt=""
            draggable={false}
            className="aspect-video w-full rounded-xl object-cover"
          />
          <div className="mt-4 min-w-0 flex-1">
            <p className="line-clamp-2 text-lg font-bold leading-tight text-white">
              {song.title}
            </p>
            <p className="mt-1 truncate text-sm text-white/50">{song.artist}</p>
            <p className="mt-1 text-xs text-white/30">
              by {song.addedBy || 'anon'}
            </p>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`text-sm font-semibold ${net > 0 ? 'text-aux-mint' : net < 0 ? 'text-aux-coral' : 'text-white/50'}`}
            >
              {net > 0 ? '+' : ''}
              {net}
            </span>
            <span className="text-[11px] text-white/30">
              👍 {song.upvotes ?? 0} · 👎 {song.downvotes ?? 0}
            </span>
          </div>
        </div>

        {isTop && (
          <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-10 bg-gradient-to-t from-[#1a1a1d] to-transparent pb-5 pt-4">
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                triggerFly('left')
              }}
              className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-aux-coral bg-aux-coral/15 text-2xl transition-colors hover:bg-aux-coral/30 active:scale-95"
              aria-label="Skip this song"
            >
              👎
            </button>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                triggerFly('right')
              }}
              className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-aux-mint bg-aux-mint/15 text-2xl transition-colors hover:bg-aux-mint/30 active:scale-95"
              aria-label="Vibe this song"
            >
              👍
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function SwipeStack({ items = [], onVote }) {
  const [dismissed, setDismissed] = useState(new Set())

  // Clean up dismissed ids when queue changes from Firebase
  useEffect(() => {
    if (!items.length) return
    const currentIds = new Set(items.map((i) => i.id))
    setDismissed((prev) => {
      const cleaned = new Set()
      for (const id of prev) {
        if (currentIds.has(id)) cleaned.add(id)
      }
      return cleaned.size === prev.size ? prev : cleaned
    })
  }, [items])

  const visible = items.filter((s) => !dismissed.has(s.id)).slice(0, 3)

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
    return (
      <div className="flex h-32 items-center justify-center rounded-2xl border border-aux-border bg-aux-surface/80">
        <p className="text-sm text-white/40">
          {items.length === 0
            ? 'No songs in queue'
            : "You've voted on everything!"}
        </p>
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

      <div className="relative" style={{ height: 400 }}>
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

      <p className="text-center text-xs text-white/25">
        Swipe right to vibe · swipe left to skip
      </p>
    </div>
  )
}
