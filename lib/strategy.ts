import type { Candle } from "@/lib/market"
import { macd, movingAverage, rsi, vwap, type Series } from "@/lib/indicators"
import type { IndicatorSettings, StrategySettings } from "@/lib/settings"

export interface ComputedIndicators {
  fastMa: Series | null
  slowMa: Series | null
  vwap: Series | null
  rsi: Series | null
  macd: { line: Series; signal: Series; hist: Series } | null
}

export interface SignalMarker {
  time: number
  kind: "entry" | "exit" | "stop" | "target"
  price: number
}

export interface StrategyResult {
  markers: SignalMarker[]
  openPosition: { entryPrice: number; stop: number | null; target: number | null; time: number } | null
  entries: number
}

export function computeIndicators(
  candles: Candle[],
  ind: IndicatorSettings,
  strat: StrategySettings,
  timeZone: string | undefined,
): ComputedIndicators {
  const closes = candles.map((c) => c.close)
  const needs = rulesNeed(strat)
  return {
    fastMa: ind.fastMa.enabled || needs.ma ? movingAverage(closes, ind.fastMa.period, ind.fastMa.type) : null,
    slowMa:
      ind.slowMa.enabled || needs.ma || (strat.enabled && strat.requireAboveSlowMa)
        ? movingAverage(closes, ind.slowMa.period, ind.slowMa.type)
        : null,
    vwap: ind.vwap.enabled || needs.vwap ? vwap(candles, timeZone) : null,
    rsi: ind.rsi.enabled || needs.rsi ? rsi(closes, ind.rsi.period) : null,
    macd: ind.macd.enabled || needs.macd ? macd(closes, ind.macd.fast, ind.macd.slow, ind.macd.signal) : null,
  }
}

function rulesNeed(s: StrategySettings) {
  if (!s.enabled) return { ma: false, vwap: false, rsi: false, macd: false }
  return {
    ma: s.entry === "ma_cross" || s.exit === "opposite",
    vwap: s.entry === "vwap_reclaim" || s.exit === "vwap_lose" || s.requireAboveVwap,
    rsi: s.entry === "rsi_reversal" || s.exit === "rsi_overbought",
    macd: s.entry === "macd_cross" || s.exit === "macd_cross_down",
  }
}

const crossUp = (a: Series, b: Series, i: number) =>
  a[i] != null && b[i] != null && a[i - 1] != null && b[i - 1] != null && a[i - 1]! <= b[i - 1]! && a[i]! > b[i]!
const crossDown = (a: Series, b: Series, i: number) =>
  a[i] != null && b[i] != null && a[i - 1] != null && b[i - 1] != null && a[i - 1]! >= b[i - 1]! && a[i]! < b[i]!

/**
 * Long-only rules evaluated bar-by-bar on closed candles. Educational signal plotting only —
 * no fills, slippage, or fees are modeled.
 */
export function runStrategy(
  candles: Candle[],
  ind: ComputedIndicators,
  s: StrategySettings,
  rsiCfg: IndicatorSettings["rsi"],
): StrategyResult {
  const markers: SignalMarker[] = []
  if (!s.enabled || candles.length < 3) return { markers, openPosition: null, entries: 0 }

  const closes: Series = candles.map((c) => c.close)
  let pos: StrategyResult["openPosition"] = null
  let entries = 0

  const entrySignal = (i: number): boolean => {
    switch (s.entry) {
      case "ma_cross":
        return !!ind.fastMa && !!ind.slowMa && crossUp(ind.fastMa, ind.slowMa, i)
      case "rsi_reversal":
        return !!ind.rsi && ind.rsi[i - 1] != null && ind.rsi[i] != null && ind.rsi[i - 1]! <= rsiCfg.oversold && ind.rsi[i]! > rsiCfg.oversold
      case "macd_cross":
        return !!ind.macd && crossUp(ind.macd.line, ind.macd.signal, i)
      case "vwap_reclaim":
        return !!ind.vwap && crossUp(closes, ind.vwap, i)
    }
  }

  const exitSignal = (i: number): boolean => {
    switch (s.exit) {
      case "opposite":
        if (s.entry === "ma_cross") return !!ind.fastMa && !!ind.slowMa && crossDown(ind.fastMa, ind.slowMa, i)
        if (s.entry === "macd_cross") return !!ind.macd && crossDown(ind.macd.line, ind.macd.signal, i)
        if (s.entry === "vwap_reclaim") return !!ind.vwap && crossDown(closes, ind.vwap, i)
        return !!ind.rsi && ind.rsi[i - 1] != null && ind.rsi[i] != null && ind.rsi[i - 1]! >= rsiCfg.overbought && ind.rsi[i]! < rsiCfg.overbought
      case "rsi_overbought":
        return !!ind.rsi && ind.rsi[i] != null && ind.rsi[i]! >= rsiCfg.overbought
      case "macd_cross_down":
        return !!ind.macd && crossDown(ind.macd.line, ind.macd.signal, i)
      case "vwap_lose":
        return !!ind.vwap && crossDown(closes, ind.vwap, i)
      case "none":
        return false
    }
  }

  const filtersPass = (i: number): boolean => {
    const c = candles[i].close
    if (s.requireAboveVwap && (!ind.vwap || ind.vwap[i] == null || c < ind.vwap[i]!)) return false
    if (s.requireAboveSlowMa && (!ind.slowMa || ind.slowMa[i] == null || c < ind.slowMa[i]!)) return false
    return true
  }

  // The last candle may still be forming, so signals are only evaluated on prior bars.
  const lastClosed = candles.length - 2
  for (let i = 1; i <= lastClosed; i++) {
    const bar = candles[i]
    if (pos) {
      if (pos.stop != null && bar.low <= pos.stop) {
        markers.push({ time: bar.time, kind: "stop", price: pos.stop })
        pos = null
        continue
      }
      if (pos.target != null && bar.high >= pos.target) {
        markers.push({ time: bar.time, kind: "target", price: pos.target })
        pos = null
        continue
      }
      if (exitSignal(i)) {
        markers.push({ time: bar.time, kind: "exit", price: bar.close })
        pos = null
      }
      continue
    }
    if (entrySignal(i) && filtersPass(i)) {
      const entryPrice = bar.close
      pos = {
        entryPrice,
        time: bar.time,
        stop: s.useStopLoss ? entryPrice * (1 - s.stopLossPct / 100) : null,
        target: s.useTakeProfit ? entryPrice * (1 + s.takeProfitPct / 100) : null,
      }
      entries++
      markers.push({ time: bar.time, kind: "entry", price: entryPrice })
    }
  }
  return { markers, openPosition: pos, entries }
}
