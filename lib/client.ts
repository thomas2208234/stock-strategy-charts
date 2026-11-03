"use client"

import { useCallback, useEffect, useState } from "react"
import type { ApiErrorResponse } from "@/lib/market"
import { DEFAULT_SETTINGS, mergeSettings, STORAGE_KEY, type AppSettings } from "@/lib/settings"

export class FetchError extends Error {
  kind: ApiErrorResponse["kind"]
  status: number
  retryAfterSeconds?: number
  constructor(body: ApiErrorResponse, status: number) {
    super(body.message)
    this.kind = body.kind
    this.status = status
    this.retryAfterSeconds = body.retryAfterSeconds
  }
}

export async function jsonFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url)
  let body: unknown
  try {
    body = await res.json()
  } catch {
    throw new FetchError({ ok: false, kind: "network", message: `Server returned HTTP ${res.status}.` }, res.status)
  }
  if (!res.ok || (body as { ok?: boolean }).ok === false) {
    throw new FetchError(body as ApiErrorResponse, res.status)
  }
  return body as T
}

/** Chart layout and indicator preferences are saved locally in this browser. */
export function usePersistentSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) setSettings(mergeSettings(JSON.parse(raw)))
    } catch {
      /* corrupted storage falls back to defaults */
    }
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (!loaded) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {
      /* storage full or disabled */
    }
  }, [settings, loaded])

  const update = useCallback((fn: (prev: AppSettings) => AppSettings) => setSettings(fn), [])
  const reset = useCallback(() => setSettings(DEFAULT_SETTINGS), [])
  return { settings, update, reset, loaded }
}

export function formatPrice(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—"
  const abs = Math.abs(v)
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 2 : 4
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function formatTimestamp(unixSec: number, timeZone: string, withDate = true): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      month: withDate ? "short" : undefined,
      day: withDate ? "numeric" : undefined,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZoneName: "short",
    }).format(new Date(unixSec * 1000))
  } catch {
    return new Date(unixSec * 1000).toISOString()
  }
}
