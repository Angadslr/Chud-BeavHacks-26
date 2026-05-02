export default function UserList({ users }) {
  const list = Object.entries(users || {})
  const count = list.length

  return (
    <div className="rounded-xl border border-aux-border bg-aux-surface/80 px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-white/45">
        In the room
      </p>
      <p className="mt-0.5 text-lg font-bold text-white">{count}</p>
      {count > 0 && (
        <ul className="mt-2 max-h-24 space-y-1 overflow-y-auto text-left text-sm text-white/70">
          {list.map(([id, u]) => (
            <li key={id} className="truncate">
              {u.displayName || 'Guest'}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
