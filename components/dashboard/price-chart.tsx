'use client'

import {
  AreaSeries,
  BarSeries,
  BaselineSeries,
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
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import { ChevronsRight } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { INTERVAL_CODE, formatVolume, heikinAshi, isOhlcType, type ChartType, type ScaleMode } from '@/lib/chart-style'
import type { Series } from '@/lib/indicators'
import { formatPrice } from '@/lib/freshness'
import type { StrategyConfig, StrategyOutput } from '@/lib/strategy'
import { CHART_COLORS as C, CHART_FONT } from '@/lib/theme'
import { intervalSeconds, type Bar, type Interval } from '@/lib/types'
import { BarCountdown } from './bar-countdown'
import type { ChartSettings } from './dashboard-context'
import { DrawingLayer, type ChartApi, type Drawing, type DrawTool } from './drawing-layer'
import { ZoomLayer, type ZoomHandle } from './zoom-layer'

export interface ChartViewHandle {
  /** Show bars from this unix time to the latest bar; null fits all data. */
  showFrom: (fromSec: number | null) => void
  resetScale: () => void
}

interface Refs {
  chart: IChartApi
  main: ISeriesApi<SeriesType>
  type: ChartType
  volume?: ISeriesApi<'Histogram'>
  vwap?: ISeriesApi<'Line'>
  macdLine?: ISeriesApi<'Line'>
  macdSignal?: ISeriesApi<'Line'>
  macdHist?: ISeriesApi<'Histogram'>
  markers: ISeriesMarkersPluginApi<Time>
  priceLines: IPriceLine[]
}

const ts = (t: number) => t as UTCTimestamp
const SCALE_MODE: Record<ScaleMode, PriceScaleMode> = {
  normal: PriceScaleMode.Normal,
  log: PriceScaleMode.Logarithmic,
  percent: PriceScaleMode.Percentage,
}

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
      return String(d.getDate())
    default:
      return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
  }
}

function addMainSeries(chart: IChartApi, type: ChartType): ISeriesApi<SeriesType> {
  const common = { priceLineStyle: LineStyle.Dotted, priceLineWidth: 1 as const }
  switch (type) {
    case 'bars':
      return chart.addSeries(BarSeries, { ...common, upColor: C.up, downColor: C.down, thinBars: true })
    case 'hollow':
      return chart.addSeries(CandlestickSeries, {
        ...common,
        upColor: 'rgba(0,0,0,0)',
        downColor: C.down,
        borderUpColor: C.up,
        borderDownColor: C.down,
        wickUpColor: C.up,
        wickDownColor: C.down,
      })
    case 'line':
      return chart.addSeries(LineSeries, { ...common, color: C.primary, lineWidth: 2, crosshairMarkerRadius: 4 })
    case 'area':
      return chart.addSeries(AreaSeries, {
        ...common,
        lineColor: C.primary,
        lineWidth: 2,
        topColor: `${C.primary}47`,
        bottomColor: `${C.primary}0d`,
      })
    case 'baseline':
      return chart.addSeries(BaselineSeries, {
        ...common,
        lineWidth: 2,
        topLineColor: C.up,
        topFillColor1: `${C.up}47`,
        topFillColor2: `${C.up}0d`,
        bottomLineColor: C.down,
        bottomFillColor1: `${C.down}0d`,
        bottomFillColor2: `${C.down}47`,
      })
    default:
      return chart.addSeries(CandlestickSeries, {
        ...common,
        upColor: C.up,
        downColor: C.down,
        borderUpColor: C.up,
        borderDownColor: C.down,
        wickUpColor: C.up,
        wickDownColor: C.down,
      })
  }
}

