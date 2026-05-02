import { useCallback, useState } from 'react'
import { submitVote } from '../firebase/roomService'

export function useVoting(roomId, userId, votesBySong) {
  const [toast, setToast] = useState(null)
  const [voteErrorFlash, setVoteErrorFlash] = useState(false)

  const getMyVote = useCallback(
    (songId) => {
      const v = votesBySong?.[songId]?.[userId]
      return v === 'up' || v === 'down' ? v : null
    },
    [votesBySong, userId],
  )

  const vote = useCallback(
    async (songId, direction) => {
      if (!roomId || !userId || !songId) return
      try {
        const { committed, kicked } = await submitVote(
          roomId,
          songId,
          userId,
          direction,
        )
        if (!committed) {
          setVoteErrorFlash(true)
          window.setTimeout(() => setVoteErrorFlash(false), 1600)
        }
        if (kicked) {
          setToast('The people have spoken 💀')
          window.setTimeout(() => setToast(null), 3200)
        }
      } catch (e) {
        console.error(e)
        setVoteErrorFlash(true)
        window.setTimeout(() => setVoteErrorFlash(false), 1600)
      }
    },
    [roomId, userId],
  )

  return {
    vote,
    getMyVote,
    toast,
    voteErrorFlash,
    clearToast: () => setToast(null),
  }
}
