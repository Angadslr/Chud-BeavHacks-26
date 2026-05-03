import { useEffect, useRef } from 'react'

/**
 * Vertical wavy / ribbon line field; reacts to pointer (normalized to pointerRef box).
 * `lineTone`: stroke color — `black` (lime/light pages), `white` (high contrast on dark),
 * `slate` (muted slate gray on navy).
 */
export default function WavySpiralGraphic({ pointerRef, sizeRef, lineTone = 'black' }) {
  const canvasRef = useRef(null)
  const mouseRef = useRef({ x: 0.5, y: 0.5 })
  const smoothRef = useRef({ x: 0.5, y: 0.5 })
  const rafRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const pointerEl = pointerRef?.current
    const sizeEl = sizeRef?.current

    const setPointer = (clientX, clientY) => {
      const el = pointerEl ?? sizeEl ?? canvas
      const rect = el.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) return
      mouseRef.current = {
        x: (clientX - rect.left) / rect.width,
        y: (clientY - rect.top) / rect.height,
      }
    }

    const onPointerMove = (e) => {
      setPointer(e.clientX, e.clientY)
    }

    const onPointerLeave = () => {
      mouseRef.current = { x: 0.5, y: 0.5 }
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    const leaveTarget = pointerEl ?? sizeEl ?? canvas
    leaveTarget.addEventListener('pointerleave', onPointerLeave)

    const resize = () => {
      const el = sizeEl ?? canvas.parentElement ?? canvas
      const rect = el.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = Math.max(1, Math.floor(rect.width))
      const h = Math.max(1, Math.floor(rect.height))
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    if (sizeEl) ro?.observe(sizeEl)
    else ro?.observe(canvas.parentElement ?? canvas)
    resize()

    const draw = (t) => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      const mx = mouseRef.current.x
      const my = mouseRef.current.y
      smoothRef.current.x += (mx - smoothRef.current.x) * 0.07
      smoothRef.current.y += (my - smoothRef.current.y) * 0.07
      const sx = smoothRef.current.x
      const sy = smoothRef.current.y

      ctx.clearRect(0, 0, w, h)

      const time = t * 0.001
      const numLines = Math.round(48 + (w / 800) * 28)
      const marginX = w * 0.05
      const span = w - marginX * 2

      ctx.lineCap = 'round'

      for (let i = 0; i < numLines; i += 1) {
        const u = numLines > 1 ? i / (numLines - 1) : 0.5
        const baseX = marginX + u * span
        ctx.lineWidth = 0.75 + u * 0.45

        if (lineTone === 'slate') {
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.95)'
          ctx.globalAlpha = 0.16 + u * 0.4
        } else if (lineTone === 'white') {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)'
          ctx.globalAlpha = 0.22 + u * 0.38
        } else {
          ctx.strokeStyle = '#000'
          ctx.globalAlpha = 0.5 + u * 0.45
        }

        ctx.beginPath()
        let first = true
        const step = Math.max(3, Math.floor(h / 85))
        for (let y = 0; y <= h; y += step) {
          const ny = y / h
          const spiral =
            Math.sin(y * 0.014 + time * 0.38 + i * 0.17) * (18 + sy * 42) +
            Math.cos(y * 0.009 - time * 0.32 + i * 0.11) * (12 + sx * 28)
          const ribbon =
            Math.sin(ny * Math.PI * 1.2 + i * 0.06 + time * 0.22) * (w * 0.024)
          const pullX = (sx - 0.5) * w * 0.42 * Math.sin(ny * Math.PI)
          const pullY = (sy - 0.5) * h * 0.2 * Math.sin(ny * Math.PI * 0.62)
          const x = baseX + spiral + ribbon + pullX + pullY * 0.38

          if (first) {
            ctx.moveTo(x, y)
            first = false
          } else {
            ctx.lineTo(x, y)
          }
        }
        ctx.stroke()
      }

      ctx.globalAlpha = 1
      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('pointermove', onPointerMove)
      leaveTarget.removeEventListener('pointerleave', onPointerLeave)
      ro?.disconnect()
    }
  }, [pointerRef, sizeRef, lineTone])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    />
  )
}
