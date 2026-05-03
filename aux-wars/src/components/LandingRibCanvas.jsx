import { useEffect, useRef } from 'react'

/**
 * Full-viewport animated “rib” contours + subtle mouse-reactive warp.
 * Runs continuously via requestAnimationFrame.
 */
export default function LandingRibCanvas() {
  const canvasRef = useRef(null)
  const mouseRef = useRef({ x: 0.5, y: 0.5 })
  const smoothRef = useRef({ x: 0.5, y: 0.5 })
  const rafRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return undefined

    const setPointer = (clientX, clientY) => {
      const w = window.innerWidth
      const h = window.innerHeight
      if (w <= 0 || h <= 0) return
      mouseRef.current = {
        x: Math.min(1, Math.max(0, clientX / w)),
        y: Math.min(1, Math.max(0, clientY / h)),
      }
    }

    const onMove = (e) => setPointer(e.clientX, e.clientY)
    const onLeave = () => {
      mouseRef.current = { x: 0.5, y: 0.5 }
    }
    const onTouch = (e) => {
      if (e.touches?.[0]) {
        setPointer(e.touches[0].clientX, e.touches[0].clientY)
      }
    }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = window.innerWidth
      const h = window.innerHeight
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('mousemove', onMove, { passive: true })
    window.addEventListener('mouseleave', onLeave)
    window.addEventListener('touchmove', onTouch, { passive: true })
    window.addEventListener('touchstart', onTouch, { passive: true })

    const draw = (now) => {
      const w = window.innerWidth
      const h = window.innerHeight
      const t = now * 0.001

      if (w < 4 || h < 4) {
        rafRef.current = requestAnimationFrame(draw)
        return
      }

      const mx = mouseRef.current.x
      const my = mouseRef.current.y
      smoothRef.current.x += (mx - smoothRef.current.x) * 0.06
      smoothRef.current.y += (my - smoothRef.current.y) * 0.06
      const mxi = smoothRef.current.x * w
      const myi = smoothRef.current.y * h

      ctx.clearRect(0, 0, w, h)

      const lineCount = Math.max(52, Math.ceil(h * 0.082))
      const stepX = Math.max(2, Math.floor(w / 280))

      for (let i = 0; i < lineCount; i += 1) {
        const yNorm = i / lineCount
        const yBase = yNorm * h * 1.35 - h * 0.12

        ctx.beginPath()
        let started = false

        for (let x = 0; x <= w; x += stepX) {
          let dy = 0
          dy +=
            Math.sin(x * 0.0038 + t * (0.35 + yNorm * 0.15) + i * 0.07) * (h * 0.028)
          dy +=
            Math.sin(x * 0.011 - t * 0.55 + i * 0.11 + yNorm * Math.PI * 2) * (h * 0.016)
          dy +=
            Math.sin(x * 0.0016 + yNorm * 6.2 + t * 0.22) * (h * 0.034)
          dy +=
            Math.sin(x * 0.0065 + t * 0.9 + i * 0.04) * (h * 0.009)

          const vy = yBase + dy
          const dxp = x - mxi
          const dyp = vy - myi
          const distN = Math.sqrt(dxp * dxp + dyp * dyp) / (Math.min(w, h) * 0.42 + 1)
          const falloff = Math.exp(-distN * distN * 1.35)
          const ang = Math.atan2(dyp, dxp + 0.001)
          const mouseLift =
            falloff *
            (Math.min(w, h) * 0.11) *
            (Math.sin(ang * 2.5 - t * 2.2 + x * 0.012) * 0.85 +
              Math.cos(ang - t * 1.4 + yNorm * Math.PI) * 0.35)

          dy += mouseLift

          const y = yBase + dy
          if (!started) {
            ctx.moveTo(x, y)
            started = true
          } else {
            ctx.lineTo(x, y)
          }
        }

        const alpha = 0.028 + (i % 4) * 0.01
        ctx.strokeStyle = `rgba(210, 220, 245, ${alpha})`
        ctx.lineWidth = 1
        ctx.stroke()
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseleave', onLeave)
      window.removeEventListener('touchmove', onTouch)
      window.removeEventListener('touchstart', onTouch)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 h-full w-full"
      aria-hidden
    />
  )
}
