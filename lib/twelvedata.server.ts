import "server-only"
import type { ApiErrorKind, ApiErrorResponse, Freshness, Interval } from "@/lib/market"
import { intervalSeconds } from "@/lib/market"

const BASE_URL = "https://api.twelvedata.com"

export function getApiKey(): string | null {
  const key = process.env.TWELVE_DATA_API_KEY
  return key && key.trim().length > 0 ? key.trim() : null
}

export function creditsPerMinute(): number {
  const raw = Number(process.env.TWELVE_DATA_CREDITS_PER_MINUTE)
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 8
}

/* ---------------- Credit throttle (best effort, per server instance) ---------------- */

const creditLog: number[] = []

function pruneCredits(now: number) {
  while (creditLog.length > 0 && now - creditLog[0] > 60_000) creditLog.shift()
}

export function tryConsumeCredits(cost: number): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const now = Date.now()
  pruneCredits(now)
  const limit = creditsPerMinute()
  if (creditLog.length + cost > limit) {
    const oldest = creditLog[0] ?? now
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((60_000 - (now - oldest)) / 1000)) }
  }
  for (let i = 0; i < cost; i++) creditLog.push(now)
  return { ok: true }
}

/* ---------------- Response cache + in-flight dedupe ---------------- */

interface CacheEntry<T> {
  value: T
  storedAt: number
  expiresAt: number
}

const cache = new Map<string, CacheEntry<unknown>>()
const inflight = new Map<string, Promise<unknown>>()
const MAX_CACHE_ENTRIES = 500

export function getCached<T>(key: string): { value: T; fresh: boolean; storedAt: number } | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined
  if (!entry) return null
  return { value: entry.value, fresh: Date.now() < entry.expiresAt, storedAt: entry.storedAt }
}

export function setCached<T>(key: string, value: T, ttlMs: number) {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = cache.keys().next().value
    if (firstKey) cache.delete(firstKey)
  }
  const now = Date.now()
  cache.set(key, { value, storedAt: now, expiresAt: now + ttlMs })
}

export async function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined
  if (existing) return existing
  const p = fn().finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

export function cacheTtlForInterval(interval: Interval): number {
  if (interval === "1day") return 15 * 60_000
  const half = (intervalSeconds(interval) * 1000) / 2
  return Math.min(Math.max(half, 30_000), 5 * 60_000)
}

/* ---------------- Fetch + error mapping ---------------- */

