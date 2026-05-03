import { useCallback, useState } from 'react'
import { addSong } from '../firebase/roomService'
import { getDisplayName, getUserId } from '../lib/session'

const API = 'https://www.googleapis.com/youtube/v3/search'

export default function SearchModal({ roomId, open, onClose }) {
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState([])
  const [error, setError] = useState(null)

  const search = useCallback(async () => {
    const key = import.meta.env.VITE_YOUTUBE_API_KEY
    if (!key) {
      setError('Missing VITE_YOUTUBE_API_KEY in .env')
      return
    }
    if (!q.trim()) return
    setLoading(true)
    setError(null)
    try {
      const url = new URL(API)
      url.searchParams.set('part', 'snippet')
      url.searchParams.set('type', 'video')
      url.searchParams.set('maxResults', '12')
      url.searchParams.set('q', q.trim())
      url.searchParams.set('key', key)
      const res = await fetch(url.toString())
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error?.message || 'Search failed')
      }
      setResults(data.items || [])
    } catch (e) {
      setError(e.message || 'Search failed')
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [q])

  const pick = async (item) => {
    if (!roomId) return
    const sn = item.snippet
    const thumbs = sn.thumbnails || {}
    const thumb =
      thumbs.medium?.url || thumbs.default?.url || thumbs.high?.url || ''
    await addSong(roomId, {
      videoId: item.id.videoId,
      title: sn.title,
      thumbnail: thumb,
      artist: sn.channelTitle || 'Unknown',
      addedBy: getDisplayName() || 'Guest',
      addedByUserId: getUserId(),
    })
    onClose()
    setQ('')
    setResults([])
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/25 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Add song"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col rounded-lg border border-aux-border bg-aux-elevated shadow-[0_8px_40px_rgba(28,25,23,0.12)]">
        <div className="flex items-center justify-between border-b border-aux-border px-4 py-3">
          <h2 className="font-display text-lg font-semibold text-aux-ink">Add a track</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-aux-fg-muted hover:bg-stone-900/[0.04] hover:text-aux-fg"
          >
            Close
          </button>
        </div>
        <div className="flex gap-2 border-b border-aux-border p-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder="Search YouTube"
            className="min-w-0 flex-1 rounded-md border border-aux-border bg-aux-surface px-3 py-2.5 text-[15px] text-aux-fg placeholder:text-aux-fg-subtle focus:border-aux-fg-muted focus:outline-none focus:ring-1 focus:ring-aux-fg-muted/25"
          />
          <button
            type="button"
            onClick={search}
            disabled={loading}
            className="shrink-0 rounded-md bg-aux-ink px-4 py-2.5 text-sm font-semibold text-stone-50 hover:bg-stone-800 disabled:opacity-50"
          >
            {loading ? '…' : 'Search'}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {error && (
            <p className="mb-2 rounded-md border border-red-200/80 bg-red-50/80 px-3 py-2 text-sm text-red-900">
              {error}
            </p>
          )}
          <ul className="space-y-1.5">
            {results.map((item) => (
              <li key={item.id.videoId}>
                <button
                  type="button"
                  onClick={() => pick(item)}
                  className="flex w-full items-center gap-3 rounded-md border border-transparent p-2 text-left hover:border-aux-border hover:bg-stone-900/[0.03]"
                >
                  <img
                    src={
                      item.snippet.thumbnails?.medium?.url ||
                      item.snippet.thumbnails?.default?.url
                    }
                    alt=""
                    className="h-14 w-[4.5rem] shrink-0 rounded object-cover"
                  />
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-medium text-aux-fg">
                      {item.snippet.title}
                    </p>
                    <p className="truncate text-xs text-aux-fg-muted">
                      {item.snippet.channelTitle}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
