'use client'

import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  TickMarkType,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Series } from '@/lib/indicators'
import { formatPrice } from '@/lib/freshness'
import { runStrategy, type StrategyConfig, type StrategyOutput } from '@/lib/strategy'
import { CHART_COLORS as C } from '@/lib/theme'
import type { Bar, Interval } from '@/lib/types'
import type { ChartSettings } from './dashboard-context'

interface Refs {
  chart: IChartApi
  candles: ISeriesApi<'Candlestick'>
  volume?: ISeriesApi<'Histogram'>
  maFast?: ISeriesApi<'Line'>
  maSlow?: ISeriesApi<'Line'>
  vwap?: ISeriesApi<'Line'>
  rsi?: ISeriesApi<'Line'>
  macdLine?: ISeriesApi<'Line'>
  macdSignal?: ISeriesApi<'Line'>
  macdHist?: ISeriesApi<'Histogram'>
  markers: ISeriesMarkersPluginApi<Time>
  priceLines: IPriceLine[]
}

const ts = (t: number) => t as UTCTimestamp

function line(bars: Bar[], values: Series | undefined) {
  if (!values) return []
  const out: { time: UTCTimestamp; value: number }[] = []
  for (let i = 0; i < bars.length; i++) {
    const v = values[i]
    if (v !== undefined) out.push({ time: ts(bars[i].time), value: v })
  }
  return out
}

function localTickFormatter(time: Time, type: TickMarkType) {
  const d = new Date((time as number) * 1000)
  switch (type) {
    case TickMarkType.Year:
      return String(d.getFullYear())
    case TickMarkType.Month:
      return d.toLocaleDateString(undefined, { month: 'short' })
    case TickMarkType.DayOfMonth:
      return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    default:
      return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }
}

function applyData(refs: Refs, bars: Bar[], out: StrategyOutput, cfg: StrategyConfig) {
  refs.candles.setData(
    bars.map((b) => ({ time: ts(b.time), open: b.open, high: b.high, low: b.low, close: b.close })),
  )
  refs.volume?.setData(
    bars
      .filter((b) => b.volume !== undefined)
      .map((b) => ({ time: ts(b.time), value: b.volume ?? 0, color: b.close >= b.open ? `${C.up}55` : `${C.down}55` })),
  )
  refs.maFast?.setData(line(bars, out.maFast))
  refs.maSlow?.setData(line(bars, out.maSlow))
  refs.vwap?.setData(line(bars, out.vwap))
  refs.rsi?.setData(line(bars, out.rsi))
  refs.macdLine?.setData(line(bars, out.macd?.line))
  refs.macdSignal?.setData(line(bars, out.macd?.signal))
  if (refs.macdHist && out.macd) {
    const hist = out.macd.hist
    refs.macdHist.setData(
      bars.flatMap((b, i) => {
        const v = hist[i]
        return v === undefined ? [] : [{ time: ts(b.time), value: v, color: v >= 0 ? `${C.up}99` : `${C.down}99` }]
      }),
    )
  }

  for (const pl of refs.priceLines) refs.candles.removePriceLine(pl)
  refs.priceLines = []
  for (const lvl of out.levels) {
    refs.priceLines.push(
      refs.candles.createPriceLine({
        price: lvl.price,
        color: lvl.kind === 'support' ? C.up : C.down,
        lineWidth: 1,
        lineStyle: lvl.source === 'manual' ? LineStyle.Solid : LineStyle.Dotted,
        axisLabelVisible: true,
        title: lvl.source === 'manual' ? 'Level' : lvl.kind === 'support' ? 'S' : 'R',
      }),
    )
  }
  if (cfg.showSignals && out.open) {
    const add = (price: number | undefined, color: string, title: string) => {
      if (price === undefined) return
      refs.priceLines.push(
        refs.candles.createPriceLine({ price, color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title }),
      )
    }
    add(out.open.entry, C.primary, 'Entry')
    add(out.open.stop, C.down, 'Stop')
    add(out.open.target, C.up, 'Target')
  }

  const markers: SeriesMarker<Time>[] = cfg.showSignals
    ? out.signals.map((s) =>
        s.kind === 'entry'
          ? { time: ts(s.time), position: 'belowBar', shape: 'arrowUp', color: C.primary, text: 'Buy' }
          : {
              time: ts(s.time),
              position: 'aboveBar',
              shape: 'arrowDown',
              color: s.kind === 'target' ? C.up : s.kind === 'stop' ? C.down : C.accent,
              text: s.kind === 'target' ? 'TP' : s.kind === 'stop' ? 'SL' : 'Exit',
            },
      )
    : []
  refs.markers.setMarkers(markers)
}

