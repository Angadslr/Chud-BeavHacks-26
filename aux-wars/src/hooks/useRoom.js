/* eslint-disable react-hooks/set-state-in-effect -- onValue subscription needs loading/reset synchronously when roomId changes */
import { useEffect, useState } from 'react'
import { subscribeRoom } from '../firebase/roomService'

export function useRoom(roomId) {
  const [room, setRoom] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!roomId) {
      setLoading(false)
      setRoom(null)
      return undefined
    }
    setRoom(null)
    setLoading(true)
    const unsub = subscribeRoom(roomId, (val) => {
      setRoom(val ?? null)
      setLoading(false)
    })
    return unsub
  }, [roomId])

  const exists = loading ? true : room != null
  return { room, loading, exists }
}
