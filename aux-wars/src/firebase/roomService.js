import {
  ref,
  set,
  get,
  onValue,
  push,
  runTransaction,
  update,
  onDisconnect,
  remove,
} from 'firebase/database'
import { getDb } from './config'

function requireDb() {
  const db = getDb()
  if (!db) {
    const err = new Error(
      'Firebase is not configured. Set VITE_FIREBASE_* in .env (see .env.example).',
    )
    err.code = 'FIREBASE_NOT_CONFIGURED'
    throw err
  }
  return db
}

export function roomRef(roomId) {
  return ref(requireDb(), `rooms/${roomId}`)
}

export function createRoom(roomId, hostId, settings = {}) {
  const now = Date.now()
  const allowGuestRequests =
    settings.allowGuestRequests !== false &&
    settings.allowRequests !== false
  const playOnEveryDevice =
    settings.playOnEveryDevice !== false &&
    settings.playOnAllDevices !== false
  return set(roomRef(roomId), {
    createdAt: now,
    lastActivityAt: now,
    hostId: hostId || null,
    settings: {
      allowSkip: settings.allowSkip !== false,
      allowPause: settings.allowPause !== false,
      allowGuestRequests,
      playOnEveryDevice,
      allowRequests: allowGuestRequests,
      playOnAllDevices: playOnEveryDevice,
    },
    nowPlaying: null,
    previousTrack: null,
    queue: {},
    votes: {},
    users: {},
    playHistory: {},
  })
}

export function kickUser(roomId, userId) {
  const userRef = ref(requireDb(), `rooms/${roomId}/users/${userId}`)
  return remove(userRef)
}

export function updatePlaybackSync(roomId, currentTime, duration, isPlaying) {
  return update(ref(requireDb(), `rooms/${roomId}/playback`), {
    currentTime,
    duration: Number.isFinite(duration) && duration > 0 ? duration : null,
    isPlaying,
    syncedAt: Date.now(),
  })
}

export function subscribePlayback(roomId, cb) {
  const r = ref(requireDb(), `rooms/${roomId}/playback`)
  return onValue(r, (snap) => cb(snap.exists() ? snap.val() : null))
}

export function subscribeRoom(roomId, cb) {
  const r = roomRef(roomId)
  return onValue(r, (snap) => cb(snap.exists() ? snap.val() : null))
}

export function subscribeUsers(roomId, cb) {
  const r = ref(requireDb(), `rooms/${roomId}/users`)
  return onValue(r, (snap) => cb(snap.val() || {}))
}

export async function roomExists(roomId) {
  const snap = await get(roomRef(roomId))
  return snap.exists()
}

export async function upsertUser(roomId, userId, displayName) {
  const userPath = `rooms/${roomId}/users/${userId}`
  const userRef = ref(requireDb(), userPath)
  const snap = await get(userRef)
  const existing = snap.val()
  const patch = {
    displayName,
    joinedAt: existing?.joinedAt ?? Date.now(),
    downvotesReceived: existing?.downvotesReceived ?? 0,
  }
  await update(ref(requireDb(), `rooms/${roomId}`), {
    [`users/${userId}`]: patch,
    lastActivityAt: Date.now(),
  })
  onDisconnect(userRef).remove()
}

export async function addSong(roomId, payload) {
  const {
    videoId,
    title,
    thumbnail,
    artist,
    addedBy,
    addedByUserId,
  } = payload
  const queueRef = ref(requireDb(), `rooms/${roomId}/queue`)
  const newRef = push(queueRef)
  await set(newRef, {
    videoId,
    title,
    thumbnail,
    artist,
    addedBy,
    addedByUserId: addedByUserId || null,
    upvotes: 0,
    downvotes: 0,
    netScore: 0,
    totalVotes: 0,
    addedAt: Date.now(),
  })
  await update(ref(requireDb(), `rooms/${roomId}`), { lastActivityAt: Date.now() })
  return newRef.key
}

/** Append multiple songs in order (sequential writes preserve queue order). */
export async function addSongsInOrder(roomId, payloads) {
  const keys = []
  for (const payload of payloads) {
    keys.push(await addSong(roomId, payload))
  }
  return keys
}

/** Shallow-merge fields on one queue item (e.g. upgrade thumbnail after async cover lookup). */
export async function patchQueueSong(roomId, queueItemKey, patch) {
  if (!queueItemKey || !patch || typeof patch !== 'object') return
  const songRef = ref(requireDb(), `rooms/${roomId}/queue/${queueItemKey}`)
  await update(songRef, patch)
  await update(ref(requireDb(), `rooms/${roomId}`), { lastActivityAt: Date.now() })
}

