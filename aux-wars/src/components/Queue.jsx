import ArtworkImage from './ArtworkImage'

export default function Queue({ items, emptyHint = 'Add songs to start the battle' }) {
  if (!items?.length) {
    return (
      <p className="app-glass-inset px-4 py-8 text-center text-sm text-white/50">
        {emptyHint}
      </p>
    )
  }

  return (
    <ul className="max-h-[min(420px,50vh)] min-w-0 space-y-2 overflow-y-auto pr-1">
      {items.map((song, i) => (
        <li
          key={song.id}
          className="app-glass-inset flex min-w-0 items-center gap-3 overflow-hidden px-3 py-2.5 text-left shadow-lg shadow-black/20"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white/80">
            {i + 1}
          </span>
          <ArtworkImage
            videoId={song.videoId}
            thumbnail={song.thumbnail}
            className="h-12 w-12 shrink-0 rounded-lg object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-white">{song.title}</p>
            <p className="truncate text-xs text-white/55">{song.artist}</p>
            <p className="mt-0.5 text-[11px] text-white/40">
              by {song.addedBy || 'anon'}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p
              className={`text-lg font-bold ${
                (song.netScore ?? 0) >= 0 ? 'text-cyan-300' : 'text-rose-400'
              }`}
            >
              {song.netScore ?? 0}
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}
