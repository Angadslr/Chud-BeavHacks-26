import { useEffect, useState } from 'react'
import { isValidQueueEntryForUi, subscribeQueue } from '../firebase/roomService'

const QUEUE_DEBOUNCE_MS = 200

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

function queueDisplaySignature(entries) {
  if (!entries?.length) return ''
  return entries
    .map((e) => `${e.id}:${e.netScore}:${e.upvotes}:${e.downvotes}`)
    .join('|')
}

function transformAndSort(raw) {
  const entries = Object.entries(raw || {})
    .filter(([, song]) => isValidQueueEntryForUi(song))
    .map(([id, song]) => {
      const upvotes = song.upvotes || 0
      const downvotes = song.downvotes || 0
      const netScore = deriveNetScore(song)
      const totalVotes = deriveTotalVotes(song)
      const title = song.title != null ? String(song.title) : ''
      const artist = song.artist != null ? String(song.artist) : ''
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
}

/**
 * Queue from Firebase with debounced onValue (200ms) and sorted entries kept in state
 * (sort runs when data arrives, not during render).
 */
export function useSortedQueue(roomId) {
  const [sorted, setSorted] = useState([])

  useEffect(() => {
    if (!roomId) {
      setSorted([])
      return undefined
    }

    let timeoutId = null
    let pending = null
    let firstEvent = true

    const apply = (val) => {
      const next = transformAndSort(val)
      const sig = queueDisplaySignature(next)
      setSorted((prev) => {
        if (queueDisplaySignature(prev) === sig) return prev
        return next
      })
    }

    const unsub = subscribeQueue(roomId, (val) => {
      pending = val || {}
      if (firstEvent) {
        firstEvent = false
        apply(pending)
        return
      }
      if (timeoutId) window.clearTimeout(timeoutId)
      timeoutId = window.setTimeout(() => {
        timeoutId = null
        apply(pending)
      }, QUEUE_DEBOUNCE_MS)
    })

    return () => {
      if (timeoutId) window.clearTimeout(timeoutId)
      unsub()
    }
  }, [roomId])

  return sorted
}