function deriveNetScore(song) {
  if (song == null) return 0
  if (song.netScore != null) return song.netScore
  if (song.netVotes != null) return song.netVotes
  return (song.upvotes || 0) - (song.downvotes || 0)
}

function deriveTotalVotes(song) {
  if (song == null) return 0
  if (song.totalVotes != null) return song.totalVotes
  return (song.upvotes || 0) + (song.downvotes || 0)
}

function pickWinner(queue) {
  const entries = Object.entries(queue || {})
  if (entries.length === 0) return null
  let bestId = null
  let bestScore = null
  let bestAdded = null
  for (const [id, song] of entries) {
    const ns = deriveNetScore(song)
    const added = song.addedAt ?? 0
    if (
      bestId == null ||
      ns > bestScore ||
      (ns === bestScore && added < bestAdded)
    ) {
      bestId = id
      bestScore = ns
      bestAdded = added
    }
  }
  return { id: bestId, song: queue[bestId] }
}

function snapshotTrack(np) {
  if (!np?.videoId) return null
  const up = np.upvotes ?? 0
  const down = np.downvotes ?? 0
  return {
    videoId: np.videoId,
    title: np.title ?? '',
    thumbnail: np.thumbnail ?? '',
    artist: np.artist ?? '',
    addedBy: np.addedBy ?? '',
    queueItemId: np.queueItemId ?? null,
    upvotes: up,
    downvotes: down,
    netScore: deriveNetScore(np),
    totalVotes: deriveTotalVotes(np),
  }
}

function playHistoryKey(np, now) {
  return np.queueItemId || `h_${now}_${Math.random().toString(36).slice(2, 9)}`
}

function buildPlayHistoryEntry(np, now) {
  return {
    videoId: np.videoId,
    title: np.title ?? '',
    thumbnail: np.thumbnail ?? '',
    artist: np.artist ?? '',
    addedBy: np.addedBy ?? '',
    finalNetScore: deriveNetScore(np),
    playedAt: now,
  }
}

function mergePlayHistory(room, np, now) {
  if (!np?.videoId) return room.playHistory || {}
  const key = playHistoryKey(np, now)
  return {
    ...(room.playHistory || {}),
    [key]: buildPlayHistoryEntry(np, now),
  }
}

function nowPlayingFromQueueSong(song, queueItemId) {
  const up = song.upvotes ?? 0
  const down = song.downvotes ?? 0
  return {
    videoId: song.videoId,
    title: song.title != null ? String(song.title) : '',
    thumbnail: song.thumbnail,
    artist: song.artist != null ? String(song.artist) : '',
    addedBy: song.addedBy ?? '',
    queueItemId,
    upvotes: up,
    downvotes: down,
    netScore: deriveNetScore(song),
    totalVotes: up + down,
  }
}

/**
 * @param {string} roomId
 * @param {string|null} endedVideoId — null means "start if idle"
 */
export function advanceToNextSong(roomId, endedVideoId) {
  const r = roomRef(roomId)
  return runTransaction(r, (room) => {
    if (!room) return room

    const now = Date.now()

    const np = room.nowPlaying
    const idleStart = endedVideoId == null || endedVideoId === ''

    if (idleStart) {
      if (np?.videoId) return undefined
    } else if (np?.videoId !== endedVideoId) {
      return undefined
    }

    const outgoing = snapshotTrack(np)
    const nextPlayHistory = np?.videoId
      ? mergePlayHistory(room, np, now)
      : room.playHistory || {}

    const queue = room.queue ? { ...room.queue } : {}
    const winner = pickWinner(queue)
    if (!winner) {
      return {
        ...room,
        nowPlaying: null,
        previousTrack: outgoing ?? room.previousTrack ?? null,
        playHistory: nextPlayHistory,
        lastActivityAt: now,
      }
    }

    delete queue[winner.id]
    const nextVotes = { ...(room.votes || {}) }
    delete nextVotes[winner.id]
    const s = winner.song

    return {
      ...room,
      nowPlaying: nowPlayingFromQueueSong(s, winner.id),
      previousTrack: outgoing ?? room.previousTrack ?? null,
      queue,
      votes: nextVotes,
      playHistory: nextPlayHistory,
      lastActivityAt: now,
    }
  })
}

