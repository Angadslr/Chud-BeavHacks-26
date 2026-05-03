export default function HallOfShame({ users, queue = [] }) {
  // Sum up/down votes across each user's songs currently in the queue
  const scoreMap = {}
  for (const song of queue) {
    const uid = song.addedByUserId
    if (!uid) continue
    if (!scoreMap[uid]) scoreMap[uid] = { up: 0, down: 0 }
    scoreMap[uid].up += song.upvotes || 0
    scoreMap[uid].down += song.downvotes || 0
  }

  // net = upvotes - downvotes; only include participants with a net negative score
  const ranked = Object.entries(users || {})
    .map(([id, u]) => {
      const s = scoreMap[id] || { up: 0, down: 0 }
      const net = s.up - s.down
      return { id, name: u.displayName || 'Guest', net, up: s.up, down: s.down }
    })
    .filter((r) => r.net < 0)
    .sort((a, b) => a.net - b.net) // most negative first
    .slice(0, 5)

  if (!ranked.length) {
    return (
      <div className="app-glass-inset w-full overflow-hidden border-dashed px-3 py-3 text-left text-xs text-white/45">
        Hall of Shame: no downvote drama yet.
      </div>
    )
  }

  return (
    <div className="app-glass-inset w-full overflow-hidden border-rose-400/30 bg-rose-500/5 px-3 py-3 text-left">
      <p className="app-label !tracking-[0.15em] text-rose-300/90">
        Hall of Shame
      </p>
      <ol className="mt-2 space-y-1.5 text-sm">
        {ranked.map((r, i) => (
          <li key={r.id} className="flex min-w-0 justify-between gap-2 text-white/85">
            <span className="min-w-0 truncate">
              {i + 1}. {r.name}
            </span>
            <span className="shrink-0 font-mono text-aux-coral">
              {r.net} net
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