function applyData(refs: Refs, bars: Bar[], display: Bar[], out: StrategyOutput, cfg: StrategyConfig) {
  if (isOhlcType(refs.type)) {
    refs.main.setData(
      display.map((b) => ({ time: ts(b.time), open: b.open, high: b.high, low: b.low, close: b.close })),
    )
  } else {
    refs.main.setData(display.map((b) => ({ time: ts(b.time), value: b.close })))
    if (refs.type === 'baseline' && bars.length > 0) {
      let lo = Infinity
      let hi = -Infinity
      for (const b of bars) {
        lo = Math.min(lo, b.close)
        hi = Math.max(hi, b.close)
      }
      refs.main.applyOptions({ baseValue: { type: 'price', price: (lo + hi) / 2 } })
    }
  }
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
        if (v === undefined) return []
        const prev = hist[i - 1] ?? v
        // TradingView shades histogram columns by sign and by whether they are growing or shrinking.
        const color = v >= 0 ? (v >= prev ? C.up : `${C.up}80`) : v <= prev ? C.down : `${C.down}80`
        return [{ time: ts(b.time), value: v, color }]
      }),
    )
  }

  for (const pl of refs.priceLines) refs.main.removePriceLine(pl)
  refs.priceLines = []
  for (const lvl of out.levels) {
    refs.priceLines.push(
      refs.main.createPriceLine({
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
        refs.main.createPriceLine({ price, color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title }),
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
  title,
  chartType,
  scaleMode,
  strategy,
  settings,
  drawings,
  tool,
  selectedDrawing,
  onAddDrawing,
  onSelectDrawing,
  zoomMode = false,
  zoomRef,
  viewRef,
  onZoomed,
  onZoomDepthChange,
  onAutoScaleChange,
}: {
  bars: Bar[]
  output: StrategyOutput
  interval: Interval
  title: { symbol: string; exchange?: string }
  chartType: ChartType
  scaleMode: ScaleMode
  strategy: StrategyConfig
  settings: ChartSettings
  drawings: Drawing[]
  tool: DrawTool
  selectedDrawing: string | null
  onAddDrawing: (d: Drawing) => void
  onSelectDrawing: (id: string | null) => void
  zoomMode?: boolean
  zoomRef?: RefObject<ZoomHandle | null>
  viewRef?: RefObject<ChartViewHandle | null>
  onZoomed: () => void
  onZoomDepthChange: (depth: number) => void
  onAutoScaleChange: (auto: boolean) => void
}) {
  const [api, setApi] = useState<ChartApi | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const refs = useRef<Refs | null>(null)
  const intraday = interval !== '1day'
  const display = useMemo(() => (chartType === 'heikin' ? heikinAshi(bars) : bars), [bars, chartType])
  const latest = useRef({ bars, display, output, strategy, scaleMode, onAutoScaleChange })
  latest.current = { bars, display, output, strategy, scaleMode, onAutoScaleChange }
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const [macdTop, setMacdTop] = useState<number | null>(null)
  const [jump, setJump] = useState<{ right: number; bottom: number } | null>(null)

  const structureKey = [
    chartType,
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
    const crosshairLine = { color: C.crosshair, width: 1 as const, style: LineStyle.LargeDashed, labelBackgroundColor: C.crosshairLabel }
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: C.background },
        textColor: C.text,
        fontFamily: CHART_FONT,
        fontSize: 12,
        attributionLogo: false,
        panes: { separatorColor: C.border, separatorHoverColor: `${C.crosshair}33`, enableResize: true },
      },
      grid: {
        vertLines: { color: C.grid, visible: settings.showGrid },
        horzLines: { color: C.grid, visible: settings.showGrid },
      },
      crosshair: {
        mode: settings.magnetCrosshair ? CrosshairMode.Magnet : CrosshairMode.Normal,
        vertLine: crosshairLine,
        horzLine: crosshairLine,
      },
      rightPriceScale: {
        borderColor: C.border,
        mode: SCALE_MODE[latest.current.scaleMode],
        scaleMargins: { top: 0.1, bottom: settings.showVolume ? 0.12 : 0.08 },
      },
      timeScale: {
        borderColor: C.border,
        timeVisible: intraday,
        secondsVisible: false,
        rightOffset: 8,
        barSpacing: 7,
        minBarSpacing: 0.5,
        tickMarkFormatter: settings.localTime ? localTickFormatter : undefined,
      },
      localization: settings.localTime
        ? {
            timeFormatter: (t: Time) => {
              const d = new Date((t as number) * 1000)
              const date = d.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: '2-digit' })
              return intraday ? `${date}  ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}` : date
            },
          }
        : undefined,
    })

    const main = addMainSeries(chart, chartType)
    const r: Refs = { chart, main, type: chartType, markers: createSeriesMarkers(main, []), priceLines: [] }

    if (settings.showVolume) {
      r.volume = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false })
      r.volume.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })
    }
    const overlay = { lineWidth: 1 as const, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }
    if (strategy.vwap.enabled && intraday) {
      r.vwap = chart.addSeries(LineSeries, { ...overlay, color: C.primary, lineWidth: 2 })
    }

    if (strategy.macd.enabled) {
      r.macdHist = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, 1)
      r.macdLine = chart.addSeries(LineSeries, { lineWidth: 1, color: C.primary, priceLineVisible: false }, 1)
      r.macdSignal = chart.addSeries(LineSeries, { lineWidth: 1, color: C.accent, priceLineVisible: false }, 1)
    }
    const panes = chart.panes()
    for (let i = 1; i < panes.length; i++) panes[i].setHeight(100)

    const measure = () => {
      const p = chart.panes()
      setMacdTop(p.length > 1 ? p[0].getHeight() + 1 : null)
    }

    const timeScale = chart.timeScale()
    const onRange = () => {
      const range = timeScale.getVisibleLogicalRange()
      const last = latest.current.bars.length - 1
      if (range && range.to < last - 1) {
        setJump((prev) => prev ?? { right: chart.priceScale('right').width() + 8, bottom: timeScale.height() + 8 })
      } else {
        setJump(null)
      }
    }
    timeScale.subscribeVisibleLogicalRangeChange(onRange)

    chart.subscribeCrosshairMove((param) => {
      measure()
      latest.current.onAutoScaleChange(main.priceScale().options().autoScale)
      if (!param.time) {
        setHoverIdx(null)
        return
      }
      const t = param.time as number
      const idx = latest.current.display.findIndex((b) => b.time === t)
      setHoverIdx(idx >= 0 ? idx : null)
    })

    const ro = new ResizeObserver(measure)
    ro.observe(el)

    refs.current = r
    applyData(r, latest.current.bars, latest.current.display, latest.current.output, latest.current.strategy)
    timeScale.scrollToRealTime()
    requestAnimationFrame(measure)
    setApi({ chart, candles: main })

    if (viewRef) {
      viewRef.current = {
        showFrom: (fromSec) => {
          const all = latest.current.bars
          if (fromSec === null || all.length === 0) {
            timeScale.fitContent()
            return
          }
          let idx = all.findIndex((b) => b.time >= fromSec)
          if (idx < 0) idx = all.length - 1
          timeScale.setVisibleLogicalRange({ from: idx, to: all.length - 1 + 4 })
          main.priceScale().setAutoScale(true)
          latest.current.onAutoScaleChange(true)
        },
        resetScale: () => {
          main.priceScale().setAutoScale(true)
          latest.current.onAutoScaleChange(true)
        },
      }
    }

    return () => {
      ro.disconnect()
      if (viewRef) viewRef.current = null
      setApi(null)
      setJump(null)
      refs.current = null
      chart.remove()
    }
    // structureKey captures every option that requires rebuilding the chart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureKey])

  useEffect(() => {
    if (refs.current) applyData(refs.current, bars, display, output, strategy)
  }, [bars, display, output, strategy])

  useEffect(() => {
    refs.current?.chart.applyOptions({ rightPriceScale: { mode: SCALE_MODE[scaleMode] } })
  }, [scaleMode])

  const idx = hoverIdx ?? display.length - 1
  const shown = display[idx]
  const prevBar = display[idx - 1]
  const rawShown = bars[idx]
  const up = shown ? shown.close >= shown.open : true
  const valueClass = up ? 'text-up' : 'text-down'
  const change = shown && prevBar ? shown.close - prevBar.close : undefined
  const changePct = change !== undefined && prevBar ? (change / prevBar.close) * 100 : undefined
  const at = (s?: Series) => (s && s[idx] !== undefined ? (s[idx] as number) : undefined)
  const fmt = (v: number | undefined) => (v === undefined ? '∅' : formatPrice(v))

  const lastDisplay = display[display.length - 1]
  const countdownColor =
    chartType === 'line' || chartType === 'area'
      ? C.primary
      : lastDisplay && lastDisplay.close >= lastDisplay.open
        ? C.up
        : C.down

  const macdHist = at(output.macd?.hist)

  return (
    <div className="relative h-full w-full" onPointerDown={() => onSelectDrawing(null)}>
      <div ref={containerRef} className="absolute inset-0" />
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

      {api && lastDisplay ? (
        <BarCountdown
          api={api}
          value={lastDisplay.close}
          barTime={lastDisplay.time}
          intervalSec={intervalSeconds(interval)}
          color={countdownColor}
        />
      ) : null}

      {shown ? (
        <div className="pointer-events-none absolute left-3 top-2 z-10 flex flex-col gap-1 font-chart text-[13px] leading-tight tabular-nums">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <span className="text-foreground">
              {title.symbol} · {INTERVAL_CODE[interval]}
              {title.exchange ? ` · ${title.exchange}` : ''}
            </span>
            <span className="flex flex-wrap gap-x-2 text-muted-foreground">
              <span>
                O<span className={valueClass}>{formatPrice(shown.open)}</span>
              </span>
              <span>
                H<span className={valueClass}>{formatPrice(shown.high)}</span>
              </span>
              <span>
                L<span className={valueClass}>{formatPrice(shown.low)}</span>
              </span>
              <span>
                C<span className={valueClass}>{formatPrice(shown.close)}</span>
              </span>
              {change !== undefined && changePct !== undefined ? (
                <span className={change >= 0 ? 'text-up' : 'text-down'}>
                  {change >= 0 ? '+' : ''}
                  {formatPrice(change)} ({change >= 0 ? '+' : ''}
                  {changePct.toFixed(2)}%)
                </span>
              ) : null}
            </span>
          </div>
          {settings.showVolume && rawShown?.volume !== undefined ? (
            <div className="text-muted-foreground">
              Vol <span className={rawShown.close >= rawShown.open ? 'text-up' : 'text-down'}>{formatVolume(rawShown.volume)}</span>
            </div>
          ) : null}
          {output.vwap ? (
            <div className="text-muted-foreground">
              <abbr title="Volume-Weighted Average Price" className="cursor-help no-underline">
                VWAP
              </abbr>{' '}
              <span className="text-primary">{fmt(at(output.vwap))}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {output.macd && macdTop !== null ? (
        <div
          className="pointer-events-none absolute left-3 z-10 flex flex-wrap gap-x-2 font-chart text-[13px] leading-tight tabular-nums text-muted-foreground"
          style={{ top: macdTop + 6 }}
        >
          <span className="text-foreground">
            MACD {strategy.macd.fast} {strategy.macd.slow} close {strategy.macd.signal}
          </span>
          <span className={macdHist !== undefined && macdHist < 0 ? 'text-down' : 'text-up'}>{fmt(macdHist)}</span>
          <span className="text-primary">{fmt(at(output.macd.line))}</span>
          <span className="text-warning">{fmt(at(output.macd.signal))}</span>
        </div>
      ) : null}

      {jump && api ? (
        <button
          type="button"
          aria-label="Scroll to the most recent bar"
          title="Scroll to the most recent bar"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => api.chart.timeScale().scrollToRealTime()}
          className="absolute z-20 flex size-7 items-center justify-center rounded-full border border-border bg-panel text-foreground shadow-md transition-colors hover:bg-border"
          style={{ right: jump.right, bottom: jump.bottom }}
        >
          <ChevronsRight className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  )
}
