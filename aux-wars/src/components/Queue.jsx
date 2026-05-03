export default function Queue({ items, emptyHint = 'Add songs to start the battle' }) {
  if (!items?.length) {
    return (
      <p className="rounded-lg border border-aux-border border-dashed bg-aux-surface/80 px-4 py-8 text-center text-sm text-aux-fg-muted">
        {emptyHint}
      </p>
    )
  }

  return (
    <ul className="max-h-[min(420px,50vh)] space-y-2 overflow-y-auto pr-1">
      {items.map((song, i) => (
        <li
          key={song.id}
          className="flex items-center gap-3 rounded-lg border border-aux-border bg-aux-surface px-3 py-2.5 text-left shadow-[0_1px_2px_rgba(28,25,23,0.04)]"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-stone-200/80 text-sm font-medium text-aux-fg-muted">
            {i + 1}
          </span>
          <img
            src={song.thumbnail}
            alt=""
            className="h-12 w-12 shrink-0 rounded object-cover ring-1 ring-black/5"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-aux-fg">{song.title}</p>
            <p className="truncate text-xs text-aux-fg-muted">{song.artist}</p>
            <p className="mt-0.5 text-[11px] text-aux-fg-subtle">
              by {song.addedBy || 'anon'}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-lg font-semibold text-aux-mint">{song.netScore ?? 0}</p>
            <p className="text-[10px] uppercase tracking-wide text-aux-fg-subtle">
              net
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}
