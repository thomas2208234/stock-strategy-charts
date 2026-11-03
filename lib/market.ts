export type Interval = "1min" | "5min" | "15min" | "30min" | "1h" | "4h" | "1day"

export const INTERVALS: { value: Interval; label: string; seconds: number }[] = [
  { value: "1min", label: "1m", seconds: 60 },
  { value: "5min", label: "5m", seconds: 300 },
  { value: "15min", label: "15m", seconds: 900 },
  { value: "30min", label: "30m", seconds: 1800 },
  { value: "1h", label: "1H", seconds: 3600 },
  { value: "4h", label: "4H", seconds: 14400 },
  { value: "1day", label: "1D", seconds: 86400 },
]

export function intervalSeconds(interval: Interval): number {
  return INTERVALS.find((i) => i.value === interval)?.seconds ?? 60
}

export function isInterval(value: string): value is Interval {
  return INTERVALS.some((i) => i.value === value)
}

export const SYMBOL_PATTERN = /^[A-Za-z0-9.\-/:=^]{1,24}$/

export type InstrumentKind = "stock" | "etf" | "futures"

export interface PresetSymbol {
  symbol: string
  name: string
  kind: InstrumentKind
  /** For futures: a clearly-labeled ETF that tracks the same index. Not the futures contract. */
  proxy?: string
}

export const STOCK_PRESETS: PresetSymbol[] = [
  { symbol: "AAPL", name: "Apple Inc.", kind: "stock" },
  { symbol: "NVDA", name: "NVIDIA Corp.", kind: "stock" },
  { symbol: "TSLA", name: "Tesla Inc.", kind: "stock" },
  { symbol: "MSFT", name: "Microsoft Corp.", kind: "stock" },
  { symbol: "SPY", name: "SPDR S&P 500 ETF", kind: "etf" },
  { symbol: "QQQ", name: "Invesco QQQ Trust", kind: "etf" },
]

export const FUTURES_PRESETS: PresetSymbol[] = [
  { symbol: "ES", name: "E-mini S&P 500", kind: "futures", proxy: "SPY" },
  { symbol: "MES", name: "Micro E-mini S&P 500", kind: "futures", proxy: "SPY" },
  { symbol: "NQ", name: "E-mini Nasdaq-100", kind: "futures", proxy: "QQQ" },
  { symbol: "MNQ", name: "Micro E-mini Nasdaq-100", kind: "futures", proxy: "QQQ" },
  { symbol: "YM", name: "E-mini Dow", kind: "futures", proxy: "DIA" },
  { symbol: "MYM", name: "Micro E-mini Dow", kind: "futures", proxy: "DIA" },
  { symbol: "RTY", name: "E-mini Russell 2000", kind: "futures", proxy: "IWM" },
  { symbol: "M2K", name: "Micro E-mini Russell 2000", kind: "futures", proxy: "IWM" },
]

export function findPreset(symbol: string): PresetSymbol | undefined {
  const s = symbol.toUpperCase()
  return [...STOCK_PRESETS, ...FUTURES_PRESETS].find((p) => p.symbol === s)
}

export interface Candle {
  /** UTC seconds */
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type FreshnessStatus = "recent" | "delayed" | "closed" | "historical" | "unknown"

export interface Freshness {
  status: FreshnessStatus
  label: string
  detail: string
  lastBarAt: number | null
  ageSeconds: number | null
}

export interface MarketDataResponse {
  ok: true
  symbol: string
  interval: Interval
  meta: {
    exchange?: string
    exchangeTimezone?: string
    currency?: string
    type?: string
  }
  candles: Candle[]
  freshness: Freshness
  fetchedAt: number
  cached: boolean
  stale: boolean
  source: "Twelve Data"
}

export type ApiErrorKind =
  | "missing_key"
  | "invalid_request"
  | "unsupported"
  | "plan_restricted"
  | "rate_limited"
  | "provider_error"
  | "network"

export interface ApiErrorResponse {
  ok: false
  kind: ApiErrorKind
  message: string
  retryAfterSeconds?: number
}

export interface QuoteItem {
  symbol: string
  name?: string
  price: number | null
  change: number | null
  percentChange: number | null
  isMarketOpen: boolean | null
  timestamp: number | null
  error?: string
}

export interface QuotesResponse {
  ok: true
  quotes: QuoteItem[]
  fetchedAt: number
  cached: boolean
}

export interface SearchResult {
  symbol: string
  name: string
  exchange: string
  type: string
  country: string
  currency: string
  plan?: string
}

export interface StatusResponse {
  ok: true
  configured: boolean
  connected: boolean
  plan?: string
  minuteUsage?: number
  minuteLimit?: number
  dailyUsage?: number
  dailyLimit?: number
  localCreditsPerMinute: number
  message?: string
  checkedAt: number
}
