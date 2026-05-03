export default function HallOfShame({ users }) {
  const ranked = Object.entries(users || {})
    .map(([id, u]) => ({
      id,
      name: u.displayName || 'Guest',
      down: u.downvotesReceived || 0,
    }))
    .filter((r) => r.down > 0)
    .sort((a, b) => b.down - a.down)
    .slice(0, 8)

  if (!ranked.length) {
    return (
      <div className="rounded-lg border border-aux-border border-dashed bg-transparent px-3 py-3 text-left text-xs leading-relaxed text-aux-fg-subtle">
        No heated downvote streaks yet.
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-aux-border bg-aux-surface px-3 py-3 text-left">
      <p className="font-display text-sm font-semibold text-aux-ink">Hall of shame</p>
      <p className="mt-0.5 text-[11px] text-aux-fg-subtle">
        Who took the most flak for their picks
      </p>
      <ol className="mt-2 space-y-1 text-sm text-aux-fg">
        {ranked.map((r, i) => (
          <li key={r.id} className="flex justify-between gap-2">
            <span className="truncate">
              {i + 1}. {r.name}
            </span>
            <span className="shrink-0 font-mono tabular-nums text-aux-coral">{r.down}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
