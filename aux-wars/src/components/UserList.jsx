export default function UserList({ users, isHost = false, currentUserId = '', onKick }) {
  const list = Object.entries(users || {})
  const count = list.length

  return (
    <div className="app-glass-inset w-full min-w-0 max-w-full overflow-hidden px-3 py-2">
      <p className="app-label !tracking-[0.15em] text-white/45">
        In the room
      </p>
      <p className="mt-0.5 text-lg font-bold text-white">{count}</p>
      {count > 0 && (
        <ul className="mt-2 max-h-24 space-y-1 overflow-y-auto text-left text-sm text-white/70">
          {list.map(([id, u]) => (
            <li key={id} className="flex min-w-0 items-center justify-between gap-2">
              <span className="min-w-0 truncate">{u.displayName || 'Guest'}</span>
              {isHost && id !== currentUserId && (
                <button
                  type="button"
                  onClick={() => onKick?.(id)}
                  className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded px-2 text-[11px] font-semibold text-aux-coral/60 transition-colors hover:bg-aux-coral/10 hover:text-aux-coral"
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
