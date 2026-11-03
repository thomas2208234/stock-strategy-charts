export type Interval = '1min' | '5min' | '15min' | '30min' | '1h' | '4h' | '1day'

export const INTERVALS: { value: Interval; label: string; seconds: number }[] = [
  { value: '1min', label: '1m', seconds: 60 },
  { value: '5min', label: '5m', seconds: 300 },
  { value: '15min', label: '15m', seconds: 900 },
  { value: '30min', label: '30m', seconds: 1800 },
  { value: '1h', label: '1H', seconds: 3600 },
  { value: '4h', label: '4H', seconds: 14400 },
  { value: '1day', label: 'D', seconds: 86400 },
]

export const INTERVAL_VALUES = INTERVALS.map((i) => i.value)

export function intervalSeconds(interval: Interval): number {
  return INTERVALS.find((i) => i.value === interval)?.seconds ?? 60
}

export type AssetClass = 'stock' | 'etf' | 'future' | 'other'

export interface Instrument {
  symbol: string
  name: string
  asset: AssetClass
  exchange?: string
}

export interface Bar {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

export interface MarketDataResponse {
  symbol: string
  interval: Interval
  asset: AssetClass
  meta: {
    exchange?: string
    currency?: string
    type?: string
  }
  bars: Bar[]
  fetchedAt: string
  cached: boolean
}

export type ApiErrorKind = 'config' | 'invalid' | 'unsupported' | 'plan' | 'rate_limit' | 'upstream'

export interface ApiErrorBody {
  error: {
    kind: ApiErrorKind
    message: string
    retryAfterSeconds?: number
  }
}

export interface ProviderStatus {
  configured: boolean
  ok: boolean
  message?: string
  planCategory?: string
  minuteUsage?: number
  minuteLimit?: number
  dailyUsage?: number
  dailyLimit?: number
  checkedAt: string
  safeguard: {
    perMinute: number
    perDay: number
    usedThisMinute: number
    usedToday: number
  }
}

export interface CapabilityResult {
  symbol: string
  asset: AssetClass
  status: 'supported' | 'unsupported' | 'plan' | 'skipped' | 'error'
  message: string
}
