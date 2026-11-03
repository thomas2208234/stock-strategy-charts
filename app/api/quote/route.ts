import { NextResponse, type NextRequest } from "next/server"
import { guardClient } from "@/lib/client-guard.server"
import { SYMBOL_PATTERN, findPreset, type QuoteItem, type QuotesResponse } from "@/lib/market"
import {
  dedupe,
  errorBody,
  getCached,
  ProviderError,
  setCached,
  tryConsumeCredits,
  twelveDataFetch,
} from "@/lib/twelvedata.server"

export const dynamic = "force-dynamic"

const MAX_SYMBOLS = 12
const TTL_MS = 90_000

interface RawQuote {
  symbol?: string
  name?: string
  close?: string
  change?: string
  percent_change?: string
  is_market_open?: boolean
  timestamp?: number
  last_quote_at?: number
  status?: string
  code?: number
  message?: string
}

function toNum(v: string | undefined): number | null {
  const n = Number(v)
  return v != null && Number.isFinite(n) ? n : null
}

function normalize(symbol: string, raw: RawQuote | undefined): QuoteItem {
  if (!raw || raw.status === "error") {
    return {
      symbol,
      price: null,
      change: null,
      percentChange: null,
      isMarketOpen: null,
      timestamp: null,
      error: raw?.message ? raw.message.split(".")[0] : "Unavailable",
    }
  }
  return {
    symbol,
    name: raw.name,
    price: toNum(raw.close),
    change: toNum(raw.change),
    percentChange: toNum(raw.percent_change),
    isMarketOpen: typeof raw.is_market_open === "boolean" ? raw.is_market_open : null,
    timestamp: raw.last_quote_at ?? raw.timestamp ?? null,
  }
}

export async function GET(req: NextRequest) {
  const blocked = guardClient(req)
  if (blocked) return blocked

  const symbols = Array.from(
    new Set(
      (req.nextUrl.searchParams.get("symbols") ?? "")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter((s) => SYMBOL_PATTERN.test(s)),
    ),
  ).slice(0, MAX_SYMBOLS)

  if (symbols.length === 0) {
    return NextResponse.json({ ok: false, kind: "invalid_request", message: "No valid symbols." }, { status: 400 })
  }

  const results = new Map<string, QuoteItem>()
  const missing: string[] = []
  for (const s of symbols) {
    if (findPreset(s)?.kind === "futures") {
      results.set(s, {
        symbol: s,
        price: null,
        change: null,
        percentChange: null,
        isMarketOpen: null,
        timestamp: null,
        error: "Futures not on Twelve Data",
      })
      continue
    }
    const hit = getCached<QuoteItem>(`q:${s}`)
    if (hit?.fresh) results.set(s, hit.value)
    else missing.push(s)
  }

  let usedCache = missing.length === 0
  if (missing.length > 0) {
    const credit = tryConsumeCredits(missing.length)
    if (!credit.ok) {
      usedCache = true
      for (const s of missing) {
        const stale = getCached<QuoteItem>(`q:${s}`)
        results.set(
          s,
          stale?.value ?? {
            symbol: s,
            price: null,
            change: null,
            percentChange: null,
            isMarketOpen: null,
            timestamp: null,
            error: "Waiting for credits",
          },
        )
      }
    } else {
      try {
        const joined = missing.join(",")
        const body = await dedupe(`q:${joined}`, () =>
          twelveDataFetch<Record<string, RawQuote> | RawQuote>("/quote", { symbol: joined }),
        )
        for (const s of missing) {
          const raw = missing.length === 1 ? (body as RawQuote) : (body as Record<string, RawQuote>)[s]
          const item = normalize(s, raw)
          results.set(s, item)
          if (!item.error) setCached(`q:${s}`, item, TTL_MS)
        }
      } catch (err) {
        if (err instanceof ProviderError && (err.kind === "missing_key" || results.size === 0)) {
          const { body, status } = errorBody(err)
          return NextResponse.json(body, { status })
        }
        for (const s of missing) results.set(s, normalize(s, { status: "error", message: (err as Error).message }))
      }
    }
  }

  const payload: QuotesResponse = {
    ok: true,
    quotes: symbols.map((s) => results.get(s)!),
    fetchedAt: Date.now(),
    cached: usedCache,
  }
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } })
}
