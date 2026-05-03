import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { addSong } from '../firebase/roomService'
import ArtworkImage from './ArtworkImage'
import { resolveArtworkUrlForSong } from '../lib/artworkResolve'
import { getDisplayName, getUserId } from '../lib/session'

const YT_SEARCH = 'https://www.googleapis.com/youtube/v3/search'
const YT_VIDEOS = 'https://www.googleapis.com/youtube/v3/videos'
const LASTFM_API = 'https://ws.audioscrobbler.com/2.0/'
const SEARCH_DEBOUNCE_MS = 400
const MIN_QUERY_LEN = 2
const HIGH_POPULARITY_THRESHOLD = 100_000_000
const SEARCH_CACHE_MAX = 10
const YOUTUBE_QUOTA_BACKOFF_MS = 120_000

const QUOTA_USER_MESSAGE =
  'YouTube daily quota is exhausted. New searches will not work until the quota resets (usually midnight Pacific Time) or you replace VITE_YOUTUBE_API_KEY with a key that still has quota.'
const QUOTA_HELP_URL =
  'https://console.cloud.google.com/apis/api/youtube.googleapis.com/quotas'

function decodeHtmlEntities(str) {
  if (!str) return ''
  return String(str)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&#x0*27;/gi, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function stripHtmlForDisplay(htmlish) {
  if (!htmlish) return ''
  return decodeHtmlEntities(
    String(htmlish)
      .replace(/<a[^>]*href=['"]([^'"]*)['"][^>]*>([^<]*)<\/a>/gi, '$2 ($1)')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  )
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
      if (!res.ok) throw new Error(data.error?.message || 'YouTube video stats failed')
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

function ytItemsToRows(items) {
  return items.map((yt, index) => {
    const thumbs = yt.snippet?.thumbnails || {}
    return {
      id: yt.id.videoId,
      type: 'youtube',
      title: decodeHtmlEntities(yt.snippet.title),
      artist: decodeHtmlEntities(yt.snippet.channelTitle || 'Unknown'),
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

function DragHandle() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className="shrink-0 text-white/30"
    >
      <rect x="2" y="3.5" width="12" height="1.5" rx="0.75" />
      <rect x="2" y="7.25" width="12" height="1.5" rx="0.75" />
      <rect x="2" y="11" width="12" height="1.5" rx="0.75" />
    </svg>
  )
}

export default function SearchModal({
  roomId,
  open,
  onClose,
  canRequestSongs = true,
  onGuestRequestsBlocked,
}) {
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState([])
  const [error, setError] = useState(null)
  const [staged, setStaged] = useState([])
  const [adding, setAdding] = useState(false)
  const [draggingIndexState, setDraggingIndexState] = useState(null)
  const [hoverIndexState, setHoverIndexState] = useState(null)

  const searchSeq = useRef(0)
  const debounceTimerRef = useRef(null)
  const searchCacheRef = useRef([])
  const lastGoodResultsRef = useRef([])
  const youtubeQuotaBackoffUntilRef = useRef(0)
  const dragIndex = useRef(null)
  const hoverIndex = useRef(null)
  const listRef = useRef(null)
  const activePointerIdRef = useRef(null)
  const dragStartYRef = useRef(0)
  const draggedRowRef = useRef(null)
  const searchInputRef = useRef(null)

  // Focus input when opened
  useEffect(() => {
    if (open) {
      window.setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }, [open])

  const handleClose = useCallback(() => {
    setStaged([])
    setQ('')
    setResults([])
    setError(null)
    setAdding(false)
    searchSeq.current += 1
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    dragIndex.current = null
    hoverIndex.current = null
    activePointerIdRef.current = null
    dragStartYRef.current = 0
    if (draggedRowRef.current) {
      draggedRowRef.current.style.transform = ''
      draggedRowRef.current.style.willChange = ''
      draggedRowRef.current.style.transition = ''
      draggedRowRef.current.style.position = ''
      draggedRowRef.current.style.zIndex = ''
      draggedRowRef.current = null
    }
    setDraggingIndexState(null)
    setHoverIndexState(null)
    onClose()
  }, [onClose])

  useEffect(() => {
    if (!open || canRequestSongs) return
    handleClose()
    onGuestRequestsBlocked?.()
  }, [open, canRequestSongs, handleClose, onGuestRequestsBlocked])

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
          ? `${QUOTA_USER_MESSAGE} Showing the last results below; they may not match "${query.trim()}".`
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
        Promise.all(baseRows.map((row) => fetchLastFmPlaycount(row.artist, row.title, lastFmKey))),
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
        return { ...row, popularityScore, popularityLabel, popularitySource }
      })
      const merged = sortSearchResults(enriched)
      setResults(merged)
      lastGoodResultsRef.current = merged
      pushSearchCache(searchCacheRef, normalized, merged)
    } catch (e) {
      if (seq !== searchSeq.current) return
      const isQuota = !!e?.isQuota
      if (isQuota) youtubeQuotaBackoffUntilRef.current = Date.now() + YOUTUBE_QUOTA_BACKOFF_MS
      const baseMsg = e.message || 'Search failed'
      const stale = isQuota && lastGoodResultsRef.current.length > 0
      setError(
        stale
          ? `${baseMsg} Showing the last results below; they may not match your search.`
          : baseMsg,
      )
      if (stale) setResults(lastGoodResultsRef.current)
      else setResults([])
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, handleClose])

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
      if (debounceTimerRef.current) { clearTimeout(debounceTimerRef.current); debounceTimerRef.current = null }
    }
  }, [q, open, runSearch])

  // Stage a song (or unstage if already staged) WITHOUT clearing search — results stay visible
  const pick = useCallback((item) => {
    setStaged((prev) => {
      const existing = prev.find((s) => s.videoId === item.videoId)
      if (existing) {
        // Already staged — remove it
        return prev.filter((s) => s.videoId !== item.videoId)
      }
      return [...prev, { ...item, stagedId: `${item.videoId}-${Date.now()}` }]
    })
    // Intentionally do NOT clear q or results here
  }, [])

  const removeStaged = useCallback((stagedId) => {
    setStaged((prev) => prev.filter((s) => s.stagedId !== stagedId))
  }, [])

  const updateHoverIndexFromY = useCallback((clientY, thresholdFactor = 0.5) => {
    const list = listRef.current
    if (!list) return null
    const rows = Array.from(list.querySelectorAll('.queue-item'))
    if (rows.length === 0) return null
    let nextHover = rows.length
    for (const row of rows) {
      const rect = row.getBoundingClientRect()
      const idx = Number(row.getAttribute('data-queue-index'))
      if (Number.isNaN(idx)) continue
      const midpoint = rect.top + rect.height * thresholdFactor
      if (clientY < midpoint) {
        nextHover = idx
        break
      }
    }
    if (hoverIndex.current !== nextHover) {
      hoverIndex.current = nextHover
      setHoverIndexState(nextHover)
      try {
        if (navigator.vibrate) navigator.vibrate(30)
      } catch {
        /* noop */
      }
    }
    return nextHover
  }, [])

  const finishReorder = useCallback((logTouch = false) => {
    if (dragIndex.current === null || hoverIndex.current === null) {
      dragIndex.current = null
      hoverIndex.current = null
      activePointerIdRef.current = null
      setDraggingIndexState(null)
      setHoverIndexState(null)
      return
    }
    const from = dragIndex.current
    const to = hoverIndex.current
    if (draggedRowRef.current) {
      draggedRowRef.current.style.transform = ''
      draggedRowRef.current.style.willChange = ''
      draggedRowRef.current.style.transition = ''
      draggedRowRef.current.style.position = ''
      draggedRowRef.current.style.zIndex = ''
      draggedRowRef.current = null
    }
    if (logTouch) console.log(from, to)
    if (from !== to) {
      setStaged((prev) => {
        const next = [...prev]
        const [moved] = next.splice(from, 1)
        next.splice(to, 0, moved)
        return next
      })
    }
    dragIndex.current = null
    hoverIndex.current = null
    activePointerIdRef.current = null
    dragStartYRef.current = 0
    setDraggingIndexState(null)
    setHoverIndexState(null)
  }, [])

  const onHandlePointerDown = useCallback((e, idx) => {
    e.preventDefault()
    const row = e.currentTarget.closest('.queue-item')
    if (!row) return
    activePointerIdRef.current = e.pointerId
    draggedRowRef.current = row
    dragStartYRef.current = e.clientY
    draggedRowRef.current.style.willChange = 'transform'
    draggedRowRef.current.style.transition = 'none'
    draggedRowRef.current.style.position = 'relative'
    draggedRowRef.current.style.zIndex = '50'
    draggedRowRef.current.style.transform = 'translateY(0px) scale(1.03)'
    dragIndex.current = idx
    hoverIndex.current = idx
    setDraggingIndexState(idx)
    setHoverIndexState(idx)
  }, [])

  // Attach move/up/cancel to window for the duration of a drag so the
  // handlers fire even when the pointer leaves the tiny drag-handle button.
  // This is the only reliable approach on mobile (iOS Safari ignores
  // setPointerCapture in scrollable containers).
  useEffect(() => {
    if (draggingIndexState === null) return

    const onMove = (e) => {
      if (activePointerIdRef.current !== e.pointerId) return
      if (!draggedRowRef.current || dragIndex.current === null) return
      e.preventDefault()
      const clientY = e.clientY
      if (Math.abs(clientY - dragStartYRef.current) > 8) {
        updateHoverIndexFromY(clientY, 0.6)
      }
      draggedRowRef.current.style.transform =
        `translateY(${clientY - dragStartYRef.current}px) scale(1.03)`
    }

    const onUp = (e) => {
      if (activePointerIdRef.current !== e.pointerId) return
      finishReorder(false)
    }

    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [draggingIndexState, updateHoverIndexFromY, finishReorder])

  const addAllToQueue = useCallback(async () => {
    if (!staged.length || !roomId || adding) return
    setAdding(true)
    try {
      for (const song of staged) {
        const thumbnail =
          (await resolveArtworkUrlForSong(song)) || song.thumbnail || ''
        await addSong(roomId, {
          videoId: song.videoId,
          title: song.title,
          thumbnail,
          artist: song.artist,
          addedBy: getDisplayName() || 'Guest',
          addedByUserId: getUserId(),
        })
      }
      handleClose()
    } catch {
      setAdding(false)
    }
  }, [staged, roomId, adding, handleClose])

  const flushSearch = () => {
    const trimmed = q.trim()
    if (trimmed.length < MIN_QUERY_LEN) return
    if (debounceTimerRef.current) { clearTimeout(debounceTimerRef.current); debounceTimerRef.current = null }
    runSearch(trimmed)
  }

  const onQueryChange = (e) => {
    const v = e.target.value
    setQ(v)
    if (v.trim().length < MIN_QUERY_LEN) {
      searchSeq.current += 1
      if (debounceTimerRef.current) { clearTimeout(debounceTimerRef.current); debounceTimerRef.current = null }
      setResults([])
      setError(null)
      setLoading(false)
    }
  }

  if (!open) return null

  const stagedIds = new Set(staged.map((s) => s.videoId))

  // Shared sidebar content rendered inside both mobile + desktop containers
  const sidebarInner = (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-lg font-bold text-white">Add songs</h2>
          {staged.length > 0 && (
            <p className="text-xs font-medium text-cyan-300/90">{staged.length} queued</p>
          )}
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="rounded-lg px-2 py-1 text-white/60 hover:bg-white/10 hover:text-white"
        >
          ✕
        </button>
      </div>

      {/* Search bar */}
      <div className="shrink-0 flex gap-2 border-b border-white/10 p-3">
        <input
          ref={searchInputRef}
          value={q}
          onChange={onQueryChange}
          onKeyDown={(e) => { if (e.key === 'Enter') flushSearch() }}
          placeholder="Search for a song…"
          className="app-input app-input-tight min-w-0 flex-1 py-2.5"
        />
        <div className="flex w-10 shrink-0 items-center justify-center" aria-hidden={!loading}>
          {loading ? (
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-cyan-400" aria-label="Loading" />
          ) : null}
        </div>
      </div>

      {/* Search results — scrollable, stays visible after picking */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
        {error && (
          <div className="mb-2 rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            <p className="whitespace-pre-line">{error}</p>
            {/quota|youtube daily/i.test(error) ? (
              <a
                href={QUOTA_HELP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-xs font-semibold text-cyan-300 underline hover:brightness-110"
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
            const highPopularity = (item.popularityScore || 0) >= HIGH_POPULARITY_THRESHOLD
            const isStaged = stagedIds.has(item.videoId)
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => pick(item)}
                  className={`group flex w-full items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-2 text-left transition-colors ${
                    isStaged
                      ? 'border-cyan-400/45 bg-cyan-400/10 hover:border-rose-400/40 hover:bg-rose-500/10'
                      : highPopularity
                        ? 'border-cyan-400/30 bg-cyan-400/[0.07] hover:bg-cyan-400/10'
                        : 'hover:border-cyan-400/35 hover:bg-white/[0.06]'
                  }`}
                >
                  <ArtworkImage
                    videoId={item.videoId}
                    thumbnail={item.thumbnail}
                    className="h-14 w-14 shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="max-w-full truncate font-medium text-white">{item.title}</p>
                      {index === 0 && !isStaged && (
                        <span className="shrink-0 rounded-full bg-emerald-500/25 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
                          Best match
                        </span>
                      )}
                      {isStaged && (
                        <span className="shrink-0">
                          <span className="rounded-full bg-cyan-400/20 px-1.5 py-0.5 text-[10px] font-bold text-cyan-200 group-hover:hidden">
                            ✓ Added
                          </span>
                          <span className="hidden rounded-full bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-200 group-hover:inline-block">
                            × Remove
                          </span>
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 min-w-0 truncate text-xs text-white/50">{item.artist}</p>
                  </div>
                  <div className="max-w-[8.5rem] shrink-0 text-right text-[10px] font-semibold tabular-nums leading-snug text-white/70">
                    {!isStaged && (
                      <p className="mb-0.5 font-bold text-cyan-300">Add</p>
                    )}
                    <p>{item.popularityLabel}</p>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Staged queue — shown when songs are staged */}
      {staged.length > 0 && (
        <div className="shrink-0 border-t border-white/10 bg-black/25">
          <div className="px-3 pt-3">
            <p className="app-label mb-2 !tracking-[0.12em]">
              Queue order ({staged.length})
            </p>
            <div
              ref={listRef}
              className="max-h-[190px] space-y-0.5 overflow-y-auto [&::-webkit-scrollbar]:hidden"
              style={{
                scrollbarWidth: 'none',
                touchAction: draggingIndexState !== null ? 'none' : 'pan-y',
              }}
            >
              {staged.map((song, idx) => {
                const isDragging = draggingIndexState === idx
                const shouldShiftDown =
                  draggingIndexState !== null &&
                  hoverIndexState !== null &&
                  idx >= hoverIndexState &&
                  idx < draggingIndexState
                const shouldShiftUp =
                  draggingIndexState !== null &&
                  hoverIndexState !== null &&
                  idx > draggingIndexState &&
                  idx <= hoverIndexState
                return (
                <Fragment key={song.stagedId}>
                {draggingIndexState !== null && hoverIndexState === idx ? (
                  <div
                    className="h-[2px] w-full bg-emerald-400 transition-transform duration-200 ease-out"
                    aria-hidden
                  />
                ) : null}
                <div
                  data-queue-index={idx}
                  className={`queue-item flex items-center gap-2 rounded-lg border px-2 py-1.5 ${
                    isDragging
                      ? 'is-dragging relative z-[50] border-emerald-400/75 bg-white/12'
                      : 'border-transparent bg-white/5 hover:bg-white/8'
                  }`}
                  style={{
                    opacity: isDragging ? 0.85 : 1,
                    transform: shouldShiftDown
                        ? 'translateY(56px)'
                        : shouldShiftUp
                          ? 'translateY(-56px)'
                          : 'translateY(0)',
                    transition: isDragging
                      ? 'transform 0.15s ease, opacity 0.15s ease'
                      : draggingIndexState !== null
                        ? 'transform 0.2s ease'
                        : 'none',
                  }}
                >
                  <button
                    type="button"
                    onPointerDown={(e) => onHandlePointerDown(e, idx)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-white/45 transition-colors hover:bg-white/10 hover:text-white"
                    style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
                    aria-label={`Reorder ${song.title}`}
                  >
                    <DragHandle />
                  </button>
                  <ArtworkImage
                    videoId={song.videoId}
                    thumbnail={song.thumbnail}
                    className="h-8 w-8 shrink-0 rounded-md object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{song.title}</p>
                    <p className="truncate text-xs text-white/45">{song.artist}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeStaged(song.stagedId)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-white/40 transition-colors hover:bg-white/10 hover:text-rose-400"
                    aria-label={`Remove ${song.title}`}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
                      <path d="M2.22 2.22a.75.75 0 0 1 1.06 0L6 4.94l2.72-2.72a.75.75 0 1 1 1.06 1.06L7.06 6l2.72 2.72a.75.75 0 1 1-1.06 1.06L6 7.06 3.28 9.78a.75.75 0 0 1-1.06-1.06L4.94 6 2.22 3.28a.75.75 0 0 1 0-1.06Z" />
                    </svg>
                  </button>
                </div>
                </Fragment>
              )})}
              {draggingIndexState !== null && hoverIndexState === staged.length ? (
                <div
                  className="h-[2px] w-full bg-emerald-400 transition-transform duration-200 ease-out"
                  aria-hidden
                />
              ) : null}
            </div>
          </div>
          <div className="px-3 pb-3 pt-2">
            <button
              type="button"
              onClick={addAllToQueue}
              disabled={adding}
              className="app-btn-cta"
            >
              {adding ? 'Adding…' : `Add ${staged.length} song${staged.length !== 1 ? 's' : ''} to Queue`}
            </button>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/70 opacity-100 transition-opacity duration-200 ease-out"
        aria-hidden
        onClick={handleClose}
      />

      {/* Mobile: bottom sheet */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 flex max-h-[88vh] flex-col overflow-hidden rounded-t-2xl border-t border-white/10 bg-[#0a0c14]/95 backdrop-blur-xl sm:hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Add songs"
      >
        {/* Drag handle bar */}
        <div className="flex shrink-0 justify-center pb-1 pt-2.5">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>
        {sidebarInner}
      </div>

      {/* Desktop: right sidebar */}
      <div
        className="fixed bottom-0 right-0 top-0 z-50 hidden w-[420px] flex-col overflow-hidden border-l border-white/10 bg-[#0a0c14]/95 backdrop-blur-xl sm:flex"
        role="dialog"
        aria-modal="true"
        aria-label="Add songs"
      >
        {sidebarInner}
      </div>
    </>
  )
}
