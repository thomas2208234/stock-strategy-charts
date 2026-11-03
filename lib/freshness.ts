import { intervalSeconds, type Interval } from './types'

export type Freshness = 'recent' | 'stale'

/**
 * Twelve Data does not report a latency flag in time-series responses, so freshness is inferred from
 * the age of the newest bar. "Recent" means the newest bar is within about one interval of now — it is
 * NOT a guarantee of exchange real-time data. "Stale" means delayed data or a closed market.
 */
export function freshness(lastBarTime: number, interval: Interval, nowMs: number) {
  const step = intervalSeconds(interval)
  const barEnd = lastBarTime + step
  const ageSec = Math.max(0, nowMs / 1000 - barEnd)
  const allowance = interval === '1day' ? 2 * 86400 : Math.max(step, 300)
  const state: Freshness = ageSec <= allowance ? 'recent' : 'stale'
  return { state, ageSec }
}

export function formatAge(sec: number) {
  if (sec < 60) return `${Math.round(sec)}s`
  if (sec < 3600) return `${Math.round(sec / 60)}m`
  if (sec < 86400) return `${(sec / 3600).toFixed(1)}h`
  return `${(sec / 86400).toFixed(1)}d`
}

export function formatPrice(value: number) {
  const digits = Math.abs(value) >= 1000 ? 2 : Math.abs(value) >= 1 ? 2 : 4
  return value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
