export default function UserList({ users }) {
  const list = Object.entries(users || {})
  const count = list.length

  return (
    <div className="rounded-lg border border-aux-border bg-aux-surface px-3 py-3">
      <p className="text-xs text-aux-fg-subtle">Here now</p>
      <p className="mt-0.5 font-display text-2xl font-semibold text-aux-ink">{count}</p>
      {count > 0 && (
        <ul className="mt-2 max-h-24 space-y-0.5 overflow-y-auto text-left text-sm text-aux-fg-muted">
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
