import "server-only"
import { NextResponse, type NextRequest } from "next/server"
import type { ApiErrorResponse } from "@/lib/market"

const hits = new Map<string, number[]>()
const WINDOW_MS = 60_000
const MAX_REQUESTS_PER_WINDOW = 90

/** Per-client request cap so a public deployment can't be used to drain provider credits. */
export function guardClient(req: NextRequest): NextResponse<ApiErrorResponse> | null {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local"
  const now = Date.now()
  const list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  if (list.length >= MAX_REQUESTS_PER_WINDOW) {
    hits.set(ip, list)
    return NextResponse.json(
      { ok: false, kind: "rate_limited", message: "Too many requests from this browser. Slow down.", retryAfterSeconds: 30 },
      { status: 429, headers: { "Retry-After": "30" } },
    )
  }
  list.push(now)
  hits.set(ip, list)
  if (hits.size > 5000) hits.clear()
  return null
}
