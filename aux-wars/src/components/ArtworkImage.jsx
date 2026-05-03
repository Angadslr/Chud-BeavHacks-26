import { useEffect, useMemo, useState } from 'react'
import {
  getPrimaryArtworkDisplayUrl,
  youtubePosterFallbackChain,
} from '../lib/artworkResolve'

/**
 * Stable artwork: primary URL is fixed per videoId (cache + thumb at first paint for that id).
 * onError advances through the YouTube fallback chain without swapping sources from Firebase re-renders.
 */
export default function ArtworkImage({
  videoId,
  thumbnail,
  className = '',
  alt = '',
  draggable = false,
}) {
  const primary = useMemo(
    () => getPrimaryArtworkDisplayUrl(videoId, thumbnail),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable artwork per videoId; ignore thumbnail updates from Firebase
    [videoId],
  )

  const chain = useMemo(
    () => youtubePosterFallbackChain(videoId, primary),
    [videoId, primary],
  )

  const [failIdx, setFailIdx] = useState(0)
  useEffect(() => {
    setFailIdx(0)
  }, [videoId])

  const src =
    chain.length > 0
      ? chain[Math.min(failIdx, chain.length - 1)]
      : ''

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      draggable={draggable}
      onError={() => {
        setFailIdx((i) => {
          const next = i + 1
          return next < chain.length ? next : i
        })
      }}
    />
  )
}
