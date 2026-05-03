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
            <span className="shrink-0 font-mono text-aux-coral">
              {r.net} net
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
