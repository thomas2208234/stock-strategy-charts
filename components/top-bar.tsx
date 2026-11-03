"use client"

import clsx from "clsx"
import { CandlestickChart, Settings } from "lucide-react"
import useSWR from "swr"
import { jsonFetcher } from "@/lib/client"
import type { StatusResponse } from "@/lib/market"

export function TopBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { data, error } = useSWR<StatusResponse>("/api/status", jsonFetcher, {
    refreshInterval: 5 * 60_000,
    revalidateOnFocus: false,
  })

  const state = error ? "error" : !data ? "checking" : !data.configured ? "missing" : data.connected ? "ok" : "error"
  const label = {
    checking: "Checking connection…",
    ok: "Twelve Data connected",
    missing: "API key not configured",
    error: "Data provider unreachable",
  }[state]
  const usage =
    data?.minuteLimit != null
      ? `${data.plan ? `${data.plan} · ` : ""}${data.minuteUsage ?? 0}/${data.minuteLimit} credits/min${
          data.dailyLimit ? ` · ${data.dailyUsage ?? 0}/${data.dailyLimit} today` : ""
        }`
      : null

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-panel px-3">
      <div className="flex items-center gap-2">
        <CandlestickChart className="size-5 text-primary" aria-hidden />
        <h1 className="text-sm font-semibold tracking-tight">Strategy Charts</h1>
      </div>
      <div
        className="ml-auto flex min-w-0 items-center gap-2 text-xs text-muted-foreground"
        role="status"
        title={data?.message ?? error?.message ?? label}
      >
        <span
          className={clsx(
            "size-2 shrink-0 rounded-full",
            state === "ok" && "bg-up",
            state === "missing" && "bg-warn",
            state === "error" && "bg-down",
            state === "checking" && "animate-pulse bg-muted-foreground",
          )}
          aria-hidden
        />
        <span className="truncate">{label}</span>
        {usage && <span className="hidden truncate font-mono md:inline">· {usage}</span>}
      </div>
      <button
        type="button"
        onClick={onOpenSettings}
        className="rounded-md p-1.5 text-muted-foreground hover:bg-panel-raised hover:text-foreground"
        aria-label="Chart settings"
      >
        <Settings className="size-4" />
      </button>
    </header>
  )
}