export class ProviderError extends Error {
  kind: ApiErrorKind
  status: number
  retryAfterSeconds?: number
  constructor(kind: ApiErrorKind, message: string, status: number, retryAfterSeconds?: number) {
    super(message)
    this.kind = kind
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export async function twelveDataFetch<T = Record<string, unknown>>(
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const key = getApiKey()
  if (!key) {
    throw new ProviderError(
      "missing_key",
      "TWELVE_DATA_API_KEY is not configured on the server. Add it in your Vercel project environment variables.",
      503,
    )
  }
  const url = new URL(path, BASE_URL)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  let res: Response
  try {
    // API key is sent as a header so it never appears in URLs or logs.
    res = await fetch(url, {
      headers: { Authorization: `apikey ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    })
  } catch {
    throw new ProviderError("network", "Could not reach Twelve Data. Check your connection and try again.", 502)
  }

  let body: Record<string, unknown>
  try {
    body = (await res.json()) as Record<string, unknown>
  } catch {
    throw new ProviderError("provider_error", `Twelve Data returned an unreadable response (HTTP ${res.status}).`, 502)
  }

  if (body && body.status === "error") {
    throw mapProviderError(Number(body.code ?? res.status), String(body.message ?? "Unknown provider error"))
  }
  if (!res.ok) {
    throw mapProviderError(res.status, String(body?.message ?? `HTTP ${res.status}`))
  }
  return body as T
}

function mapProviderError(code: number, message: string): ProviderError {
  const clean = message.replace(/apikey=[^&\s]+/gi, "apikey=***")
  if (code === 401) {
    return new ProviderError("missing_key", "Twelve Data rejected the API key. Verify TWELVE_DATA_API_KEY.", 401)
  }
  if (code === 429) {
    return new ProviderError(
      "rate_limited",
      "Twelve Data rate limit reached for your plan. Requests will resume shortly.",
      429,
      60,
    )
  }
  if (code === 403 || /plan|upgrade|pricing/i.test(clean)) {
    return new ProviderError("plan_restricted", `Not included in your Twelve Data plan: ${clean}`, 403)
  }
  if (code === 404 || /not found|invalid|symbol/i.test(clean)) {
    return new ProviderError("unsupported", `Twelve Data does not provide this instrument/timeframe: ${clean}`, 404)
  }
  if (code === 400) return new ProviderError("invalid_request", clean, 400)
  return new ProviderError("provider_error", clean, 502)
}

export function errorBody(err: unknown): { body: ApiErrorResponse; status: number } {
  if (err instanceof ProviderError) {
    return {
      body: { ok: false, kind: err.kind, message: err.message, retryAfterSeconds: err.retryAfterSeconds },
      status: err.status,
    }
  }
  console.error("[market-data] unexpected error", err)
  return { body: { ok: false, kind: "provider_error", message: "Unexpected server error." }, status: 500 }
}

/* ---------------- Freshness classification ---------------- */

function nyClock(date: Date): { weekday: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ""
  return { weekday: get("weekday"), minutes: Number(get("hour")) * 60 + Number(get("minute")) }
}

function isUsRegularSession(date: Date): boolean {
  const { weekday, minutes } = nyClock(date)
  if (weekday === "Sat" || weekday === "Sun") return false
  return minutes >= 9 * 60 + 30 && minutes < 16 * 60
}

function fmtAge(seconds: number): string {
  if (seconds < 90) return `${Math.round(seconds)}s`
  if (seconds < 5400) return `${Math.round(seconds / 60)}m`
  if (seconds < 172800) return `${Math.round(seconds / 3600)}h`
  return `${Math.round(seconds / 86400)}d`
}

export function classifyFreshness(
  lastBarOpen: number | null,
  interval: Interval,
  exchangeTimezone: string | undefined,
): Freshness {
  if (lastBarOpen == null) {
    return { status: "unknown", label: "No data", detail: "No bars returned.", lastBarAt: null, ageSeconds: null }
  }
  const nowSec = Date.now() / 1000
  const ivl = intervalSeconds(interval)
  const age = Math.max(0, nowSec - lastBarOpen)

  if (interval === "1day") {
    return {
      status: "historical",
      label: "Daily bars",
      detail: "Daily candles from Twelve Data. The latest candle may be in progress or end-of-day depending on your plan.",
      lastBarAt: lastBarOpen,
      ageSeconds: age,
    }
  }

  const isUS = exchangeTimezone === "America/New_York"
  const sessionOpen = isUS ? isUsRegularSession(new Date()) : null
  const behind = Math.max(0, age - ivl)

  if (sessionOpen === false) {
    return {
      status: "closed",
      label: "Market closed",
      detail:
        "US regular session is closed. Showing the most recent bars; real-time entitlement cannot be verified until the session reopens.",
      lastBarAt: lastBarOpen,
      ageSeconds: age,
    }
  }
  if (behind <= 120) {
    return {
      status: "recent",
      label: "Near real-time",
      detail: `Latest bar opened ${fmtAge(age)} ago. Timing is consistent with real-time, but Twelve Data does not label latency per bar — confirm your plan's entitlement.`,
      lastBarAt: lastBarOpen,
      ageSeconds: age,
    }
  }
  if (sessionOpen === true) {
    return {
      status: "delayed",
      label: `Delayed ~${fmtAge(behind)}`,
      detail: `Session is open but the latest bar is ~${fmtAge(behind)} behind. Your plan likely provides delayed data for this instrument.`,
      lastBarAt: lastBarOpen,
      ageSeconds: age,
    }
  }
  return {
    status: "unknown",
    label: `Last bar ${fmtAge(age)} ago`,
    detail: "Session hours for this exchange are not tracked, so delay cannot be determined.",
    lastBarAt: lastBarOpen,
    ageSeconds: age,
  }
}

/** Parses Twelve Data datetimes. Intraday requested with timezone=UTC; daily values are dates. */
export function parseDatetime(value: string): number {
  const iso = value.length <= 10 ? `${value}T00:00:00Z` : `${value.replace(" ", "T")}Z`
  return Math.floor(Date.parse(iso) / 1000)
}
