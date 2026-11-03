import { NextResponse, type NextRequest } from "next/server"
import { guardClient } from "@/lib/client-guard.server"
import type { StatusResponse } from "@/lib/market"
import {
  creditsPerMinute,
  errorBody,
  getApiKey,
  getCached,
  ProviderError,
  setCached,
  tryConsumeCredits,
  twelveDataFetch,
} from "@/lib/twelvedata.server"

export const dynamic = "force-dynamic"

interface RawUsage {
  current_usage?: number
  plan_limit?: number
  daily_usage?: number
  plan_daily_limit?: number
  plan_category?: string
}

export async function GET(req: NextRequest) {
  const blocked = guardClient(req)
  if (blocked) return blocked

  const base = { ok: true as const, localCreditsPerMinute: creditsPerMinute(), checkedAt: Date.now() }

  if (!getApiKey()) {
    const payload: StatusResponse = {
      ...base,
      configured: false,
      connected: false,
      message: "TWELVE_DATA_API_KEY is not set on the server.",
    }
    return NextResponse.json(payload)
  }

  const hit = getCached<StatusResponse>("status")
  if (hit?.fresh) return NextResponse.json(hit.value)

  if (!tryConsumeCredits(1).ok) {
    if (hit) return NextResponse.json(hit.value)
    return NextResponse.json({ ...base, configured: true, connected: true, message: "Usage check deferred (credit limit)." })
  }

  try {
    const u = await twelveDataFetch<RawUsage>("/api_usage", {})
    const payload: StatusResponse = {
      ...base,
      configured: true,
      connected: true,
      plan: u.plan_category,
      minuteUsage: u.current_usage,
      minuteLimit: u.plan_limit,
      dailyUsage: u.daily_usage,
      dailyLimit: u.plan_daily_limit,
    }
    setCached("status", payload, 3 * 60_000)
    return NextResponse.json(payload)
  } catch (err) {
    if (err instanceof ProviderError && err.kind !== "missing_key" && err.kind !== "network") {
      const { body } = errorBody(err)
      return NextResponse.json({ ...base, configured: true, connected: err.kind === "rate_limited", message: body.message })
    }
    const { body } = errorBody(err)
    return NextResponse.json({ ...base, configured: true, connected: false, message: body.message })
  }
}
