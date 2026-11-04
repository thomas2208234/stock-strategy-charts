'use client'

import type { IChartApi, ISeriesApi, Logical } from 'lightweight-charts'
import { useEffect, useReducer, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { formatPrice } from '@/lib/freshness'
import { CHART_COLORS as C } from '@/lib/theme'
import type { Bar } from '@/lib/types'

export interface ChartPoint {
  time: number
  price: number
}

export type Drawing =
  | { id: string; kind: 'trend'; a: ChartPoint; b: ChartPoint }
  | { id: string; kind: 'hline'; price: number }

export type DrawTool = 'none' | 'trend' | 'hline'

export interface ChartApi {
  chart: IChartApi
  candles: ISeriesApi<'Candlestick'>
}

/** Converts a timestamp to a fractional bar index so drawings can extend past the last candle. */
function timeToLogical(bars: Bar[], t: number) {
  const n = bars.length
  if (n < 2) return 0
  if (t <= bars[0].time) return (t - bars[0].time) / (bars[1].time - bars[0].time)
  if (t >= bars[n - 1].time) return n - 1 + (t - bars[n - 1].time) / (bars[n - 1].time - bars[n - 2].time)
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (bars[mid].time <= t) lo = mid
    else hi = mid
  }
  return lo + (t - bars[lo].time) / (bars[hi].time - bars[lo].time)
}

function logicalToTime(bars: Bar[], l: number) {
  const n = bars.length
  if (n === 0) return 0
  if (n === 1) return bars[0].time
  if (l <= 0) return bars[0].time + l * (bars[1].time - bars[0].time)
  if (l >= n - 1) return bars[n - 1].time + (l - (n - 1)) * (bars[n - 1].time - bars[n - 2].time)
  const i = Math.floor(l)
  return bars[i].time + (l - i) * (bars[i + 1].time - bars[i].time)
}

export function DrawingLayer({
  api,
  bars,
  drawings,
  tool,
  selectedId,
  onAdd,
  onSelect,
}: {
  api: ChartApi | null
  bars: Bar[]
  drawings: Drawing[]
  tool: DrawTool
  selectedId: string | null
  onAdd: (d: Drawing) => void
  onSelect: (id: string | null) => void
}) {
  const [, rerender] = useReducer((x: number) => x + 1, 0)
  const signature = useRef('')
  const [draft, setDraft] = useState<{ a: ChartPoint; b: ChartPoint } | null>(null)

  // The chart has no single "viewport changed" event (price scale drags fire nothing),
  // so poll a cheap signature each frame and re-render only when it changes.
  useEffect(() => {
    if (!api) return
    let raf = 0
    const tick = () => {
      const ts = api.chart.timeScale()
      const range = ts.getVisibleLogicalRange()
      const sig = [
        range?.from,
        range?.to,
        ts.width(),
        api.chart.panes()[0]?.getHeight(),
        api.candles.coordinateToPrice(0),
        api.candles.coordinateToPrice(100),
      ].join('|')
      if (sig !== signature.current) {
        signature.current = sig
        rerender()
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [api])

  if (!api || bars.length === 0) return null

  const ts = api.chart.timeScale()
  const width = ts.width()
  const height = api.chart.panes()[0]?.getHeight() ?? 0
  if (width <= 0 || height <= 0) return null

  const toXY = (p: ChartPoint) => {
    const x = ts.logicalToCoordinate(timeToLogical(bars, p.time) as Logical)
    const y = api.candles.priceToCoordinate(p.price)
    return x === null || y === null ? null : { x, y }
  }

  const fromEvent = (e: ReactPointerEvent<SVGSVGElement>): ChartPoint | null => {
    const rect = e.currentTarget.getBoundingClientRect()
    const l = ts.coordinateToLogical(e.clientX - rect.left)
    const price = api.candles.coordinateToPrice(e.clientY - rect.top)
    if (l === null || price === null) return null
    return { time: logicalToTime(bars, l), price }
  }

  const drawing = tool !== 'none'

  const handleDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!drawing) return
    e.stopPropagation()
    const p = fromEvent(e)
    if (!p) return
    if (tool === 'hline') {
      onAdd({ id: crypto.randomUUID(), kind: 'hline', price: p.price })
      return
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    setDraft({ a: p, b: p })
  }

  const handleMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!draft) return
    const p = fromEvent(e)
    if (p) setDraft({ a: draft.a, b: p })
  }

  const handleUp = () => {
    if (!draft) return
    const a = toXY(draft.a)
    const b = toXY(draft.b)
    if (a && b && Math.hypot(a.x - b.x, a.y - b.y) > 6) {
      onAdd({ id: crypto.randomUUID(), kind: 'trend', a: draft.a, b: draft.b })
    }
    setDraft(null)
  }

  const items: (Drawing | { id: 'draft'; kind: 'trend'; a: ChartPoint; b: ChartPoint })[] = draft
    ? [...drawings, { id: 'draft', kind: 'trend', ...draft }]
    : drawings

  return (
    <svg
      width={width}
      height={height}
      className={drawing ? 'absolute left-0 top-0 z-20 cursor-crosshair touch-none' : 'pointer-events-none absolute left-0 top-0 z-20'}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={() => setDraft(null)}
      aria-label={drawing ? (tool === 'trend' ? 'Drag to draw a trend line' : 'Click to place a horizontal line') : undefined}
    >
      {items.map((d) => {
        const selected = d.id === selectedId
        const color = selected ? C.primary : C.accent
        const select = (e: ReactPointerEvent) => {
          if (drawing || d.id === 'draft') return
          e.stopPropagation()
          onSelect(d.id)
        }

        if (d.kind === 'hline') {
          const y = api.candles.priceToCoordinate(d.price)
          if (y === null) return null
          return (
            <g key={d.id}>
              <line x1={0} x2={width} y1={y} y2={y} stroke={color} strokeWidth={selected ? 2 : 1.5} />
              <line
                x1={0}
                x2={width}
                y1={y}
                y2={y}
                stroke="transparent"
                strokeWidth={12}
                className={drawing ? undefined : 'pointer-events-auto cursor-pointer'}
                onPointerDown={select}
              />
              <rect x={width - 64} y={y - 9} width={60} height={18} rx={3} fill={color} />
              <text
                x={width - 34}
                y={y + 4}
                textAnchor="middle"
                fontSize={11}
                fontFamily="var(--font-geist-mono), monospace"
                fill={C.background}
              >
                {formatPrice(d.price)}
              </text>
            </g>
          )
        }

        const a = toXY(d.a)
        const b = toXY(d.b)
        if (!a || !b) return null
        const isDraft = d.id === 'draft'
        return (
          <g key={d.id}>
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={color}
              strokeWidth={selected ? 2.5 : 2}
              strokeLinecap="round"
              strokeDasharray={isDraft ? '6 4' : undefined}
            />
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="transparent"
              strokeWidth={14}
              className={drawing || isDraft ? undefined : 'pointer-events-auto cursor-pointer'}
              onPointerDown={select}
            />
            {selected || isDraft ? (
              <>
                <circle cx={a.x} cy={a.y} r={4} fill={C.background} stroke={color} strokeWidth={2} />
                <circle cx={b.x} cy={b.y} r={4} fill={C.background} stroke={color} strokeWidth={2} />
              </>
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}
