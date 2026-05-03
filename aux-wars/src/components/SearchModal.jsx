import { useCallback, useEffect, useRef, useState } from 'react'
import { addSong, patchQueueSong } from '../firebase/roomService'
import { getDisplayName, getUserId } from '../lib/session'

const YT_SEARCH = 'https://www.googleapis.com/youtube/v3/search'
const YT_VIDEOS = 'https://www.googleapis.com/youtube/v3/videos'
const LASTFM_API = 'https://ws.audioscrobbler.com/2.0/'
const MB_API = 'https://musicbrainz.org/ws/2/recording/'
const CAA_BASE = 'https://coverartarchive.org/release'

/** Slightly longer debounce reduces YouTube Data API quota burn (search costs ~100 units). */
const SEARCH_DEBOUNCE_MS = 400
const MIN_QUERY_LEN = 2
const HIGH_POPULARITY_THRESHOLD = 100_000_000
const SEARCH_CACHE_MAX = 10
/** After a quota error, skip new YouTube requests briefly to avoid hammering a dead endpoint. */
const YOUTUBE_QUOTA_BACKOFF_MS = 120_000

const QUOTA_USER_MESSAGE =
  'YouTube daily quota is exhausted. New searches will not work until the quota resets (usually midnight Pacific Time) or you replace VITE_YOUTUBE_API_KEY with a key that still has quota.'
const QUOTA_HELP_URL =
  'https://console.cloud.google.com/apis/api/youtube.googleapis.com/quotas'

function stripHtmlForDisplay(htmlish) {
  if (!htmlish) return ''
  return String(htmlish)
    .replace(/<a[^>]*href=['"]([^'"]*)['"][^>]*>([^<]*)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isYouTubeQuotaError(message, errors) {
  const m = (message || '').toLowerCase()
  if (m.includes('quota')) return true
  if (m.includes('exceed')) return true
  const reasons = errors || []
  return reasons.some(
    (x) =>
      x?.reason === 'quotaExceeded' ||
      x?.reason === 'dailyLimitExceeded' ||
      x?.domain === 'youtubeQuota',
  )
}

/** Same compact formatting as before; `plays` | `youtubeViews` picks the suffix. */
function formatPopularityBadge(n, kind) {
  if (n == null || Number.isNaN(n)) return '—'
  const v = Number(n)
  let core
  if (v >= 1e9) {
    const x = v / 1e9
    core = `${x >= 10 ? Math.round(x) : x.toFixed(1).replace(/\.0$/, '')}B`
  } else if (v >= 1e6) {
    const x = v / 1e6
    core = `${x >= 10 ? Math.round(x) : x.toFixed(1).replace(/\.0$/, '')}M`
  } else if (v >= 1e3) {
    const x = v / 1e3
    core = `${x >= 10 ? Math.round(x) : x.toFixed(1).replace(/\.0$/, '')}K`
  } else {
    core = `${v}`
  }
  if (kind === 'youtubeViews') return `${core} YouTube views`
  return `${core} plays`
}

function cacheKey(query) {
  return query.trim().toLowerCase()
}

/**
 * Preserve YouTube's relevance order (order=relevance). Lower index = better title match.
 * Popularity (Last.fm / YouTube) must never move a worse-relevance row above a better one,
 * so we sort by relevanceRank only. Tie-break: popularity (shouldn't occur per rank).
 */
function sortSearchResults(rows) {
  return [...rows].sort((a, b) => {
    const ra = a.relevanceRank ?? 999
    const rb = b.relevanceRank ?? 999
    if (ra !== rb) return ra - rb
    return (b.popularityScore ?? 0) - (a.popularityScore ?? 0)
  })
}

async function searchYouTube(query, key, maxResults = 10) {
  const url = new URL(YT_SEARCH)
  url.searchParams.set('part', 'snippet')
  url.searchParams.set('type', 'video')
  url.searchParams.set('videoCategoryId', '10')
  url.searchParams.set('order', 'relevance')
  url.searchParams.set('maxResults', String(maxResults))
  url.searchParams.set('q', query)
  url.searchParams.set('key', key)
  const res = await fetch(url.toString())
  const data = await res.json()
  if (!res.ok) {
    const raw = data.error?.message || 'YouTube search failed'
    const quota = isYouTubeQuotaError(raw, data.error?.errors)
    const err = new Error(
      quota ? QUOTA_USER_MESSAGE : stripHtmlForDisplay(raw) || 'YouTube search failed',
    )
    err.isQuota = quota
    throw err
  }
  return data.items || []
}

/** Fetch statistics for all ids; chunk requests run in parallel via Promise.all. */
async function fetchVideoStatistics(videoIds, key) {
  const unique = [...new Set(videoIds.filter(Boolean))]
  const chunkSize = 50
  const chunks = []
  for (let i = 0; i < unique.length; i += chunkSize) {
    chunks.push(unique.slice(i, i + chunkSize))
  }

  const maps = await Promise.all(
    chunks.map(async (chunk) => {
      const url = new URL(YT_VIDEOS)
      url.searchParams.set('part', 'statistics')
      url.searchParams.set('id', chunk.join(','))
      url.searchParams.set('key', key)
      const res = await fetch(url.toString())
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error?.message || 'YouTube video stats failed')
      }
      const m = new Map()
      for (const item of data.items || []) {
        const raw = item.statistics?.viewCount
        if (raw != null) m.set(item.id, parseInt(raw, 10))
      }
      return m
    }),
  )

  const merged = new Map()
  for (const m of maps) {
    for (const [k, v] of m) merged.set(k, v)
  }
  return merged
}

