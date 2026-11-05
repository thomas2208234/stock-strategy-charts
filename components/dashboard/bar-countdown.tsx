'use client'

import { useEffect, useReducer } from 'react'
import type { ChartApi } from './drawing-layer'
import { useNow } from './use-now'

function formatRemaining(sec: number) {
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  if (d > 0) return `${d}d ${pad(h)}h`
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`
  return `${pad(m)}:${pad(s)}`
}

/** TradingView-style "time until bar close" tag pinned under the last-price label on the price axis. */
export function BarCountdown({
  api,
  value,
  barTime,
  intervalSec,
  color,
}: {
  api: ChartApi
  value: number
  barTime: number
  intervalSec: number
  color: string
}) {
  const now = useNow(1000)
  const [, rerender] = useReducer((n: number) => n + 1, 0)

  useEffect(() => {
    const ts = api.chart.timeScale()
    ts.subscribeVisibleLogicalRangeChange(rerender)
    api.chart.subscribeCrosshairMove(rerender)
    return () => {
      ts.unsubscribeVisibleLogicalRangeChange(rerender)
      api.chart.unsubscribeCrosshairMove(rerender)
    }
  }, [api])

  const remaining = barTime + intervalSec - now / 1000
  if (remaining <= 0 || remaining > intervalSec) return null

  const y = api.candles.priceToCoordinate(value)
  const paneHeight = api.chart.panes()[0]?.getHeight() ?? 0
  const width = api.chart.priceScale('right').width()
  if (y === null || y < 0 || y > paneHeight - 24 || width === 0) return null

  return (
    <div
      aria-label={`Time until bar close: ${formatRemaining(remaining)}`}
      className="pointer-events-none absolute right-0 z-10 flex items-center justify-center font-chart text-[11px] leading-none text-primary-foreground tabular-nums"
      style={{ top: y + 9, width, height: 15, backgroundColor: color }}
    >
      {formatRemaining(remaining)}
    </div>
  )
}
