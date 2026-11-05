'use client'

import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  PriceScaleMode,
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
import { useEffect, useRef, useState, type RefObject } from 'react'
import type { Series } from '@/lib/indicators'
import { formatPrice } from '@/lib/freshness'
import type { StrategyConfig, StrategyOutput } from '@/lib/strategy'
import { CHART_COLORS as C } from '@/lib/theme'
import { intervalSeconds, type Bar, type Interval } from '@/lib/types'
import { BarCountdown, ScrollToLatest } from './chart-overlays'
import type { ChartSettings } from './dashboard-context'
import { DrawingLayer, type ChartApi, type Drawing, type DrawTool } from './drawing-layer'
import { ZoomLayer, type ZoomHandle } from './zoom-layer'

interface Refs {
  chart: IChartApi
  candles: ISeriesApi<'Candlestick'>
  volume?: ISeriesApi<'Histogram'>
  vwap?: ISeriesApi<'Line'>
  macdLine?: ISeriesApi<'Line'>
  macdSignal?: ISeriesApi<'Line'>
  macdHist?: ISeriesApi<'Histogram'>
  markers: ISeriesMarkersPluginApi<Time>
  priceLines: IPriceLine[]
}

const ts = (t: number) => t as UTCTimestamp

export type ScaleMode = 'normal' | 'log' | 'percent'

export interface ScaleHandle {
  resetAutoScale: () => void
}

const SCALE_MODE: Record<ScaleMode, PriceScaleMode> = {
  normal: PriceScaleMode.Normal,
  log: PriceScaleMode.Logarithmic,
  percent: PriceScaleMode.Percentage,
}

const LEGEND_INTERVAL: Record<Interval, string> = {
  '1min': '1',
  '5min': '5',
  '15min': '15',
  '30min': '30',
  '1h': '1h',
  '4h': '4h',
  '1day': '1D',
}

const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 2 })

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
      .map((b) => ({ time: ts(b.time), value: b.volume ?? 0, color: b.close >= b.open ? `${C.up}80` : `${C.down}80` })),
  )
  refs.vwap?.setData(line(bars, out.vwap))
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
    add(out.open.entry, C.primary, out.open.side === 'short' ? 'Short entry' : 'Entry')
    add(out.open.stop, C.down, 'Stop')
    add(out.open.target, C.up, 'Target')
  }

  const markers: SeriesMarker<Time>[] = cfg.showSignals
    ? out.signals.map((s) => {
        // Buying (long entry, short cover) points up from below; selling points down from above.
        const buying = (s.kind === 'entry') === (s.side === 'long')
        const placement = buying
          ? ({ position: 'belowBar', shape: 'arrowUp' } as const)
          : ({ position: 'aboveBar', shape: 'arrowDown' } as const)
        if (s.kind === 'entry') {
          return { time: ts(s.time), ...placement, color: C.primary, text: s.side === 'long' ? 'Buy' : 'Short' }
        }
        return {
          time: ts(s.time),
          ...placement,
          color: s.kind === 'target' ? C.up : s.kind === 'stop' ? C.down : C.accent,
          text: s.kind === 'target' ? 'TP' : s.kind === 'stop' ? 'SL' : s.side === 'long' ? 'Exit' : 'Cover',
        }
      })
    : []
  refs.markers.setMarkers(markers)
}

