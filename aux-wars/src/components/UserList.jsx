export default function UserList({ users, isHost = false, currentUserId = '', onKick }) {
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
            <li key={id} className="flex items-center justify-between gap-2">
              <span className="truncate">{u.displayName || 'Guest'}</span>
              {isHost && id !== currentUserId && (
                <button
                  type="button"
                  onClick={() => onKick?.(id)}
                  className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold text-aux-coral/60 transition-colors hover:bg-aux-coral/10 hover:text-aux-coral"
                  title={`Kick ${u.displayName || 'Guest'}`}
                >
                  kick
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
