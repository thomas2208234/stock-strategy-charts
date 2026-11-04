import type { Bar } from './types'

export type Series = (number | undefined)[]

export function sma(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(undefined)
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

export function ema(values: Series, period: number): Series {
  const out: Series = new Array(values.length).fill(undefined)
  const k = 2 / (period + 1)
  let prev: number | undefined
  let seedSum = 0
  let seedCount = 0
  for (let i = 0; i < values.length; i++) {
    const x = values[i]
    if (x === undefined) continue
    if (prev === undefined) {
      seedSum += x
      seedCount++
      if (seedCount === period) {
        prev = seedSum / period
        out[i] = prev
      }
    } else {
      prev = x * k + prev * (1 - k)
      out[i] = prev
    }
  }
  return out
}

export function rsi(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(undefined)
  if (values.length <= period) return out
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1]
    if (change >= 0) gain += change
    else loss -= change
  }
  let avgGain = gain / period
  let avgLoss = loss / period
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1]
    avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period
    avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return out
}

export function macd(values: number[], fast: number, slow: number, signalPeriod: number) {
  const fastE = ema(values, fast)
  const slowE = ema(values, slow)
  const line: Series = values.map((_, i) =>
    fastE[i] !== undefined && slowE[i] !== undefined ? (fastE[i] as number) - (slowE[i] as number) : undefined,
  )
  const signal = ema(line, signalPeriod)
  const hist: Series = line.map((m, i) => (m !== undefined && signal[i] !== undefined ? m - (signal[i] as number) : undefined))
  return { line, signal, hist }
}

/** Session VWAP that resets at each UTC calendar day. Requires volume. */
export function vwap(bars: Bar[]): Series {
  const out: Series = new Array(bars.length).fill(undefined)
  let day = -1
  let pv = 0
  let vol = 0
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]
    const d = Math.floor(b.time / 86400)
    if (d !== day) {
      day = d
      pv = 0
      vol = 0
    }
    if (!b.volume) {
      out[i] = vol > 0 ? pv / vol : undefined
      continue
    }
    pv += ((b.high + b.low + b.close) / 3) * b.volume
    vol += b.volume
    out[i] = pv / vol
  }
  return out
}

export interface Level {
  price: number
  kind: 'support' | 'resistance'
  source: 'auto' | 'manual'
}

/** Finds swing-high/low pivots and keeps the most recent distinct levels nearest to price. */
export function autoLevels(bars: Bar[], lookback: number, maxLevels: number): Level[] {
  if (bars.length < lookback * 2 + 1) return []
  const last = bars[bars.length - 1].close
  const tolerance = last * 0.003
  const levels: Level[] = []

  for (let i = bars.length - 1 - lookback; i >= lookback; i--) {
    let isHigh = true
    let isLow = true
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue
      if (bars[j].high >= bars[i].high) isHigh = false
      if (bars[j].low <= bars[i].low) isLow = false
      if (!isHigh && !isLow) break
    }
    for (const price of [isHigh ? bars[i].high : null, isLow ? bars[i].low : null]) {
      if (price === null) continue
      if (levels.some((l) => Math.abs(l.price - price) < tolerance)) continue
      levels.push({ price, kind: price >= last ? 'resistance' : 'support', source: 'auto' })
    }
  }

  const byDistance = levels.sort((a, b) => Math.abs(a.price - last) - Math.abs(b.price - last))
  const nearestSupport = byDistance.find((l) => l.kind === 'support')
  const nearestResistance = byDistance.find((l) => l.kind === 'resistance')
  const priority = [nearestSupport, nearestResistance].filter((l): l is Level => l !== undefined)
  return [...priority, ...byDistance.filter((l) => !priority.includes(l))].slice(0, maxLevels)
}
