import { autoLevels, ema, macd, sma, vwap, type Level, type Series } from './indicators'
import type { Bar } from './types'

export type Side = 'long' | 'short'
export type Direction = Side | 'both'

export interface StrategyConfig {
  direction: Direction
  ma: { enabled: boolean; type: 'SMA' | 'EMA'; fast: number; slow: number }
  vwap: { enabled: boolean }
  macd: { enabled: boolean; fast: number; slow: number; signal: number }
  levels: { enabled: boolean; auto: boolean; lookback: number; maxLevels: number; manual: string }
  entry: { maCrossUp: boolean; macdCrossUp: boolean; requireAboveVwap: boolean }
  exit: { maCrossDown: boolean; macdCrossDown: boolean }
  risk: { useStop: boolean; stopPct: number; useTarget: boolean; targetPct: number }
  showSignals: boolean
}

export const DEFAULT_STRATEGY: StrategyConfig = {
  direction: 'long',
  ma: { enabled: true, type: 'EMA', fast: 9, slow: 21 },
  vwap: { enabled: true },
  macd: { enabled: false, fast: 12, slow: 26, signal: 9 },
  levels: { enabled: true, auto: true, lookback: 10, maxLevels: 2, manual: '' },
  entry: { maCrossUp: true, macdCrossUp: false, requireAboveVwap: false },
  exit: { maCrossDown: true, macdCrossDown: false },
  risk: { useStop: true, stopPct: 1, useTarget: true, targetPct: 2 },
  showSignals: true,
}

export interface SignalMarker {
  time: number
  kind: 'entry' | 'exit' | 'stop' | 'target'
  side: Side
  price: number
}

export interface OpenPosition {
  side: Side
  time: number
  entry: number
  stop?: number
  target?: number
}

export interface StrategyOutput {
  maFast?: Series
  maSlow?: Series
  vwap?: Series
  macd?: { line: Series; signal: Series; hist: Series }
  levels: Level[]
  signals: SignalMarker[]
  open?: OpenPosition
}

function crossUp(a: Series, b: Series | number, i: number) {
  const bPrev = typeof b === 'number' ? b : b[i - 1]
  const bNow = typeof b === 'number' ? b : b[i]
  const aPrev = a[i - 1]
  const aNow = a[i]
  if (aPrev === undefined || aNow === undefined || bPrev === undefined || bNow === undefined) return false
  return aPrev <= bPrev && aNow > bNow
}

function crossDown(a: Series, b: Series | number, i: number) {
  const bPrev = typeof b === 'number' ? b : b[i - 1]
  const bNow = typeof b === 'number' ? b : b[i]
  const aPrev = a[i - 1]
  const aNow = a[i]
  if (aPrev === undefined || aNow === undefined || bPrev === undefined || bNow === undefined) return false
  return aPrev >= bPrev && aNow < bNow
}

export function parseManualLevels(text: string): number[] {
  return text
    .split(/[,\s]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0)
    .slice(0, 10)
}

export function runStrategy(bars: Bar[], cfg: StrategyConfig, intraday: boolean): StrategyOutput {
  const closes = bars.map((b) => b.close)
  const avg = cfg.ma.type === 'EMA' ? (p: number) => ema(closes, p) : (p: number) => sma(closes, p)

  const out: StrategyOutput = { levels: [], signals: [] }
  if (cfg.ma.enabled) {
    out.maFast = avg(cfg.ma.fast)
    out.maSlow = avg(cfg.ma.slow)
  }
  const hasVolume = bars.some((b) => (b.volume ?? 0) > 0)
  if (cfg.vwap.enabled && intraday && hasVolume) out.vwap = vwap(bars)
  if (cfg.macd.enabled) out.macd = macd(closes, cfg.macd.fast, cfg.macd.slow, cfg.macd.signal)

  if (cfg.levels.enabled && bars.length > 0) {
    const last = bars[bars.length - 1].close
    const manual: Level[] = parseManualLevels(cfg.levels.manual).map((price) => ({
      price,
      kind: price >= last ? 'resistance' : 'support',
      source: 'manual',
    }))
    out.levels = [...manual, ...(cfg.levels.auto ? autoLevels(bars, cfg.levels.lookback, cfg.levels.maxLevels) : [])]
  }

  const entryTriggers = [
    cfg.entry.maCrossUp && out.maFast && out.maSlow,
    cfg.entry.macdCrossUp && out.macd,
  ].some(Boolean)
  if (!entryTriggers) return out

  const sides: Side[] = cfg.direction === 'both' ? ['long', 'short'] : [cfg.direction]

  // Long trades use the rules as written; shorts mirror every cross and the VWAP filter.
  const entryCross = (side: Side, i: number) => {
    const cross = side === 'long' ? crossUp : crossDown
    return Boolean(
      (cfg.entry.maCrossUp && out.maFast && out.maSlow && cross(out.maFast, out.maSlow, i)) ||
        (cfg.entry.macdCrossUp && out.macd && cross(out.macd.line, out.macd.signal, i)),
    )
  }
  const exitCross = (side: Side, i: number) => {
    const cross = side === 'long' ? crossDown : crossUp
    return Boolean(
      (cfg.exit.maCrossDown && out.maFast && out.maSlow && cross(out.maFast, out.maSlow, i)) ||
        (cfg.exit.macdCrossDown && out.macd && cross(out.macd.line, out.macd.signal, i)),
    )
  }

  const passesVwap = (side: Side, i: number, close: number) => {
    if (!cfg.entry.requireAboveVwap || !out.vwap) return true
    const v = out.vwap[i]
    if (v === undefined) return false
    return side === 'long' ? close > v : close < v
  }

  let position: OpenPosition | undefined

  for (let i = 1; i < bars.length; i++) {
    const bar = bars[i]

    if (position) {
      const { side } = position
      const stopHit =
        position.stop !== undefined && (side === 'long' ? bar.low <= position.stop : bar.high >= position.stop)
      if (stopHit) {
        out.signals.push({ time: bar.time, kind: 'stop', side, price: position.stop! })
        position = undefined
        continue
      }
      const targetHit =
        position.target !== undefined && (side === 'long' ? bar.high >= position.target : bar.low <= position.target)
      if (targetHit) {
        out.signals.push({ time: bar.time, kind: 'target', side, price: position.target! })
        position = undefined
        continue
      }
      if (!exitCross(side, i)) continue
      out.signals.push({ time: bar.time, kind: 'exit', side, price: bar.close })
      position = undefined
      // Fall through so a rule-based exit can reverse into the opposite side on the same bar.
    }

    const side = sides.find((s) => entryCross(s, i) && passesVwap(s, i, bar.close))
    if (!side) continue

    const sign = side === 'long' ? 1 : -1
    position = {
      side,
      entry: bar.close,
      time: bar.time,
      stop: cfg.risk.useStop ? bar.close * (1 - (sign * cfg.risk.stopPct) / 100) : undefined,
      target: cfg.risk.useTarget ? bar.close * (1 + (sign * cfg.risk.targetPct) / 100) : undefined,
    }
    out.signals.push({ time: bar.time, kind: 'entry', side, price: bar.close })
  }

  if (position) out.open = position
  return out
}
