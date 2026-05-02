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
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
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
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-aux-border bg-aux-surface shadow-2xl shadow-black/50">
        <div className="flex items-center justify-between border-b border-aux-border px-4 py-3">
          <h2 className="text-lg font-bold text-white">Add a song</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-white/60 hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>
        <div className="flex gap-2 border-b border-aux-border p-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder="Search YouTube…"
            className="min-w-0 flex-1 rounded-xl border border-aux-border bg-black/30 px-3 py-2.5 text-white placeholder:text-white/35 focus:border-aux-mint/50 focus:outline-none focus:ring-1 focus:ring-aux-mint/40"
          />
          <button
            type="button"
            onClick={search}
            disabled={loading}
            className="shrink-0 rounded-xl bg-aux-mint px-4 py-2.5 font-semibold text-black hover:brightness-110 disabled:opacity-50"
          >
            {loading ? '…' : 'Search'}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {error && (
            <p className="mb-2 rounded-lg bg-aux-coral/15 px-3 py-2 text-sm text-aux-coral">
              {error}
            </p>
          )}
          <ul className="space-y-2">
            {results.map((item) => (
              <li key={item.id.videoId}>
                <button
                  type="button"
                  onClick={() => pick(item)}
                  className="flex w-full items-center gap-3 rounded-xl border border-transparent bg-black/25 p-2 text-left hover:border-aux-mint/40 hover:bg-black/40"
                >
                  <img
                    src={
                      item.snippet.thumbnails?.medium?.url ||
                      item.snippet.thumbnails?.default?.url
                    }
                    alt=""
                    className="h-14 w-[4.5rem] shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0">
                    <p className="line-clamp-2 font-medium text-white">
                      {item.snippet.title}
                    </p>
                    <p className="truncate text-xs text-white/50">
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
