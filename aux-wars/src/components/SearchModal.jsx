import { useCallback, useState } from 'react'
import { addSong } from '../firebase/roomService'
import { getDisplayName, getUserId } from '../lib/session'

const YT_API = 'https://www.googleapis.com/youtube/v3/search'
const MB_API = 'https://musicbrainz.org/ws/2/recording/'
const CAA_BASE = 'https://coverartarchive.org/release'

async function searchYouTube(query, key, maxResults = 8) {
  const url = new URL(YT_API)
  url.searchParams.set('part', 'snippet')
  url.searchParams.set('type', 'video')
  url.searchParams.set('maxResults', String(maxResults))
  url.searchParams.set('q', query)
  url.searchParams.set('key', key)
  const res = await fetch(url.toString())
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || 'YouTube search failed')
  return data.items || []
}

async function searchMusicBrainz(query) {
  const url = new URL(MB_API)
  url.searchParams.set('query', query)
  url.searchParams.set('fmt', 'json')
  url.searchParams.set('limit', '10')
  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } })
  if (!res.ok) return []
  const data = await res.json()
  return (data.recordings || []).filter((r) => (r.score || 0) >= 85).slice(0, 5)
}

function coverArtUrl(releaseId) {
  return releaseId ? `${CAA_BASE}/${releaseId}/front-500` : null
}

function normaliseTitle(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()
}

function ytMatchScore(ytTitle, songTitle, artistName) {
  const t = normaliseTitle(ytTitle)
  const s = normaliseTitle(songTitle)
  const a = normaliseTitle(artistName)
  let score = 0
  if (t.includes(s)) score += 2
  if (t.includes(a)) score += 1
  return score
}

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
      const [mbRecs, ytItems] = await Promise.all([
        searchMusicBrainz(q.trim()).catch(() => []),
        searchYouTube(q.trim(), key, 10),
      ])

      const verifiedResults = []
      const usedYtIds = new Set()

      if (mbRecs.length >= 3) {
        for (const rec of mbRecs) {
          const artist = rec['artist-credit']?.[0]?.name || ''
          const title = rec.title || ''
          const releaseId = rec.releases?.[0]?.id || null

          // Try to match a YouTube result from the broad search
          let best = null
          let bestScore = 0
          for (const yt of ytItems) {
            if (usedYtIds.has(yt.id.videoId)) continue
            const s = ytMatchScore(yt.snippet.title, title, artist)
            if (s > bestScore) {
              best = yt
              bestScore = s
            }
          }

          // If no decent match from broad search, do a targeted YouTube search
          if (!best || bestScore === 0) {
            try {
              const targeted = await searchYouTube(
                `${title} ${artist} official audio`,
                key,
                3,
              )
              best = targeted.find((yt) => !usedYtIds.has(yt.id.videoId)) || null
            } catch {
              /* skip this song */
            }
          }

          if (!best) continue
          usedYtIds.add(best.id.videoId)

          const thumbs = best.snippet.thumbnails || {}
          verifiedResults.push({
            id: best.id.videoId,
            type: 'verified',
            title,
            artist,
            coverUrl: coverArtUrl(releaseId),
            thumbnail: thumbs.medium?.url || thumbs.default?.url || '',
            videoId: best.id.videoId,
          })
        }
      }

      // Raw YouTube fallback — items not matched to MusicBrainz
      const ytFallback = ytItems
        .filter((yt) => !usedYtIds.has(yt.id.videoId))
        .map((yt) => {
          const thumbs = yt.snippet.thumbnails || {}
          return {
            id: yt.id.videoId,
            type: 'youtube',
            title: yt.snippet.title,
            artist: yt.snippet.channelTitle || 'Unknown',
            coverUrl: null,
            thumbnail: thumbs.medium?.url || thumbs.default?.url || '',
            videoId: yt.id.videoId,
          }
        })

      setResults([...verifiedResults, ...ytFallback])
    } catch (e) {
      setError(e.message || 'Search failed')
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [q])

  const pick = async (item) => {
    if (!roomId) return
    await addSong(roomId, {
      videoId: item.videoId,
      title: item.title,
      thumbnail: item.thumbnail,
      artist: item.artist,
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
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 px-4 pt-[10vh]"
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
      <div className="relative z-10 flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl border border-aux-border bg-aux-surface shadow-2xl shadow-black/50">
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
            placeholder="Search for a song…"
            className="min-w-0 flex-1 rounded-xl border border-aux-border bg-black/30 px-3 py-2.5 text-white placeholder:text-white/35 focus:border-aux-mint/50 focus:outline-none focus:ring-1 focus:ring-aux-mint/40"
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
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

          {results.length > 0 && (
            <div className="mb-2 flex gap-3 text-[10px] font-semibold uppercase tracking-wider text-white/35">
              {results.some((r) => r.type === 'verified') && (
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-aux-mint" />
                  Verified songs
                </span>
              )}
              {results.some((r) => r.type === 'youtube') && (
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
                  From YouTube
                </span>
              )}
            </div>
          )}

          <ul className="space-y-2">
            {results.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => pick(item)}
                  className="flex w-full items-center gap-3 rounded-xl border border-transparent bg-black/25 p-2 text-left hover:border-aux-mint/40 hover:bg-black/40"
                >
                  <img
                    src={
                      item.type === 'verified' && item.coverUrl
                        ? item.coverUrl
                        : item.thumbnail
                    }
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-lg object-cover"
                    onError={(e) => {
                      if (e.target.src !== item.thumbnail) {
                        e.target.src = item.thumbnail
                      }
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="line-clamp-1 font-medium text-white">
                        {item.title}
                      </p>
                      {item.type === 'verified' && (
                        <span className="shrink-0 rounded-full bg-aux-mint/20 px-1.5 py-0.5 text-[10px] font-bold text-aux-mint">
                          ✓ verified
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <p className="truncate text-xs text-white/50">
                        {item.artist}
                      </p>
                      {item.type === 'youtube' && (
                        <span className="shrink-0 text-[10px] text-white/30">
                          From YouTube
                        </span>
                      )}
                    </div>
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