async function fetchLastFmPlaycount(artist, track, apiKey) {
  if (!apiKey || !artist?.trim() || !track?.trim()) return null
  const url = new URL(LASTFM_API)
  url.searchParams.set('method', 'track.getInfo')
  url.searchParams.set('api_key', apiKey)
  url.searchParams.set('artist', artist.trim())
  url.searchParams.set('track', track.trim())
  url.searchParams.set('autocorrect', '1')
  url.searchParams.set('format', 'json')
  try {
    const res = await fetch(url.toString())
    const data = await res.json()
    if (!res.ok || data.error) return null
    const raw = data.track?.playcount
    if (raw == null || raw === '') return null
    const n = parseInt(String(raw), 10)
    return Number.isNaN(n) ? null : n
  } catch {
    return null
  }
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

async function resolveCoverArtFromMusicBrainz(item) {
  const q = `${item.title} ${item.artist}`.trim()
  if (!q) return null
  const recs = await searchMusicBrainz(q)
  const rec = recs[0]
  if (!rec) return null
  const releaseId = rec.releases?.[0]?.id || null
  return coverArtUrl(releaseId)
}

function preloadImage(url) {
  return new Promise((resolve) => {
    if (!url) {
      resolve(false)
      return
    }
    const img = new Image()
    img.onload = () => resolve(true)
    img.onerror = () => resolve(false)
    img.src = url
  })
}

function ytItemsToRows(items) {
  return items.map((yt, index) => {
    const thumbs = yt.snippet?.thumbnails || {}
    return {
      id: yt.id.videoId,
      type: 'youtube',
      title: yt.snippet.title,
      artist: yt.snippet.channelTitle || 'Unknown',
      thumbnail: thumbs.medium?.url || thumbs.default?.url || '',
      videoId: yt.id.videoId,
      relevanceRank: index,
      popularityScore: 0,
      popularityLabel: '…',
      popularitySource: null,
    }
  })
}

function pushSearchCache(cacheRef, key, rows) {
  const list = cacheRef.current.filter((e) => e.key !== key)
  list.unshift({ key, rows })
  cacheRef.current = list.slice(0, SEARCH_CACHE_MAX)
}

export default function SearchModal({ roomId, open, onClose }) {
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState([])
  const [error, setError] = useState(null)
  const searchSeq = useRef(0)
  const debounceTimerRef = useRef(null)
  const searchCacheRef = useRef([])
  const lastGoodResultsRef = useRef([])
  const youtubeQuotaBackoffUntilRef = useRef(0)

  const runSearch = useCallback(async (query) => {
    const ytKey = import.meta.env.VITE_YOUTUBE_API_KEY
    if (!ytKey) {
      setError('Missing VITE_YOUTUBE_API_KEY in .env')
      setResults([])
      return
    }

    const lastFmKey = import.meta.env.VITE_LASTFM_API_KEY || ''

    const normalized = cacheKey(query)
    const cached = searchCacheRef.current.find((e) => e.key === normalized)
    if (cached) {
      searchSeq.current += 1
      setError(null)
      setLoading(false)
      setResults(cached.rows)
      lastGoodResultsRef.current = cached.rows
      return
    }

    if (Date.now() < youtubeQuotaBackoffUntilRef.current) {
      searchSeq.current += 1
      setLoading(false)
      const stale = lastGoodResultsRef.current.length > 0
      setError(
        stale
          ? `${QUOTA_USER_MESSAGE} Showing the last results below; they may not match “${query.trim()}”.`
          : QUOTA_USER_MESSAGE,
      )
      if (stale) setResults(lastGoodResultsRef.current)
      return
    }

    const seq = ++searchSeq.current
    setLoading(true)
    setError(null)

    try {
      const items = await searchYouTube(query, ytKey, 10)
      if (seq !== searchSeq.current) return

      const baseRows = ytItemsToRows(items)
      setResults(baseRows)
      setLoading(false)

      const ids = baseRows.map((r) => r.videoId)
      const [ytStatsMap, lastFmCounts] = await Promise.all([
        fetchVideoStatistics(ids, ytKey).catch(() => new Map()),
        Promise.all(
          baseRows.map((row) =>
            fetchLastFmPlaycount(row.artist, row.title, lastFmKey),
          ),
        ),
      ])
      if (seq !== searchSeq.current) return

      const enriched = baseRows.map((row, i) => {
        const lf = lastFmCounts[i]
        const ytViews = ytStatsMap.get(row.videoId)

        let popularityScore = 0
        let popularityLabel = '—'
        let popularitySource = null

        if (lf != null) {
          popularityScore = lf
          popularityLabel = formatPopularityBadge(lf, 'plays')
          popularitySource = 'lastfm'
        } else if (ytViews != null) {
          popularityScore = ytViews
          popularityLabel = formatPopularityBadge(ytViews, 'youtubeViews')
          popularitySource = 'youtube'
        }

        return {
          ...row,
          popularityScore,
          popularityLabel,
          popularitySource,
        }
      })

      const merged = sortSearchResults(enriched)
      setResults(merged)
      lastGoodResultsRef.current = merged
      pushSearchCache(searchCacheRef, normalized, merged)
    } catch (e) {
      if (seq !== searchSeq.current) return
      const isQuota = !!e?.isQuota
      if (isQuota) {
        youtubeQuotaBackoffUntilRef.current = Date.now() + YOUTUBE_QUOTA_BACKOFF_MS
      }
      const baseMsg = e.message || 'Search failed'
      const stale = isQuota && lastGoodResultsRef.current.length > 0
      setError(
        stale
          ? `${baseMsg} Showing the last results below; they may not match your search.`
          : baseMsg,
      )
      if (stale) {
        setResults(lastGoodResultsRef.current)
      } else {
        setResults([])
      }
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return

    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return

    const trimmed = q.trim()
    if (trimmed.length < MIN_QUERY_LEN) return

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null
      runSearch(trimmed)
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
    }
  }, [q, open, runSearch])

  const pick = async (item) => {
    if (!roomId) return
    const queueItemKey = await addSong(roomId, {
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

    void (async () => {
      try {
        const artUrl = await resolveCoverArtFromMusicBrainz(item)
        if (!artUrl) return
        const ok = await preloadImage(artUrl)
        if (!ok) return
        await patchQueueSong(roomId, queueItemKey, { thumbnail: artUrl })
      } catch {
        /* ignore background enrichment errors */
      }
    })()
  }

  const flushSearch = () => {
    const trimmed = q.trim()
    if (trimmed.length < MIN_QUERY_LEN) return
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    runSearch(trimmed)
  }

  const onQueryChange = (e) => {
    const v = e.target.value
    setQ(v)
    if (v.trim().length < MIN_QUERY_LEN) {
      searchSeq.current += 1
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
      setResults([])
      setError(null)
      setLoading(false)
    }
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
            onChange={onQueryChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter') flushSearch()
            }}
            placeholder="Search for a song…"
            className="min-w-0 flex-1 rounded-xl border border-aux-border bg-black/30 px-3 py-2.5 text-white placeholder:text-white/35 focus:border-aux-mint/50 focus:outline-none focus:ring-1 focus:ring-aux-mint/40"
            autoFocus
          />
          <div
            className="flex w-10 shrink-0 items-center justify-center"
            aria-hidden={!loading}
          >
            {loading ? (
              <span
                className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-aux-mint"
                aria-label="Loading"
              />
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {error && (
            <div className="mb-2 rounded-lg bg-aux-coral/15 px-3 py-2 text-sm text-aux-coral">
              <p className="whitespace-pre-line">{error}</p>
              {/quota|youtube daily/i.test(error) ? (
                <a
                  href={QUOTA_HELP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-xs font-semibold text-aux-mint underline hover:brightness-110"
                >
                  Open YouTube API quotas in Google Cloud
                </a>
              ) : null}
            </div>
          )}

          {loading && results.length === 0 && !error && q.trim().length >= MIN_QUERY_LEN && (
            <p className="text-center text-sm text-white/45">Searching…</p>
          )}

          {results.length > 0 && (
            <div className="mb-2 flex gap-3 text-[10px] font-semibold uppercase tracking-wider text-white/35">
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
                From YouTube
              </span>
            </div>
          )}

          <ul className="space-y-2">
            {results.map((item, index) => {
              const highPopularity =
                (item.popularityScore || 0) >= HIGH_POPULARITY_THRESHOLD
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => pick(item)}
                    className={`flex w-full items-center gap-3 rounded-xl border p-2 text-left transition-colors hover:border-aux-mint/40 ${
                      highPopularity
                        ? 'border-aux-mint/25 bg-aux-mint/[0.07] hover:bg-aux-mint/10'
                        : 'border-transparent bg-black/25 hover:bg-black/40'
                    }`}
                  >
                    <img
                      src={item.thumbnail}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded-lg object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="line-clamp-1 font-medium text-white">
                          {item.title}
                        </p>
                        {index === 0 && (
                          <span className="shrink-0 rounded-full bg-emerald-500/25 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
                            Best match
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <p className="min-w-0 truncate text-xs text-white/50">
                          {item.artist}
                        </p>
                      </div>
                    </div>
                    <span className="max-w-[8.5rem] shrink-0 text-right text-[10px] font-semibold tabular-nums leading-snug text-white/70">
                      {item.popularityLabel}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}
