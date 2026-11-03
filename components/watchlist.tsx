"use client"

import clsx from "clsx"
import { Loader2, Plus, X } from "lucide-react"
import useSWR from "swr"
import { FetchError, formatPrice, formatTimestamp, jsonFetcher } from "@/lib/client"
import type { QuotesResponse } from "@/lib/market"

export function Watchlist({
  symbols,
  timeZone,
  autoRefresh,
  onPick,
  onAdd,
  onRemove,
}: {
  symbols: string[]
  timeZone: string
  autoRefresh: boolean
  onPick: (symbol: string) => void
  onAdd: () => void
  onRemove: (symbol: string) => void
}) {
  const key = symbols.length ? `/api/quote?symbols=${encodeURIComponent(symbols.join(","))}` : null
  const { data, error, isLoading } = useSWR<QuotesResponse, FetchError>(key, jsonFetcher, {
    refreshInterval: autoRefresh ? 180_000 : 0,
    revalidateOnFocus: false,
    keepPreviousData: true,
  })
  const bySymbol = new Map(data?.quotes.map((q) => [q.symbol, q]))

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Watchlist</h2>
        <button
          type="button"
          onClick={onAdd}
          disabled={symbols.length >= 12}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-panel-raised hover:text-foreground disabled:opacity-40"
        >
          <Plus className="size-3.5" aria-hidden />
          Add
        </button>
      </div>

      {error && !data && <p className="px-4 pb-3 text-xs leading-relaxed text-down">{error.message}</p>}
      {isLoading && !data && (
        <p className="flex items-center gap-2 px-4 pb-3 text-xs text-muted-foreground" role="status">
          <Loader2 className="size-3.5 animate-spin" aria-hidden /> Loading quotes…
        </p>
      )}

      <ul className="flex flex-col">
        {symbols.map((s) => {
          const q = bySymbol.get(s)
          const pct = q?.percentChange
          return (
            <li key={s} className="group flex items-center border-t">
              <button
                type="button"
                onClick={() => onPick(s)}
                className="flex min-w-0 flex-1 items-center gap-2 px-4 py-2 text-left hover:bg-panel-raised"
                title="Load in the selected chart"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-mono text-sm font-semibold">{s}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {q?.error ?? q?.name ?? (data ? "—" : "")}
                  </span>
                </span>
                <span className="flex flex-col items-end">
                  <span className="font-mono text-sm">{formatPrice(q?.price)}</span>
                  <span
                    className={clsx(
                      "font-mono text-xs",
                      pct == null ? "text-muted-foreground" : pct >= 0 ? "text-up" : "text-down",
                    )}
                  >
                    {pct == null ? "—" : `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => onRemove(s)}
                className="px-2 py-2 text-muted-foreground opacity-60 hover:text-foreground group-hover:opacity-100"
                aria-label={`Remove ${s} from watchlist`}
              >
                <X className="size-3.5" />
              </button>
            </li>
          )
        })}
      </ul>

      {data && (
        <p className="border-t px-4 py-2 text-xs leading-relaxed text-muted-foreground">
          Quotes from Twelve Data, updated {formatTimestamp(Math.floor(data.fetchedAt / 1000), timeZone, false)}
          {data.cached ? " (cached)" : ""}. Real-time vs. delayed depends on your plan.
        </p>
      )}
    </div>
  )
}
