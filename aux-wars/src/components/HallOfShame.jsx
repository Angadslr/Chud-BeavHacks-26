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
      <div className="rounded-xl border border-dashed border-white/15 bg-black/20 px-3 py-3 text-left text-xs text-white/45">
        Hall of Shame: no downvote drama yet.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-aux-coral/30 bg-aux-coral/5 px-3 py-3 text-left">
      <p className="text-xs font-semibold uppercase tracking-wider text-aux-coral">
        Hall of Shame
      </p>
      <ol className="mt-2 space-y-1.5 text-sm">
        {ranked.map((r, i) => (
          <li key={r.id} className="flex justify-between gap-2 text-white/85">
            <span className="truncate">
              {i + 1}. {r.name}
            </span>
            <span className="shrink-0 font-mono text-aux-coral">{r.down} ↓</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
