"use client"

import {
  CandlestickSeries,
  createChart,
  createSeriesMarkers,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts"
import { useEffect, useRef } from "react"
import type { Candle } from "@/lib/market"
import type { Series } from "@/lib/indicators"
import type { AppSettings } from "@/lib/settings"
import type { ComputedIndicators, StrategyResult } from "@/lib/strategy"

const COLORS = {
  bg: "#161a23",
  text: "#7d8597",
  grid: "#1f2430",
  border: "#262c3b",
  up: "#22ab94",
  down: "#f23645",
  primary: "#3d7bfd",
  warn: "#f5a524",
  fg: "#d6dae3",
}

const ts = (t: number) => t as UTCTimestamp

function toLine(candles: Candle[], s: Series) {
  const out: { time: UTCTimestamp; value: number }[] = []
  for (let i = 0; i < candles.length; i++) {
    const v = s[i]
    if (v != null && Number.isFinite(v)) out.push({ time: ts(candles[i].time), value: v })
  }
  return out
}

function makeFormatters(timeZone: string) {
  const safe = (opts: Intl.DateTimeFormatOptions) => {
    try {
      return new Intl.DateTimeFormat("en-US", { timeZone, ...opts })
    } catch {
      return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts })
    }
  }
  const full = safe({ month: "short", day: "numeric", year: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
  const time = safe({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
  const day = safe({ month: "short", day: "numeric" })
  const month = safe({ month: "short" })
  const year = safe({ year: "numeric" })
  const toDate = (t: Time) => new Date((t as number) * 1000)
  return {
    timeFormatter: (t: Time) => full.format(toDate(t)),
    tickMarkFormatter: (t: Time, type: number) => {
      const d = toDate(t)
      if (type === 0) return year.format(d)
      if (type === 1) return month.format(d)
      if (type === 2) return day.format(d)
      return time.format(d)
    },
  }
}

export function PriceChart({
  candles,
  indicators,
  strategy,
  settings,
  manualLevels,
  autoLevels,
  resetKey,
}: {
  candles: Candle[]
  indicators: ComputedIndicators
  strategy: StrategyResult
  settings: AppSettings
  manualLevels: number[]
  autoLevels: { support: number[]; resistance: number[] }
  resetKey: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null)
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  const extraSeries = useRef<ISeriesApi<"Line" | "Histogram">[]>([])
  const priceLines = useRef<IPriceLine[]>([])
  const lastResetKey = useRef<string>("")

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { color: COLORS.bg },
        textColor: COLORS.text,
        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
        fontSize: 11,
        attributionLogo: false,
        panes: { separatorColor: COLORS.border, separatorHoverColor: COLORS.border, enableResize: true },
      },
      rightPriceScale: { borderColor: COLORS.border },
      timeScale: { borderColor: COLORS.border, timeVisible: true, secondsVisible: false, rightOffset: 4 },
      crosshair: {
        vertLine: { color: COLORS.text, labelBackgroundColor: COLORS.border },
        horzLine: { color: COLORS.text, labelBackgroundColor: COLORS.border },
      },
    })
    const candle = chart.addSeries(CandlestickSeries, {
      upColor: COLORS.up,
      downColor: COLORS.down,
      borderVisible: false,
      wickUpColor: COLORS.up,
      wickDownColor: COLORS.down,
    })
    chartRef.current = chart
    candleRef.current = candle
    markersRef.current = createSeriesMarkers(candle, [])
    return () => {
      chart.remove()
      chartRef.current = null
      candleRef.current = null
      markersRef.current = null
      extraSeries.current = []
      priceLines.current = []
      lastResetKey.current = ""
    }
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const { prefs } = settings
    chart.applyOptions({
      crosshair: { mode: prefs.magnetCrosshair ? CrosshairMode.Magnet : CrosshairMode.Normal },
      grid: {
        vertLines: { visible: prefs.showGrid, color: COLORS.grid },
        horzLines: { visible: prefs.showGrid, color: COLORS.grid },
      },
      localization: { timeFormatter: makeFormatters(prefs.timeZone).timeFormatter },
      timeScale: { tickMarkFormatter: makeFormatters(prefs.timeZone).tickMarkFormatter },
    })
  }, [settings])

  useEffect(() => {
    const chart = chartRef.current
    const candle = candleRef.current
    if (!chart || !candle) return

    const range = chart.timeScale().getVisibleLogicalRange()
    candle.setData(
      candles.map((c) => ({ time: ts(c.time), open: c.open, high: c.high, low: c.low, close: c.close })),
    )

    for (const s of extraSeries.current) chart.removeSeries(s)
    extraSeries.current = []
    for (let i = chart.panes().length - 1; i > 0; i--) chart.removePane(i)

    const { indicators: ind, prefs } = settings
    const add = <T extends "Line" | "Histogram">(s: ISeriesApi<T>) => {
      extraSeries.current.push(s as ISeriesApi<"Line" | "Histogram">)
      return s
    }
    const lineOpts = (color: string, width: 1 | 2 = 2) => ({
      color,
      lineWidth: width,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    })

    if (prefs.showVolume) {
      const vol = add(
        chart.addSeries(HistogramSeries, {
          priceFormat: { type: "volume" },
          priceScaleId: "vol",
          lastValueVisible: false,
          priceLineVisible: false,
        }),
      )
      vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
      vol.setData(
        candles.map((c) => ({
          time: ts(c.time),
          value: c.volume,
          color: c.close >= c.open ? "rgba(34,171,148,0.35)" : "rgba(242,54,69,0.35)",
        })),
      )
    }
    if (ind.fastMa.enabled && indicators.fastMa) {
      add(chart.addSeries(LineSeries, lineOpts(COLORS.warn, 1))).setData(toLine(candles, indicators.fastMa))
    }
    if (ind.slowMa.enabled && indicators.slowMa) {
      add(chart.addSeries(LineSeries, lineOpts(COLORS.primary, 1))).setData(toLine(candles, indicators.slowMa))
    }
    if (ind.vwap.enabled && indicators.vwap) {
      add(chart.addSeries(LineSeries, { ...lineOpts(COLORS.fg, 1), lineStyle: LineStyle.Dashed })).setData(
        toLine(candles, indicators.vwap),
      )
    }

    let pane = 1
    if (ind.rsi.enabled && indicators.rsi) {
      const r = add(chart.addSeries(LineSeries, { ...lineOpts(COLORS.primary, 1), lastValueVisible: true }, pane))
      r.setData(toLine(candles, indicators.rsi))
      r.createPriceLine({ price: ind.rsi.overbought, color: COLORS.down, lineStyle: LineStyle.Dotted, lineWidth: 1, axisLabelVisible: false, title: "" })
      r.createPriceLine({ price: ind.rsi.oversold, color: COLORS.up, lineStyle: LineStyle.Dotted, lineWidth: 1, axisLabelVisible: false, title: "" })
      pane++
    }
    if (ind.macd.enabled && indicators.macd) {
      const m = indicators.macd
      add(
        chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, pane),
      ).setData(
        candles.flatMap((c, i) =>
          m.hist[i] == null
            ? []
            : [{ time: ts(c.time), value: m.hist[i]!, color: m.hist[i]! >= 0 ? "rgba(34,171,148,0.6)" : "rgba(242,54,69,0.6)" }],
        ),
      )
      add(chart.addSeries(LineSeries, lineOpts(COLORS.primary, 1), pane)).setData(toLine(candles, m.line))
      add(chart.addSeries(LineSeries, lineOpts(COLORS.warn, 1), pane)).setData(toLine(candles, m.signal))
      pane++
    }
    const panes = chart.panes()
    panes[0]?.setStretchFactor(3)
    for (let i = 1; i < panes.length; i++) panes[i].setStretchFactor(1)

    for (const pl of priceLines.current) candle.removePriceLine(pl)
    priceLines.current = []
    const addLevel = (price: number, color: string, title: string, style: LineStyle) =>
      priceLines.current.push(
        candle.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title }),
      )
    for (const p of manualLevels) addLevel(p, COLORS.fg, "Level", LineStyle.Solid)
    if (settings.levels.autoEnabled) {
      for (const p of autoLevels.resistance) addLevel(p, COLORS.down, "R", LineStyle.Dashed)
      for (const p of autoLevels.support) addLevel(p, COLORS.up, "S", LineStyle.Dashed)
    }
    if (settings.strategy.enabled && strategy.openPosition) {
      const op = strategy.openPosition
      if (op.stop != null) addLevel(op.stop, COLORS.down, "Stop", LineStyle.Dotted)
      if (op.target != null) addLevel(op.target, COLORS.up, "Target", LineStyle.Dotted)
    }

    const markers: SeriesMarker<Time>[] = settings.strategy.enabled
      ? strategy.markers.map((m) => {
          if (m.kind === "entry")
            return { time: ts(m.time), position: "belowBar", shape: "arrowUp", color: COLORS.up, text: "Entry" }
          if (m.kind === "stop")
            return { time: ts(m.time), position: "aboveBar", shape: "arrowDown", color: COLORS.down, text: "Stop" }
          if (m.kind === "target")
            return { time: ts(m.time), position: "aboveBar", shape: "arrowDown", color: COLORS.warn, text: "Target" }
          return { time: ts(m.time), position: "aboveBar", shape: "arrowDown", color: COLORS.down, text: "Exit" }
        })
      : []
    markersRef.current?.setMarkers(markers)

    if (lastResetKey.current !== resetKey) {
      lastResetKey.current = resetKey
      const n = candles.length
      chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 150), to: n + 4 })
    } else if (range) {
      chart.timeScale().setVisibleLogicalRange(range)
    }
  }, [candles, indicators, strategy, settings, manualLevels, autoLevels, resetKey])

  return <div ref={containerRef} className="absolute inset-0" />
}