export function PriceChart({
  bars,
  output,
  interval,
  strategy,
  settings,
  drawings,
  tool,
  selectedDrawing,
  onAddDrawing,
  onSelectDrawing,
  zoomMode = false,
  zoomRef,
  onZoomed,
  onZoomDepthChange,
  symbol,
  exchange,
  scaleMode = 'normal',
  scaleRef,
  onAutoScaleChange,
}: {
  symbol: string
  exchange?: string
  scaleMode?: ScaleMode
  scaleRef?: RefObject<ScaleHandle | null>
  onAutoScaleChange?: (auto: boolean) => void
  zoomMode?: boolean
  zoomRef?: RefObject<ZoomHandle | null>
  onZoomed: () => void
  onZoomDepthChange: (depth: number) => void
  bars: Bar[]
  output: StrategyOutput
  interval: Interval
  strategy: StrategyConfig
  settings: ChartSettings
  drawings: Drawing[]
  tool: DrawTool
  selectedDrawing: string | null
  onAddDrawing: (d: Drawing) => void
  onSelectDrawing: (id: string | null) => void
}) {
  const [api, setApi] = useState<ChartApi | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const refs = useRef<Refs | null>(null)
  const intraday = interval !== '1day'
  const latest = useRef({ bars, output, strategy })
  latest.current = { bars, output, strategy }
  const [hover, setHover] = useState<Bar | null>(null)

  const structureKey = [
    strategy.vwap.enabled && intraday,
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
        fontFamily: '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif',
        fontSize: 11,
        attributionLogo: false,
        panes: { separatorColor: C.border, separatorHoverColor: 'rgba(41, 98, 255, 0.4)', enableResize: true },
      },
      grid: {
        vertLines: { color: C.grid, visible: settings.showGrid },
        horzLines: { color: C.grid, visible: settings.showGrid },
      },
      crosshair: {
        mode: settings.magnetCrosshair ? CrosshairMode.Magnet : CrosshairMode.Normal,
        vertLine: { color: C.crosshair, width: 1, style: LineStyle.LargeDashed, labelBackgroundColor: C.crosshairLabel },
        horzLine: { color: C.crosshair, width: 1, style: LineStyle.LargeDashed, labelBackgroundColor: C.crosshairLabel },
      },
      rightPriceScale: {
        borderColor: C.border,
        mode: SCALE_MODE[scaleMode],
        scaleMargins: settings.showVolume ? { top: 0.1, bottom: 0.22 } : { top: 0.1, bottom: 0.08 },
      },
      kineticScroll: { mouse: true, touch: true },
      timeScale: {
        borderColor: C.border,
        timeVisible: intraday,
        secondsVisible: false,
        rightOffset: 10,
        barSpacing: 7,
        minBarSpacing: 0.5,
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
      borderUpColor: C.up,
      borderDownColor: C.down,
      borderVisible: true,
      priceLineStyle: LineStyle.Dotted,
    })

    const r: Refs = { chart, candles, markers: createSeriesMarkers(candles, []), priceLines: [] }

    if (settings.showVolume) {
      r.volume = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false })
      r.volume.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })
    }
    const overlay = { lineWidth: 1 as const, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }
    if (strategy.vwap.enabled && intraday) {
      r.vwap = chart.addSeries(LineSeries, { ...overlay, color: C.foreground, lineStyle: LineStyle.Dashed })
    }

    let pane = 1
    if (strategy.macd.enabled) {
      r.macdHist = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, pane)
      r.macdLine = chart.addSeries(LineSeries, { lineWidth: 1, color: C.primary, priceLineVisible: false, title: 'MACD' }, pane)
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
    setApi({ chart, candles })

    return () => {
      setApi(null)
      refs.current = null
      chart.remove()
    }
    // structureKey captures every option that requires rebuilding the chart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureKey])

  useEffect(() => {
    if (refs.current) applyData(refs.current, bars, output, strategy)
  }, [bars, output, strategy])

  useEffect(() => {
    api?.chart.priceScale('right').applyOptions({ mode: SCALE_MODE[scaleMode] })
  }, [api, scaleMode])

  useEffect(() => {
    if (!scaleRef) return
    scaleRef.current = {
      resetAutoScale: () => {
        api?.chart.priceScale('right').applyOptions({ autoScale: true })
        onAutoScaleChange?.(true)
      },
    }
    return () => {
      scaleRef.current = null
    }
  }, [api, scaleRef, onAutoScaleChange])

  const syncAutoScale = () => {
    if (!api || !onAutoScaleChange) return
    requestAnimationFrame(() => onAutoScaleChange(api.chart.priceScale('right').options().autoScale))
  }

  const shown = hover ?? bars[bars.length - 1]
  const lastIdx = hover ? bars.indexOf(hover) : bars.length - 1
  const prevBar = lastIdx > 0 ? bars[lastIdx - 1] : undefined
  const legendValue = (s?: Series) => (s && s[lastIdx] !== undefined ? formatPrice(s[lastIdx] as number) : '—')
  const barUp = shown ? shown.close >= shown.open : true
  const tone = barUp ? 'text-up' : 'text-down'
  const delta = shown && prevBar ? shown.close - prevBar.close : undefined
  const deltaPct = delta !== undefined && prevBar ? (delta / prevBar.close) * 100 : undefined

  return (
    <div
      className="relative h-full w-full"
      onPointerDown={() => onSelectDrawing(null)}
      onPointerUp={syncAutoScale}
      onWheel={syncAutoScale}
    >
      <div ref={containerRef} className="absolute inset-0" />
      <BarCountdown api={api} last={bars[bars.length - 1]} intervalSec={intervalSeconds(interval)} />
      <ScrollToLatest api={api} barCount={bars.length} />
      <ZoomLayer api={api} active={zoomMode} handleRef={zoomRef} onZoomed={onZoomed} onDepthChange={onZoomDepthChange} />
      <DrawingLayer
        api={api}
        bars={bars}
        drawings={drawings}
        tool={tool}
        selectedId={selectedDrawing}
        onAdd={onAddDrawing}
        onSelect={onSelectDrawing}
      />
      {shown ? (
        <div className="pointer-events-none absolute left-2 top-1.5 z-10 flex flex-col gap-1 text-[13px] leading-snug tabular-nums">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium text-foreground">
              {symbol} · {LEGEND_INTERVAL[interval]}
              {exchange ? ` · ${exchange}` : ''}
            </span>
            <span className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
              <span>
                O<span className={`ml-0.5 ${tone}`}>{formatPrice(shown.open)}</span>
              </span>
              <span>
                H<span className={`ml-0.5 ${tone}`}>{formatPrice(shown.high)}</span>
              </span>
              <span>
                L<span className={`ml-0.5 ${tone}`}>{formatPrice(shown.low)}</span>
              </span>
              <span>
                C<span className={`ml-0.5 ${tone}`}>{formatPrice(shown.close)}</span>
              </span>
              {delta !== undefined && deltaPct !== undefined ? (
                <span className={delta >= 0 ? 'text-up' : 'text-down'}>
                  {delta >= 0 ? '+' : ''}
                  {formatPrice(delta)} ({delta >= 0 ? '+' : ''}
                  {deltaPct.toFixed(2)}%)
                </span>
              ) : null}
            </span>
          </div>
          {settings.showVolume && shown.volume !== undefined ? (
            <div className="text-xs text-muted-foreground">
              Vol<span className={`ml-1 ${tone}`}>{compact.format(shown.volume)}</span>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-x-3 text-xs">
            {output.vwap ? (
              <span className="flex items-center gap-1 text-foreground">
                <span className="w-2.5 border-t-2 border-dashed border-foreground" aria-hidden />
                <abbr title="Volume-Weighted Average Price" className="cursor-help no-underline">VWAP</abbr> {legendValue(output.vwap)}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
