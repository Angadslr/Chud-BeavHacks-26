import { useLayoutEffect, useRef, useState } from 'react'

function escapeSelectorId(id) {
  if (typeof id !== 'string') return ''
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(id)
  }
  return id.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1')
}

function formatVibe(n) {
  if (n > 0) return `+${n}`
  return String(n)
}

/** Left segment = downvotes share, right = upvotes; meet at center when 50/50. */
function splitBarPercents(upvotes, downvotes) {
  const up = upvotes || 0
  const down = downvotes || 0
  const total = up + down
  if (total <= 0) return { downPct: 50, upPct: 50 }
  return {
    downPct: (down / total) * 100,
    upPct: (up / total) * 100,
  }
}

const VIBE_BAR_TRANSITION = 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)'

export default function VibeLeaderboard({
  items,
  emptyHint,
  onVote,
  getMyVote,
}) {
  const listRef = useRef(null)
  const prevTopsRef = useRef(new Map())

  useLayoutEffect(() => {
    const container = listRef.current
    if (!container || !items?.length) {
      prevTopsRef.current = new Map()
      return
    }

    const after = new Map()
    for (const song of items) {
      const el = container.querySelector(
        `[data-song-id="${escapeSelectorId(song.id)}"]`,
      )
      if (!el) continue
      after.set(song.id, el.getBoundingClientRect().top)
    }

    for (const song of items) {
      const el = container.querySelector(
        `[data-song-id="${escapeSelectorId(song.id)}"]`,
      )
      if (!el) continue
      const prevTop = prevTopsRef.current.get(song.id)
      const newTop = after.get(song.id)
      if (prevTop !== undefined && newTop !== undefined) {
        const dy = prevTop - newTop
        if (Math.abs(dy) > 0.5) {
          el.style.transform = `translateY(${dy}px)`
          el.style.transition = 'none'
        }
      }
    }

    requestAnimationFrame(() => {
      for (const song of items) {
        const el = container.querySelector(
        `[data-song-id="${escapeSelectorId(song.id)}"]`,
      )
        if (!el) continue
        el.style.transition =
          'transform 0.38s cubic-bezier(0.22, 1, 0.36, 1)'
        el.style.transform = ''
      }
    })

    prevTopsRef.current = after
  }, [items])

  if (!items?.length) {
    return (
      <p className="rounded-xl border border-aux-border bg-aux-surface/80 px-4 py-8 text-center text-sm text-white/50">
        {emptyHint}
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-left text-sm font-semibold uppercase tracking-wider text-white/45">
          Vibe leaderboard
        </h3>
        <span className="text-[10px] font-medium uppercase tracking-wider text-white/35">
          Live rank · net score
        </span>
      </div>

      <ul
        ref={listRef}
        className="max-h-[min(520px,55vh)] space-y-3 overflow-y-auto pr-1"
      >
        {items.map((song, index) => {
          const rank = index + 1
          const isUpNext = rank === 1
          const up = song.upvotes || 0
          const down = song.downvotes || 0
          const { downPct, upPct } = splitBarPercents(up, down)
          const net = song.netScore ?? 0

          return (
            <li
              key={song.id}
              data-song-id={song.id}
              className={`rounded-2xl border px-3 py-3 text-left shadow-lg transition-shadow duration-300 ${
                isUpNext
                  ? 'border-aux-mint/70 bg-aux-mint/10 shadow-[0_0_24px_rgba(30,215,96,0.2)] ring-1 ring-aux-mint/30'
                  : 'border-aux-border bg-aux-surface/90 shadow-black/20'
              }`}
            >
              <div className="flex gap-3">
                <div className="flex w-9 shrink-0 flex-col items-center pt-0.5">
                  <span
                    className={`text-lg font-black tabular-nums ${
                      isUpNext ? 'text-aux-mint' : 'text-white/50'
                    }`}
                  >
                    #{rank}
                  </span>
                </div>
                <img
                  src={song.thumbnail}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-xl object-cover ring-1 ring-white/10"
                />
                <div className="min-w-0 flex-1">
                  {isUpNext && (
                    <p className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-aux-mint">
                      🔥 Up next
                    </p>
                  )}
                  <p className="line-clamp-2 font-semibold leading-tight text-white">
                    {song.title}
                  </p>
                  <p className="mt-0.5 line-clamp-1 text-xs text-white/50">
                    {song.artist}
                  </p>
                  <p className="mt-1 text-[11px] text-white/35">
                    by {song.addedBy || 'anon'}
                  </p>
                </div>
              </div>

              <div className="mt-3 pl-[calc(2.25rem+0.75rem)] pr-1 sm:pl-[calc(2.25rem+4rem+0.75rem)]">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-white/55">
                    Vibe score:{' '}
                    <span
                      className={
                        net > 0
                          ? 'text-aux-mint'
                          : net < 0
                            ? 'text-aux-coral'
                            : 'text-white/70'
                      }
                    >
                      {formatVibe(net)}
                    </span>
                  </span>
                  <span className="tabular-nums text-[11px] text-white/40">
                    👍 {up} · 👎 {down}
                  </span>
                </div>
                <div className="flex h-2.5 w-full flex-row overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full shrink-0 bg-aux-coral"
                    style={{
                      width: `${downPct}%`,
                      transition: VIBE_BAR_TRANSITION,
                    }}
                  />
                  <div
                    className="h-full shrink-0 bg-aux-mint"
                    style={{
                      width: `${upPct}%`,
                      transition: VIBE_BAR_TRANSITION,
                    }}
                  />
                </div>

                {onVote && getMyVote && (
                  <div className="mt-3 flex w-full items-center justify-between gap-3">
                    <button
                      type="button"
                      aria-label="Thumbs down"
                      aria-pressed={getMyVote(song.id) === 'down'}
                      onClick={() => onVote(song.id, 'down')}
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-lg transition-colors ${
                        getMyVote(song.id) === 'down'
                          ? 'border-aux-coral bg-aux-coral/25 text-aux-coral shadow-[0_0_16px_rgba(255,68,88,0.2)]'
                          : 'border-white/15 bg-white/5 text-white/70 hover:border-aux-coral/40 hover:bg-aux-coral/10'
                      }`}
                    >
                      👎
                    </button>
                    <button
                      type="button"
                      aria-label="Thumbs up"
                      aria-pressed={getMyVote(song.id) === 'up'}
                      onClick={() => onVote(song.id, 'up')}
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-lg transition-colors ${
                        getMyVote(song.id) === 'up'
                          ? 'border-aux-mint bg-aux-mint/25 text-aux-mint shadow-[0_0_16px_rgba(30,215,96,0.25)]'
                          : 'border-white/15 bg-white/5 text-white/70 hover:border-aux-mint/40 hover:bg-aux-mint/10'
                      }`}
                    >
                      👍
                    </button>
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function PlayHistorySection({ playHistory }) {
  const [open, setOpen] = useState(false)
  const entries = Object.entries(playHistory || {})
    .map(([id, e]) => ({ id, ...e }))
    .filter((e) => e.videoId)
    .sort((a, b) => (b.playedAt || 0) - (a.playedAt || 0))
    .slice(0, 25)

  if (!entries.length) return null

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-black/20">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-white/70 hover:bg-white/5"
      >
        Previously played
        <span className="text-white/40">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <ul className="max-h-48 space-y-2 overflow-y-auto border-t border-white/5 px-3 py-2">
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1.5 text-xs"
            >
              <span className="shrink-0 font-mono text-aux-mint">
                {e.finalNetScore != null ? formatVibe(e.finalNetScore) : '—'}
              </span>
              <span className="min-w-0 truncate text-white/80">{e.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
