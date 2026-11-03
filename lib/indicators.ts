import type { Candle } from "@/lib/market"

export type Series = (number | null)[]

export function sma(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null)
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

export function ema(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null)
  if (values.length < period) return out
  const k = 2 / (period + 1)
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period
  out[period - 1] = prev
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k)
    out[i] = prev
  }
  return out
}

export function movingAverage(values: number[], period: number, type: "SMA" | "EMA"): Series {
  return type === "EMA" ? ema(values, period) : sma(values, period)
}

/** Wilder's RSI. */
export function rsi(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null)
  if (values.length <= period) return out
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1]
    if (d >= 0) gain += d
    else loss -= d
  }
  let avgG = gain / period
  let avgL = loss / period
  out[period] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL)
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1]
    avgG = (avgG * (period - 1) + Math.max(d, 0)) / period
    avgL = (avgL * (period - 1) + Math.max(-d, 0)) / period
    out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL)
  }
  return out
}

export function macd(values: number[], fast: number, slow: number, signal: number) {
  const f = ema(values, fast)
  const s = ema(values, slow)
  const line: Series = values.map((_, i) => (f[i] != null && s[i] != null ? f[i]! - s[i]! : null))
  const firstIdx = line.findIndex((v) => v != null)
  const sig: Series = new Array(values.length).fill(null)
  if (firstIdx >= 0) {
    const compact = line.slice(firstIdx) as number[]
    const e = ema(compact, signal)
    e.forEach((v, j) => (sig[firstIdx + j] = v))
  }
  const hist: Series = line.map((v, i) => (v != null && sig[i] != null ? v - sig[i]! : null))
  return { line, signal: sig, hist }
}

/** Session-anchored VWAP; resets at each new calendar day in the given timezone. */
export function vwap(candles: Candle[], timeZone = "America/New_York"): Series {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
  const out: Series = new Array(candles.length).fill(null)
  let day = ""
  let pv = 0
  let vol = 0
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]
    const d = fmt.format(new Date(c.time * 1000))
    if (d !== day) {
      day = d
      pv = 0
      vol = 0
    }
    const typical = (c.high + c.low + c.close) / 3
    const v = c.volume > 0 ? c.volume : 0
    pv += typical * v
    vol += v
    out[i] = vol > 0 ? pv / vol : null
  }
  return out
}

/** Pivot-based support/resistance nearest to the last close. */
export function autoLevels(candles: Candle[], strength: number, count: number) {
  const recent = candles.slice(-300)
  const highs: number[] = []
  const lows: number[] = []
  for (let i = strength; i < recent.length - strength; i++) {
    let isHigh = true
    let isLow = true
    for (let j = 1; j <= strength; j++) {
      if (recent[i].high <= recent[i - j].high || recent[i].high <= recent[i + j].high) isHigh = false
      if (recent[i].low >= recent[i - j].low || recent[i].low >= recent[i + j].low) isLow = false
    }
    if (isHigh) highs.push(recent[i].high)
    if (isLow) lows.push(recent[i].low)
  }
  const last = recent.at(-1)?.close ?? 0
  const dedupeLevels = (arr: number[]) => {
    const sorted = [...arr].sort((a, b) => Math.abs(a - last) - Math.abs(b - last))
    const kept: number[] = []
    for (const v of sorted) {
      if (kept.every((k) => Math.abs(k - v) / v > 0.002)) kept.push(v)
      if (kept.length >= count) break
    }
    return kept
  }
  return {
    resistance: dedupeLevels(highs.filter((h) => h > last)),
    support: dedupeLevels(lows.filter((l) => l < last)),
  }
}
