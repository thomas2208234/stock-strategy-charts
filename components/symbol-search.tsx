"use client"

import clsx from "clsx"
import { Loader2, Search } from "lucide-react"
import { useEffect, useState } from "react"
import useSWR from "swr"
import { Modal } from "@/components/ui"
import { FetchError, jsonFetcher } from "@/lib/client"
import { FUTURES_PRESETS, STOCK_PRESETS, SYMBOL_PATTERN, type PresetSymbol, type SearchResult } from "@/lib/market"

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export function SymbolSearch({
  open,
  title,
  onClose,
  onSelect,
}: {
  open: boolean
  title: string
  onClose: () => void
  onSelect: (symbol: string) => void
}) {
  const [query, setQuery] = useState("")
  const q = useDebounced(query.trim(), 450)
  const { data, error, isLoading } = useSWR<{ results: SearchResult[] }, FetchError>(
    open && q.length >= 1 ? `/api/search?q=${encodeURIComponent(q)}` : null,
    jsonFetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  )

  const pick = (s: string) => {
    onSelect(s.toUpperCase())
    setQuery("")
    onClose()
  }

  const results = (data?.results ?? []).filter((r) => r.type !== "Index").slice(0, 15)

  return (
    <Modal open={open} onClose={onClose} title={title} wide>
      <div className="flex flex-col">
        <form
          className="sticky top-0 z-10 border-b bg-panel p-3"
          onSubmit={(e) => {
            e.preventDefault()
            const s = query.trim().toUpperCase()
            if (SYMBOL_PATTERN.test(s)) pick(s)
          }}
        >
          <label htmlFor="symbol-search" className="sr-only">
            Search symbols
          </label>
          <div className="flex items-center gap-2 rounded-md border bg-background px-3">
            <Search className="size-4 text-muted-foreground" aria-hidden />
            <input
              id="symbol-search"
              autoFocus
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ticker or company (e.g. AMD, Netflix)"
              className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Searching" />}
          </div>
        </form>

        {q.length >= 1 ? (
          <div className="flex flex-col">
            {error && <p className="px-4 py-3 text-sm text-down">{error.message}</p>}
            {!error && !isLoading && results.length === 0 && (
              <p className="px-4 py-3 text-sm text-muted-foreground">No matching instruments on Twelve Data.</p>
            )}
            <ul>
              {results.map((r) => (
                <li key={`${r.symbol}-${r.exchange}`}>
                  <button
                    type="button"
                    onClick={() => pick(r.symbol)}
                    className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-panel-raised"
                  >
                    <span className="w-20 shrink-0 font-mono text-sm font-semibold">{r.symbol}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{r.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {r.exchange}
                      {r.plan ? ` · ${r.plan}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {results.length > 0 && (
              <p className="px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                The last column shows the exchange and the minimum Twelve Data plan for that instrument. Symbols above your
                plan will return a plan error when charted.
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4 p-4">
            <PresetGroup title="Popular stocks & ETFs" items={STOCK_PRESETS} onPick={pick} />
            <PresetGroup title="Index futures" items={FUTURES_PRESETS} onPick={pick} />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Twelve Data does not provide CME index futures (ES, NQ, YM, RTY and micros) on its standard plans. They are listed
              here so you can see what is unavailable. Choosing one shows an explanation and offers a tracking ETF as a labeled
              proxy instead.
            </p>
          </div>
        )}
      </div>
    </Modal>
  )
}

function PresetGroup({ title, items, onPick }: { title: string; items: PresetSymbol[]; onPick: (s: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</h3>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {items.map((p) => (
          <button
            key={p.symbol}
            type="button"
            onClick={() => onPick(p.symbol)}
            className={clsx(
              "flex flex-col items-start rounded-md border px-2 py-1.5 text-left hover:bg-panel-raised",
              p.kind === "futures" && "border-dashed",
            )}
          >
            <span className="font-mono text-sm font-semibold">{p.symbol}</span>
            <span className="w-full truncate text-xs text-muted-foreground">
              {p.kind === "futures" ? "Unavailable" : p.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