export function PriceChart({
  bars,
  interval,
  strategy,
  settings,
}: {
  bars: Bar[]
  interval: Interval
  strategy: StrategyConfig
  settings: ChartSettings
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const refs = useRef<Refs | null>(null)
  const intraday = interval !== '1day'
  const output = useMemo(() => runStrategy(bars, strategy, intraday), [bars, strategy, intraday])
  const latest = useRef({ bars, output, strategy })
  latest.current = { bars, output, strategy }
  const [hover, setHover] = useState<Bar | null>(null)

  const structureKey = [
    strategy.ma.enabled,
    strategy.vwap.enabled && intraday,
    strategy.rsi.enabled,
    strategy.rsi.overbought,
    strategy.rsi.oversold,
    strategy.macd.enabled,
    settings.showVolume,
    settings.showGrid,
    settings.magnetCrosshair,
    settings.localTime,
    intraday,
  ].join('|')

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: C.background },
        textColor: C.text,
        fontFamily: 'var(--font-geist-sans), system-ui, sans-serif',
        fontSize: 11,
        attributionLogo: false,
        panes: { separatorColor: C.border, separatorHoverColor: C.border, enableResize: true },
      },
      grid: {
        vertLines: { color: C.grid, visible: settings.showGrid },
        horzLines: { color: C.grid, visible: settings.showGrid },
      },
      crosshair: { mode: settings.magnetCrosshair ? CrosshairMode.Magnet : CrosshairMode.Normal },
      rightPriceScale: { borderColor: C.border },
      timeScale: {
        borderColor: C.border,
        timeVisible: intraday,
        secondsVisible: false,
        tickMarkFormatter: settings.localTime ? localTickFormatter : undefined,
      },
      localization: settings.localTime
        ? {
            timeFormatter: (t: Time) =>
              new Date((t as number) * 1000).toLocaleString(undefined, {
                dateStyle: 'medium',
                ...(intraday ? { timeStyle: 'short' as const } : {}),
              }),
          }
        : undefined,
    })

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: C.up,
      downColor: C.down,
      wickUpColor: C.up,
      wickDownColor: C.down,
      borderVisible: false,
    })

    const r: Refs = { chart, candles, markers: createSeriesMarkers(candles, []), priceLines: [] }

    if (settings.showVolume) {
      r.volume = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false })
      r.volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
    }
    const overlay = { lineWidth: 1 as const, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }
    if (strategy.ma.enabled) {
      r.maFast = chart.addSeries(LineSeries, { ...overlay, color: C.accent })
      r.maSlow = chart.addSeries(LineSeries, { ...overlay, color: C.primary })
    }
    if (strategy.vwap.enabled && intraday) {
      r.vwap = chart.addSeries(LineSeries, { ...overlay, color: C.foreground, lineStyle: LineStyle.Dashed })
    }

    let pane = 1
    if (strategy.rsi.enabled) {
      r.rsi = chart.addSeries(LineSeries, { lineWidth: 1, color: C.accent, priceLineVisible: false }, pane)
      r.rsi.createPriceLine({ price: strategy.rsi.overbought, color: C.muted, lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false, title: '' })
      r.rsi.createPriceLine({ price: strategy.rsi.oversold, color: C.muted, lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false, title: '' })
      pane++
    }
    if (strategy.macd.enabled) {
      r.macdHist = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, pane)
      r.macdLine = chart.addSeries(LineSeries, { lineWidth: 1, color: C.primary, priceLineVisible: false }, pane)
      r.macdSignal = chart.addSeries(LineSeries, { lineWidth: 1, color: C.accent, priceLineVisible: false, lastValueVisible: false }, pane)
      pane++
    }
    const panes = chart.panes()
    for (let i = 1; i < panes.length; i++) panes[i].setHeight(80)

    chart.subscribeCrosshairMove((param) => {
      if (!param.time) {
        setHover(null)
        return
      }
      const t = param.time as number
      setHover(latest.current.bars.find((b) => b.time === t) ?? null)
    })

    refs.current = r
    applyData(r, latest.current.bars, latest.current.output, latest.current.strategy)
    chart.timeScale().scrollToRealTime()

    return () => {
      refs.current = null
      chart.remove()
    }
    // structureKey captures every option that requires rebuilding the chart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureKey])

  useEffect(() => {
    if (refs.current) applyData(refs.current, bars, output, strategy)
  }, [bars, output, strategy])

  const shown = hover ?? bars[bars.length - 1]
  const lastIdx = hover ? bars.indexOf(hover) : bars.length - 1
  const legendValue = (s?: Series) => (s && s[lastIdx] !== undefined ? formatPrice(s[lastIdx] as number) : '—')

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" />
      {shown ? (
        <div className="pointer-events-none absolute left-2 top-1.5 z-10 flex flex-col gap-0.5 font-mono text-[11px] leading-snug">
          <div className="flex flex-wrap gap-x-2 text-muted-foreground">
            <span>
              O <span className={shown.close >= shown.open ? 'text-up' : 'text-down'}>{formatPrice(shown.open)}</span>
            </span>
            <span>
              H <span className={shown.close >= shown.open ? 'text-up' : 'text-down'}>{formatPrice(shown.high)}</span>
            </span>
            <span>
              L <span className={shown.close >= shown.open ? 'text-up' : 'text-down'}>{formatPrice(shown.low)}</span>
            </span>
            <span>
              C <span className={shown.close >= shown.open ? 'text-up' : 'text-down'}>{formatPrice(shown.close)}</span>
            </span>
          </div>
          <div className="flex flex-wrap gap-x-2">
            {output.maFast ? (
              <span className="text-warning">
                {strategy.ma.type} {strategy.ma.fast} {legendValue(output.maFast)}
              </span>
            ) : null}
            {output.maSlow ? (
              <span className="text-primary">
                {strategy.ma.type} {strategy.ma.slow} {legendValue(output.maSlow)}
              </span>
            ) : null}
            {output.vwap ? <span className="text-foreground">VWAP {legendValue(output.vwap)}</span> : null}
            {strategy.vwap.enabled && !intraday ? <span className="text-muted-foreground">VWAP n/a on daily</span> : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
