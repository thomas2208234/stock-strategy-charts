import { NextResponse, type NextRequest } from "next/server"
import { guardClient } from "@/lib/client-guard.server"
import { SYMBOL_PATTERN, findPreset, isInterval, type Candle, type MarketDataResponse } from "@/lib/market"
import {
  cacheTtlForInterval,
  classifyFreshness,
  dedupe,
  errorBody,
  getCached,
  parseDatetime,
  ProviderError,
  setCached,
  tryConsumeCredits,
  twelveDataFetch,
} from "@/lib/twelvedata.server"

export const dynamic = "force-dynamic"

const ALLOWED_SIZES = new Set([200, 500, 1000, 2000])

interface TimeSeriesBody {
  meta?: { symbol?: string; exchange?: string; exchange_timezone?: string; currency?: string; type?: string }
  values?: { datetime: string; open: string; high: string; low: string; close: string; volume?: string }[]
}

type CachedSeries = Omit<MarketDataResponse, "cached" | "stale" | "freshness">

export async function GET(req: NextRequest) {
  const blocked = guardClient(req)
  if (blocked) return blocked

  const sp = req.nextUrl.searchParams
  const symbol = (sp.get("symbol") ?? "").trim().toUpperCase()
  const interval = sp.get("interval") ?? ""
  const size = Number(sp.get("outputsize") ?? 500)

  if (!SYMBOL_PATTERN.test(symbol)) {
    return NextResponse.json({ ok: false, kind: "invalid_request", message: "Invalid symbol." }, { status: 400 })
  }
  if (!isInterval(interval)) {
    return NextResponse.json({ ok: false, kind: "invalid_request", message: "Unsupported timeframe." }, { status: 400 })
  }
  const preset = findPreset(symbol)
  if (preset?.kind === "futures") {
    // Bare roots collide with equities on Twelve Data (e.g. "ES" is Eversource Energy), so never chart them as futures.
    return NextResponse.json(
      {
        ok: false,
        kind: "unsupported",
        message: `${symbol} (${preset.name}) is a CME futures contract. Twelve Data does not provide CME index futures on its standard plans, and the bare ticker "${symbol}" maps to a different instrument there, so no data is shown. You can view ${preset.proxy} — an ETF that tracks the same index — as a labeled proxy, or connect a futures data provider.`,
      },
      { status: 422 },
    )
  }
  const outputsize = ALLOWED_SIZES.has(size) ? size : 500
  const key = `ts:${symbol}:${interval}:${outputsize}`

  const cached = getCached<CachedSeries>(key)
  if (cached?.fresh) return respond(cached.value, true, false)

  const credit = tryConsumeCredits(1)
  if (!credit.ok) {
    if (cached) return respond(cached.value, true, true)
    return NextResponse.json(
      {
        ok: false,
        kind: "rate_limited",
        message: `Holding requests to stay within your plan's per-minute credit limit. Retrying in ~${credit.retryAfterSeconds}s.`,
        retryAfterSeconds: credit.retryAfterSeconds,
      },
      { status: 429, headers: { "Retry-After": String(credit.retryAfterSeconds) } },
    )
  }

  try {
    const data = await dedupe(key, async () => {
      const body = await twelveDataFetch<TimeSeriesBody>("/time_series", {
        symbol,
        interval,
        outputsize: String(outputsize),
        timezone: "UTC",
        order: "asc",
      })
      const values = body.values ?? []
      if (values.length === 0) {
        throw new ProviderError("unsupported", `Twelve Data returned no bars for ${symbol} (${interval}).`, 404)
      }
      const candles: Candle[] = values
        .map((v) => ({
          time: parseDatetime(v.datetime),
          open: Number(v.open),
          high: Number(v.high),
          low: Number(v.low),
          close: Number(v.close),
          volume: Number(v.volume ?? 0) || 0,
        }))
        .filter((c) => Number.isFinite(c.time) && Number.isFinite(c.close))
        .sort((a, b) => a.time - b.time)
        .filter((c, i, arr) => i === 0 || c.time !== arr[i - 1].time)

      const result: CachedSeries = {
        ok: true,
        symbol: body.meta?.symbol ?? symbol,
        interval,
        meta: {
          exchange: body.meta?.exchange,
          exchangeTimezone: body.meta?.exchange_timezone,
          currency: body.meta?.currency,
          type: body.meta?.type,
        },
        candles,
        fetchedAt: Date.now(),
        source: "Twelve Data",
      }
      setCached(key, result, cacheTtlForInterval(interval))
      return result
    })
    return respond(data, false, false)
  } catch (err) {
    if (cached && err instanceof ProviderError && err.kind === "rate_limited") {
      return respond(cached.value, true, true)
    }
    const { body, status } = errorBody(err)
    return NextResponse.json(body, { status })
  }
}

function respond(data: CachedSeries, cached: boolean, stale: boolean) {
  const last = data.candles.at(-1)?.time ?? null
  const payload: MarketDataResponse = {
    ...data,
    cached,
    stale,
    freshness: classifyFreshness(last, data.interval, data.meta.exchangeTimezone),
  }
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } })
}
