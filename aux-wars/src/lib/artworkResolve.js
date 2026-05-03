const MB_API = 'https://musicbrainz.org/ws/2/recording/'
const CAA_BASE = 'https://coverartarchive.org/release'

/** videoId -> resolved artwork URL (module-level cache; never replaced once set). */
const artworkCache = {}

export function peekCachedArtworkUrl(videoId) {
  if (!videoId) return undefined
  return Object.prototype.hasOwnProperty.call(artworkCache, videoId)
    ? artworkCache[videoId]
    : undefined
}

function setCachedArtworkUrl(videoId, url) {
  if (videoId) artworkCache[videoId] = url
}

export function getPrimaryArtworkDisplayUrl(videoId, thumbnail) {
  if (!videoId) return thumbnail || ''
  const cached = peekCachedArtworkUrl(videoId)
  if (cached !== undefined) return cached || ''
  return (
    thumbnail ||
    `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
  )
}

/** Primary first, then YouTube poster sizes (maxres → default). */
export function youtubePosterFallbackChain(videoId, primary) {
  const chain = []
  const seen = new Set()
  const add = (u) => {
    if (!u || seen.has(u)) return
    seen.add(u)
    chain.push(u)
  }
  add(primary)
  if (videoId) {
    add(`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`)
    add(`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`)
    add(`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`)
    add(`https://img.youtube.com/vi/${videoId}/default.jpg`)
  }
  return chain
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

export function preloadImage(url) {
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

/**
 * Resolve once per videoId: Cover Art Archive (via MusicBrainz) if it loads, else YouTube/stored thumb.
 * Results are cached; subsequent calls return the cache immediately.
 */
export async function resolveArtworkUrlForSong(song) {
  const videoId = song?.videoId
  if (!videoId) return song?.thumbnail || null

  if (Object.prototype.hasOwnProperty.call(artworkCache, videoId)) {
    return artworkCache[videoId]
  }

  const ytFallback =
    song.thumbnail ||
    `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`

  try {
    const mbUrl = await resolveCoverArtFromMusicBrainz(song)
    if (mbUrl) {
      const ok = await preloadImage(mbUrl)
      if (ok) {
        setCachedArtworkUrl(videoId, mbUrl)
        return mbUrl
      }
    }
  } catch {
    /* network error — fall back to YouTube */
  }

  setCachedArtworkUrl(videoId, ytFallback)
  return ytFallback
}
