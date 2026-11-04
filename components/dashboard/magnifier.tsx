'use client'

import type { IChartApi } from 'lightweight-charts'
import { useEffect, useRef, useState } from 'react'
import { CHART_COLORS as C } from '@/lib/theme'

const LENS = 180

export function Magnifier({ chart, host, zoom }: { chart: IChartApi; host: HTMLElement | null; zoom: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom

  useEffect(() => {
    if (!host) return
    let raf = 0
    let point: { x: number; y: number } | null = null

    const draw = () => {
      raf = 0
      const canvas = canvasRef.current
      if (!point || !canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const shot = chart.takeScreenshot(true, false)
      const ratio = shot.width / Math.max(1, host.clientWidth)
      const dpr = window.devicePixelRatio || 1
      const size = Math.round(LENS * dpr)
      if (canvas.width !== size) {
        canvas.width = size
        canvas.height = size
      }
      const src = (LENS / zoomRef.current) * ratio
      ctx.fillStyle = C.background
      ctx.fillRect(0, 0, size, size)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(shot, point.x * ratio - src / 2, point.y * ratio - src / 2, src, src, 0, 0, size, size)

      const mid = size / 2
      const gap = 6 * dpr
      ctx.strokeStyle = C.muted
      ctx.lineWidth = dpr
      ctx.beginPath()
      ctx.moveTo(0, mid)
      ctx.lineTo(mid - gap, mid)
      ctx.moveTo(mid + gap, mid)
      ctx.lineTo(size, mid)
      ctx.moveTo(mid, 0)
      ctx.lineTo(mid, mid - gap)
      ctx.moveTo(mid, mid + gap)
      ctx.lineTo(mid, size)
      ctx.stroke()
    }

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(draw)
    }

    const onMove = (e: PointerEvent) => {
      const rect = host.getBoundingClientRect()
      point = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      setPos(point)
      schedule()
    }
    const onLeave = () => {
      point = null
      setPos(null)
    }
    const onWheel = () => schedule()

    host.addEventListener('pointermove', onMove)
    host.addEventListener('pointerleave', onLeave)
    host.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      if (raf) cancelAnimationFrame(raf)
      host.removeEventListener('pointermove', onMove)
      host.removeEventListener('pointerleave', onLeave)
      host.removeEventListener('wheel', onWheel)
    }
  }, [chart, host])

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-20 overflow-hidden rounded-full border-2 border-primary bg-background shadow-lg"
      style={{
        width: LENS,
        height: LENS,
        left: (pos?.x ?? 0) - LENS / 2,
        top: (pos?.y ?? 0) - LENS / 2,
        visibility: pos ? 'visible' : 'hidden',
      }}
    >
      <canvas ref={canvasRef} className="size-full" />
      <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded bg-background/80 px-1.5 font-mono text-[10px] text-foreground">
        {zoom}×
      </span>
    </div>
  )
}