/** Skip current track: promote top queue item (same rules as auto-advance), no “ended” check. */
export function forceSkipToNext(roomId) {
  const r = roomRef(roomId)
  return runTransaction(r, (room) => {
    if (!room) return room

    const now = Date.now()
    const np = room.nowPlaying
    const outgoing = snapshotTrack(np)
    const nextPlayHistory = np?.videoId
      ? mergePlayHistory(room, np, now)
      : room.playHistory || {}

    const queue = room.queue ? { ...room.queue } : {}
    const winner = pickWinner(queue)
    if (!winner) {
      return {
        ...room,
        nowPlaying: null,
        previousTrack: outgoing ?? room.previousTrack ?? null,
        playHistory: nextPlayHistory,
        lastActivityAt: now,
      }
    }

    delete queue[winner.id]
    const nextVotes = { ...(room.votes || {}) }
    delete nextVotes[winner.id]
    const s = winner.song

    return {
      ...room,
      nowPlaying: nowPlayingFromQueueSong(s, winner.id),
      previousTrack: outgoing ?? room.previousTrack ?? null,
      queue,
      votes: nextVotes,
      playHistory: nextPlayHistory,
      lastActivityAt: now,
    }
  })
}

/** Swap now playing with previous track (toggle-style history hop). */
export function goToPreviousTrack(roomId) {
  const r = roomRef(roomId)
  return runTransaction(r, (room) => {
    if (!room) return room
    const prev = room.previousTrack
    if (!prev?.videoId) return undefined

    const now = Date.now()
    const cur = snapshotTrack(room.nowPlaying)

    return {
      ...room,
      nowPlaying: {
        videoId: prev.videoId,
        title: prev.title,
        thumbnail: prev.thumbnail,
        artist: prev.artist,
        addedBy: prev.addedBy ?? '',
        queueItemId: prev.queueItemId ?? null,
        upvotes: prev.upvotes ?? 0,
        downvotes: prev.downvotes ?? 0,
        netScore: deriveNetScore(prev),
        totalVotes: deriveTotalVotes(prev),
      },
      previousTrack: cur,
      lastActivityAt: now,
    }
  })
}

const AUTO_KICK_THRESHOLD = -5

/**
 * @returns {Promise<{ committed: boolean, kicked: boolean }>}
 */
export function submitVote(roomId, songId, userId, direction) {
  const r = roomRef(roomId)
  return runTransaction(r, (room) => {
    if (!room) return room

    const now = Date.now()
    const song = room.queue?.[songId]
    if (!song) return undefined

    const prior = room.votes?.[songId]?.[userId]
    if (prior === direction) {
      return room
    }

    let upvotes = song.upvotes || 0
    let downvotes = song.downvotes || 0

    if (prior === 'up') upvotes -= 1
    if (prior === 'down') downvotes -= 1

    if (direction === 'up') upvotes += 1
    else downvotes += 1

    const netScore = upvotes - downvotes
    const totalVotes = upvotes + downvotes

    const nextVotes = { ...(room.votes || {}) }
    if (!nextVotes[songId]) nextVotes[songId] = {}
    nextVotes[songId][userId] = direction

    const nextQueue = { ...(room.queue || {}) }
    let nextUsers = room.users ? { ...room.users } : {}

    if (song.addedByUserId) {
      const adder = nextUsers[song.addedByUserId]
      if (adder) {
        let delta = 0
        if (direction === 'down') delta += 1
        if (prior === 'down') delta -= 1
        if (delta !== 0) {
          nextUsers[song.addedByUserId] = {
            ...adder,
            downvotesReceived: Math.max(
              0,
              (adder.downvotesReceived || 0) + delta,
            ),
          }
        }
      }
    }

    if (netScore <= AUTO_KICK_THRESHOLD) {
      delete nextQueue[songId]
      delete nextVotes[songId]
      return {
        ...room,
        queue: nextQueue,
        votes: nextVotes,
        users: nextUsers,
        lastActivityAt: now,
      }
    }

    nextQueue[songId] = {
      ...song,
      upvotes,
      downvotes,
      netScore,
      totalVotes,
    }

    return {
      ...room,
      queue: nextQueue,
      votes: nextVotes,
      users: nextUsers,
      lastActivityAt: now,
    }
  }).then((result) => {
    if (!result.committed) {
      return { committed: false, kicked: false }
    }
    const after = result.snapshot.val()
    const stillThere = !!after?.queue?.[songId]
    const kicked = direction === 'down' && !stillThere
    return { committed: true, kicked }
  })
}