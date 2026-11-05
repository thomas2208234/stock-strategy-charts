'use client'

import { ChevronsRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { CHART_COLORS as C } from '@/lib/theme'
import type { Bar } from '@/lib/types'
import type { ChartApi } from './drawing-layer'

function formatCountdown(sec: number) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

/** TradingView-style "time until bar close" tag that sits under the last-price label on the price axis. */
export function BarCountdown({ api, last, intervalSec }: { api: ChartApi | null; last: Bar | undefined; intervalSec: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = ref.current
    const text = textRef.current
    if (!api || !last || !el || !text) return
    let frame = 0
    const tick = () => {
      frame = requestAnimationFrame(tick)
      const remaining = Math.ceil(last.time + intervalSec - Date.now() / 1000)
      const y = api.candles.priceToCoordinate(last.close)
      const width = api.chart.priceScale('right').width()
      const paneHeight = api.chart.panes()[0]?.getHeight() ?? 0
      if (remaining <= 0 || remaining > intervalSec || y === null || y < 0 || y > paneHeight - 18 || width === 0) {
        el.style.visibility = 'hidden'
        return
      }
      el.style.visibility = 'visible'
      el.style.minWidth = `${width}px`
      el.style.transform = `translateY(${Math.round(y + 9)}px)`
      const label = formatCountdown(remaining)
      if (text.textContent !== label) text.textContent = label
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [api, last, intervalSec])

  const color = last && last.close < last.open ? C.down : C.up
  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute right-0 top-0 z-10 flex h-4 items-center whitespace-nowrap px-1.5 font-mono text-[11px] leading-none tabular-nums text-primary-foreground"
      style={{ backgroundColor: color, visibility: 'hidden' }}
    >
      <span ref={textRef} />
    </div>
  )
}

/** Appears when the user has scrolled away from the latest candle, like TradingView's "scroll to realtime" button. */
export function ScrollToLatest({ api, barCount }: { api: ChartApi | null; barCount: number }) {
  const [away, setAway] = useState(false)

  useEffect(() => {
    if (!api) return
    const ts = api.chart.timeScale()
    const onRange = () => {
      const range = ts.getVisibleLogicalRange()
      setAway(range ? range.to < barCount - 2 : false)
    }
    ts.subscribeVisibleLogicalRangeChange(onRange)
    onRange()
    return () => ts.unsubscribeVisibleLogicalRangeChange(onRange)
  }, [api, barCount])

  if (!api || !away) return null
  const right = api.chart.priceScale('right').width() + 8
  const bottom = api.chart.timeScale().height() + 8
  return (
    <button
      type="button"
      aria-label="Scroll to the latest bar"
      title="Scroll to the latest bar"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => api.chart.timeScale().scrollToRealTime()}
      className="absolute z-20 flex size-7 items-center justify-center rounded border border-border bg-panel text-foreground shadow-md transition-colors hover:bg-border"
      style={{ right, bottom }}
    >
      <ChevronsRight className="size-4" aria-hidden />
    </button>
  )
}
