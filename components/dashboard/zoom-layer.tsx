'use client'

import type { IRange, LogicalRange } from 'lightweight-charts'
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import type { ChartApi } from './drawing-layer'

export interface ZoomHandle {
  zoomOut: () => void
}

interface Viewport {
  logical: LogicalRange | null
  price: IRange<number> | null
  autoScale: boolean
}

const MIN_DRAG = 8

/** TradingView-style "Zoom In": drag a box over the chart and the view fits to it. */
export function ZoomLayer({
  api,
  active,
  handleRef,
  onZoomed,
  onDepthChange,
}: {
  api: ChartApi | null
  active: boolean
  handleRef?: RefObject<ZoomHandle | null>
  onZoomed: () => void
  onDepthChange: (depth: number) => void
}) {
  const history = useRef<Viewport[]>([])
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const depthCb = useRef(onDepthChange)
  depthCb.current = onDepthChange

  useEffect(() => {
    history.current = []
    depthCb.current(0)
    if (!api || !handleRef) return
    handleRef.current = {
      zoomOut: () => {
        const prev = history.current.pop()
        if (!prev) return
        const scale = api.candles.priceScale()
        if (prev.logical) api.chart.timeScale().setVisibleLogicalRange(prev.logical)
        if (prev.autoScale || !prev.price) scale.setAutoScale(true)
        else scale.setVisibleRange(prev.price)
        depthCb.current(history.current.length)
      },
    }
    return () => {
      handleRef.current = null
    }
  }, [api, handleRef])

  useEffect(() => {
    if (!active) setBox(null)
  }, [active])

  if (!api || !active) return null

  const local = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const width = api.chart.timeScale().width()
    const height = api.chart.panes()[0]?.getHeight() ?? rect.height
    return {
      x: Math.min(Math.max(e.clientX - rect.left, 0), width),
      y: Math.min(Math.max(e.clientY - rect.top, 0), height),
    }
  }

  const handleDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = local(e)
    setBox({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
  }

  const handleMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!box) return
    const p = local(e)
    setBox({ ...box, x1: p.x, y1: p.y })
  }

  const handleUp = () => {
    if (!box) return
    setBox(null)
    const left = Math.min(box.x0, box.x1)
    const right = Math.max(box.x0, box.x1)
    const top = Math.min(box.y0, box.y1)
    const bottom = Math.max(box.y0, box.y1)
    if (right - left < MIN_DRAG) return

    const ts = api.chart.timeScale()
    const from = ts.coordinateToLogical(left)
    const to = ts.coordinateToLogical(right)
    if (from === null || to === null) return

    const scale = api.candles.priceScale()
    history.current.push({
      logical: ts.getVisibleLogicalRange(),
      price: scale.getVisibleRange(),
      autoScale: scale.options().autoScale,
    })

    ts.setVisibleLogicalRange({ from, to })
    const hi = api.candles.coordinateToPrice(top)
    const lo = api.candles.coordinateToPrice(bottom)
    if (bottom - top >= MIN_DRAG && hi !== null && lo !== null) {
      scale.setAutoScale(false)
      scale.setVisibleRange({ from: lo, to: hi })
    }
    depthCb.current(history.current.length)
    onZoomed()
  }

  return (
    <div
      aria-label="Drag a box over the area to zoom into"
      className="absolute inset-0 z-30 cursor-crosshair touch-none"
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={() => setBox(null)}
    >
      {box ? (
        <div
          aria-hidden
          className="pointer-events-none absolute border border-dashed border-primary bg-primary/15"
          style={{
            left: Math.min(box.x0, box.x1),
            top: Math.min(box.y0, box.y1),
            width: Math.abs(box.x1 - box.x0),
            height: Math.abs(box.y1 - box.y0),
          }}
        />
      ) : null}
    </div>
  )
}
