import { useMemo } from 'react'

/** Canonical vibe math: netScore = upvotes - downvotes (same as former netVotes). */
export function deriveNetScore(song) {
  if (song == null) return 0
  if (song.netScore != null) return song.netScore
  if (song.netVotes != null) return song.netVotes
  return (song.upvotes || 0) - (song.downvotes || 0)
}

export function deriveTotalVotes(song) {
  if (song == null) return 0
  if (song.totalVotes != null) return song.totalVotes
  return (song.upvotes || 0) + (song.downvotes || 0)
}

/**
 * Real-time queue: normalize netScore & totalVotes, sort by netScore desc,
 * tiebreaker addedAt ascending (oldest wins).
 */
export function useQueue(queue) {
  return useMemo(() => {
    const entries = Object.entries(queue || {}).map(([id, song]) => {
      const upvotes = song.upvotes || 0
      const downvotes = song.downvotes || 0
      const netScore = deriveNetScore(song)
      const totalVotes = deriveTotalVotes(song)
      // Same canonical fields as `nowPlayingFromQueueSong` / NowPlaying.jsx — title & artist from Firebase
      const title = song.title != null ? String(song.title) : ''
      const artist = song.artist != null ? String(song.artist) : ''
      // `id` after spread so the Realtime DB push key always wins over any stray `id` field on the node
      return {
        ...song,
        id,
        title,
        artist,
        upvotes,
        downvotes,
        netScore,
        totalVotes,
      }
    })

    entries.sort((a, b) => {
      if (b.netScore !== a.netScore) {
        return b.netScore - a.netScore
      }
      return (a.addedAt || 0) - (b.addedAt || 0)
    })

    return entries
  }, [queue])
}
