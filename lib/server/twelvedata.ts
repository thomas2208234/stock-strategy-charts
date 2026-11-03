import 'server-only'
import { NextResponse } from 'next/server'
import { FUTURES_ETF_PROXY, findCatalog } from '@/lib/catalog'
import type { ApiErrorBody, ApiErrorKind, AssetClass, Bar, Interval, MarketDataResponse } from '@/lib/types'
import { cached } from './cache'
import { consumeCredits } from './rate-limit'

const BASE_URL = 'https://api.twelvedata.com'

export class ProviderError extends Error {
  constructor(
    public kind: ApiErrorKind,
    message: string,
    public status: number,
    public retryAfterSeconds?: number,
  ) {
    super(message)
  }
}

export function isConfigured() {
  return Boolean(process.env.TWELVE_DATA_API_KEY)
}

function apiKey() {
  const key = process.env.TWELVE_DATA_API_KEY
  if (!key) {
    throw new ProviderError(
      'config',
      'TWELVE_DATA_API_KEY is not configured on the server. Add it in your Vercel project environment variables and redeploy.',
      503,
    )
  }
  return key
}

function sanitize(message: string, key: string) {
  return message.split(key).join('***').slice(0, 400)
}

function mapProviderError(code: number, rawMessage: string): ProviderError {
  const message = rawMessage || 'Unknown error from Twelve Data.'
  if (code === 401) {
    return new ProviderError('config', 'Twelve Data rejected the API key. Check TWELVE_DATA_API_KEY.', 502)
  }
  if (code === 403) {
    return new ProviderError('plan', `Not available on your Twelve Data plan: ${message}`, 403)
  }
  if (code === 429) {
    return new ProviderError('rate_limit', `Twelve Data rate limit hit: ${message}`, 429, 60)
  }
  if (code === 404 || (code === 400 && /symbol|not found|invalid/i.test(message))) {
    return new ProviderError('unsupported', `Twelve Data does not support this request: ${message}`, 404)
  }
  return new ProviderError('upstream', `Twelve Data error (${code}): ${message}`, 502)
}

export async function tdFetch<T>(path: string, params: Record<string, string>, credits = 1): Promise<T> {
  const key = apiKey()
  const budget = consumeCredits(credits)
  if (!budget.ok) throw new ProviderError('rate_limit', budget.message, 429, budget.retryAfterSeconds)

  const url = new URL(path, BASE_URL)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  let res: Response
  try {
    res = await fetch(url, {
      headers: { Authorization: `apikey ${key}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    })
  } catch {
    throw new ProviderError('upstream', 'Could not reach Twelve Data (network error or timeout).', 504)
  }

  const json = (await res.json().catch(() => null)) as
    | (T & { status?: string; code?: number; message?: string })
    | null
  if (!json) throw new ProviderError('upstream', `Twelve Data returned an unreadable response (${res.status}).`, 502)
  if (json.status === 'error' || !res.ok) {
    throw mapProviderError(Number(json.code ?? res.status), sanitize(String(json.message ?? ''), key))
  }
  return json
}

interface TimeSeriesJson {
  meta?: { symbol?: string; exchange?: string; currency?: string; type?: string }
  values?: { datetime: string; open: string; high: string; low: string; close: string; volume?: string }[]
}

function parseUtc(datetime: string) {
  const iso = datetime.length <= 10 ? `${datetime}T00:00:00Z` : `${datetime.replace(' ', 'T')}Z`
  return Math.floor(Date.parse(iso) / 1000)
}

function ttlFor(interval: Interval) {
  if (interval === '1min') return 60_000
  if (interval === '5min') return 120_000
  if (interval === '1day') return 15 * 60_000
  return 5 * 60_000
}

export interface SeriesRequest {
  symbol: string
  interval: Interval
  asset: AssetClass
  exchange?: string
  outputsize: number
}

export async function getSeries(req: SeriesRequest): Promise<MarketDataResponse> {
  const key = `ts:${req.symbol}:${req.exchange ?? ''}:${req.interval}:${req.outputsize}:${req.asset}`
  const { value, hit } = await cached(key, ttlFor(req.interval), 10 * 60_000, () => loadSeries(req))
  return { ...value, cached: hit }
}

async function loadSeries(req: SeriesRequest): Promise<MarketDataResponse> {
  const params: Record<string, string> = {
    symbol: req.symbol,
    interval: req.interval,
    outputsize: String(req.outputsize),
    timezone: 'UTC',
    order: 'ASC',
  }
  if (req.exchange) params.exchange = req.exchange

  const json = await tdFetch<TimeSeriesJson>('/time_series', params)
  const type = json.meta?.type ?? ''

  // Twelve Data often resolves futures roots (e.g. "ES") to unrelated equities (Eversource Energy).
  // Refuse to label those as futures rather than silently charting the wrong instrument.
  if (req.asset === 'future' && !/futur/i.test(type)) {
    const name = findCatalog(req.symbol, 'future')?.name ?? `${req.symbol} futures`
    const proxy = FUTURES_ETF_PROXY[req.symbol]
    const resolved = type
      ? `a ${type}${json.meta?.exchange ? ` on ${json.meta.exchange}` : ''}`
      : 'a non-futures instrument'
    throw new ProviderError(
      'unsupported',
      `Twelve Data resolved "${req.symbol}" to ${resolved}, not the ${name} contract. ` +
        `Futures for this contract are not available through your Twelve Data access, so no chart is shown.` +
        (proxy ? ` You can chart the ETF ${proxy} instead (it is not the futures contract).` : ''),
      404,
    )
  }

  const seen = new Set<number>()
  const bars: Bar[] = []
  for (const v of json.values ?? []) {
    const time = parseUtc(v.datetime)
    const bar: Bar = {
      time,
      open: Number(v.open),
      high: Number(v.high),
      low: Number(v.low),
      close: Number(v.close),
      volume: v.volume !== undefined ? Number(v.volume) : undefined,
    }
    if (!Number.isFinite(time) || seen.has(time) || ![bar.open, bar.high, bar.low, bar.close].every(Number.isFinite)) {
      continue
    }
    seen.add(time)
    bars.push(bar)
  }
  bars.sort((a, b) => a.time - b.time)

  if (bars.length === 0) {
    throw new ProviderError('unsupported', `Twelve Data returned no bars for ${req.symbol} at ${req.interval}.`, 404)
  }

  return {
    symbol: req.symbol,
    interval: req.interval,
    asset: req.asset,
    meta: { exchange: json.meta?.exchange, currency: json.meta?.currency, type: json.meta?.type },
    bars,
    fetchedAt: new Date().toISOString(),
    cached: false,
  }
}

export function errorResponse(error: unknown) {
  const err =
    error instanceof ProviderError
      ? error
      : new ProviderError('upstream', 'Unexpected server error while loading market data.', 500)
  if (!(error instanceof ProviderError)) console.error('[market-data] unexpected error', error)
  const body: ApiErrorBody = {
    error: { kind: err.kind, message: err.message, retryAfterSeconds: err.retryAfterSeconds },
  }
  const headers: Record<string, string> = { 'Cache-Control': 'no-store' }
  if (err.retryAfterSeconds) headers['Retry-After'] = String(err.retryAfterSeconds)
  return NextResponse.json(body, { status: err.status, headers })
}

export function invalid(message: string) {
  return errorResponse(new ProviderError('invalid', message, 400))
}

export const SYMBOL_RE = /^[A-Za-z0-9.\-/:^!]{1,20}$/
export const EXCHANGE_RE = /^[A-Za-z0-9 .\-]{1,30}$/
