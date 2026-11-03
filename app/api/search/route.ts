import { NextResponse, type NextRequest } from "next/server"
import { guardClient } from "@/lib/client-guard.server"
import type { SearchResult } from "@/lib/market"
import { dedupe, errorBody, getCached, setCached, tryConsumeCredits, twelveDataFetch } from "@/lib/twelvedata.server"

export const dynamic = "force-dynamic"

interface RawSearch {
  data?: {
    symbol: string
    instrument_name: string
    exchange: string
    instrument_type: string
    country: string
    currency: string
    access?: { plan?: string; global?: string }
  }[]
}

export async function GET(req: NextRequest) {
  const blocked = guardClient(req)
  if (blocked) return blocked

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim()
  if (q.length < 1 || q.length > 32 || !/^[\w .\-/&]+$/.test(q)) {
    return NextResponse.json({ ok: false, kind: "invalid_request", message: "Enter a valid search term." }, { status: 400 })
  }

  const key = `search:${q.toLowerCase()}`
  const hit = getCached<SearchResult[]>(key)
  if (hit?.fresh) return NextResponse.json({ ok: true, results: hit.value, cached: true })

  const credit = tryConsumeCredits(1)
  if (!credit.ok) {
    if (hit) return NextResponse.json({ ok: true, results: hit.value, cached: true })
    return NextResponse.json(
      {
        ok: false,
        kind: "rate_limited",
        message: `Search paused to protect your credit limit. Try again in ~${credit.retryAfterSeconds}s.`,
        retryAfterSeconds: credit.retryAfterSeconds,
      },
      { status: 429 },
    )
  }

  try {
    const results = await dedupe(key, async () => {
      const body = await twelveDataFetch<RawSearch>("/symbol_search", { symbol: q, outputsize: "20", show_plan: "true" })
      const mapped: SearchResult[] = (body.data ?? []).map((d) => ({
        symbol: d.symbol,
        name: d.instrument_name,
        exchange: d.exchange,
        type: d.instrument_type,
        country: d.country,
        currency: d.currency,
        plan: d.access?.plan ?? d.access?.global,
      }))
      setCached(key, mapped, 24 * 60 * 60_000)
      return mapped
    })
    return NextResponse.json({ ok: true, results, cached: false })
  } catch (err) {
    const { body, status } = errorBody(err)
    return NextResponse.json(body, { status })
  }
}
