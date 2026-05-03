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

function likeRatioPercent(upvotes, downvotes) {
  const total = (upvotes || 0) + (downvotes || 0)
  if (total <= 0) return 50
  return (upvotes / total) * 100
}

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
      <p className="rounded-lg border border-aux-border border-dashed bg-aux-surface/80 px-4 py-10 text-center text-sm leading-relaxed text-aux-fg-muted">
        {emptyHint}
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-aux-border pb-3">
        <span className="text-xs text-aux-fg-subtle">Order updates live</span>
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
          const ratio = likeRatioPercent(up, down)
          const net = song.netScore ?? 0

          return (
            <li
              key={song.id}
              data-song-id={song.id}
              className={`rounded-lg border px-3 py-3 text-left shadow-[0_1px_2px_rgba(28,25,23,0.04)] transition-shadow duration-300 ${
                isUpNext
                  ? 'border-aux-mint/35 bg-teal-50/40 ring-1 ring-teal-800/10'
                  : 'border-aux-border bg-aux-surface'
              }`}
            >
              <div className="flex gap-3">
                <div className="flex w-8 shrink-0 flex-col items-center pt-0.5">
                  <span
                    className={`font-display text-lg font-semibold tabular-nums ${
                      isUpNext ? 'text-aux-mint' : 'text-aux-fg-subtle'
                    }`}
                  >
                    {rank}
                  </span>
                </div>
                <img
                  src={song.thumbnail}
                  alt=""
                  className="h-[4.5rem] w-[4.5rem] shrink-0 rounded-md object-cover ring-1 ring-black/5"
                />
                <div className="min-w-0 flex-1">
                  {isUpNext && (
                    <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-aux-mint">
                      Next up
                    </p>
                  )}
                  <p className="line-clamp-2 font-medium leading-snug text-aux-fg">
                    {song.title}
                  </p>
                  <p className="mt-0.5 line-clamp-1 text-sm text-aux-fg-muted">
                    {song.artist}
                  </p>
                  <p className="mt-1 text-xs text-aux-fg-subtle">
                    Added by {song.addedBy || 'someone'}
                  </p>
                </div>
              </div>

              <div className="mt-3 pl-[calc(2rem+0.75rem)] pr-1 sm:pl-[calc(2rem+4.5rem+0.75rem)]">
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-aux-fg-muted">
                    Score{' '}
                    <span
                      className={`font-medium ${
                        net > 0
                          ? 'text-aux-mint'
                          : net < 0
                            ? 'text-aux-coral'
                            : 'text-aux-fg-muted'
                      }`}
                    >
                      {formatVibe(net)}
                    </span>
                  </span>
                  <span className="tabular-nums text-xs text-aux-fg-subtle">
                    {up} up · {down} down
                  </span>
                </div>
                <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-stone-200/90">
                  <div
                    className="h-full bg-aux-mint transition-[width] duration-300 ease-out"
                    style={{ width: `${ratio}%` }}
                  />
                  <div
                    className="h-full bg-aux-coral/85 transition-[width] duration-300 ease-out"
                    style={{ width: `${100 - ratio}%` }}
                  />
                </div>

                {onVote && getMyVote && (
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      aria-label="Vote up"
                      aria-pressed={getMyVote(song.id) === 'up'}
                      onClick={() => onVote(song.id, 'up')}
                      className={`min-w-[4.5rem] rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                        getMyVote(song.id) === 'up'
                          ? 'border-aux-mint bg-teal-50 text-aux-mint'
                          : 'border-aux-border bg-aux-elevated text-aux-fg-muted hover:border-aux-mint/40 hover:text-aux-mint'
                      }`}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      aria-label="Vote down"
                      aria-pressed={getMyVote(song.id) === 'down'}
                      onClick={() => onVote(song.id, 'down')}
                      className={`min-w-[4.5rem] rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                        getMyVote(song.id) === 'down'
                          ? 'border-aux-coral bg-red-50/80 text-aux-coral'
                          : 'border-aux-border bg-aux-elevated text-aux-fg-muted hover:border-aux-coral/45 hover:text-aux-coral'
                      }`}
                    >
                      Down
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
    <div className="mt-6 rounded-lg border border-aux-border bg-aux-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-aux-fg hover:bg-stone-900/[0.03]"
      >
        Played earlier
        <span className="text-aux-fg-subtle">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <ul className="max-h-48 space-y-1 overflow-y-auto border-t border-aux-border px-3 py-2">
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex items-center gap-2 rounded px-2 py-1.5 text-xs text-aux-fg-muted"
            >
              <span className="shrink-0 font-mono tabular-nums text-aux-mint">
                {e.finalNetScore != null ? formatVibe(e.finalNetScore) : '—'}
              </span>
              <span className="min-w-0 truncate">{e.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
