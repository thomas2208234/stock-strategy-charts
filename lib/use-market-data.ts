'use client'

import useSWR from 'swr'
import type { ApiErrorBody, ApiErrorKind, AssetClass, Interval, MarketDataResponse } from './types'

export class MarketDataError extends Error {
  constructor(
    public kind: ApiErrorKind,
    message: string,
    public retryAfterSeconds?: number,
  ) {
    super(message)
  }
}

export async function jsonFetcher<T>(url: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(url)
  } catch {
    throw new MarketDataError('upstream', 'Network error — check your connection.')
  }
  const body = (await res.json().catch(() => null)) as (T & Partial<ApiErrorBody>) | null
  if (!res.ok || !body || body.error) {
    const err = body?.error
    throw new MarketDataError(err?.kind ?? 'upstream', err?.message ?? `Request failed (${res.status}).`, err?.retryAfterSeconds)
  }
  return body
}

export interface ChartTarget {
  symbol: string
  asset: AssetClass
  exchange?: string
  interval: Interval
}

export function marketDataKey(t: ChartTarget, outputsize: number) {
  const params = new URLSearchParams({ symbol: t.symbol, interval: t.interval, asset: t.asset, outputsize: String(outputsize) })
  if (t.exchange) params.set('exchange', t.exchange)
  return `/api/market-data?${params.toString()}`
}

const NON_RETRYABLE: ApiErrorKind[] = ['config', 'invalid', 'unsupported', 'plan']

export function useMarketData(target: ChartTarget, outputsize: number, refreshSeconds: number) {
  return useSWR<MarketDataResponse, MarketDataError>(marketDataKey(target, outputsize), jsonFetcher, {
    refreshInterval: refreshSeconds > 0 ? refreshSeconds * 1000 : 0,
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
    keepPreviousData: false,
    onErrorRetry: (error, _key, _config, revalidate, { retryCount }) => {
      if (NON_RETRYABLE.includes(error.kind) || retryCount >= 3) return
      const delay = error.kind === 'rate_limit' ? (error.retryAfterSeconds ?? 60) * 1000 + 1000 : 5000 * 2 ** retryCount
      setTimeout(() => revalidate({ retryCount }), delay)
    },
  })
}
