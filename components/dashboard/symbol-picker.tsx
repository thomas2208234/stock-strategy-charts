'use client'

import clsx from 'clsx'
import { ChevronDown, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { ASSET_LABEL, CATALOG } from '@/lib/catalog'
import { jsonFetcher, type MarketDataError } from '@/lib/use-market-data'
import type { Instrument } from '@/lib/types'

type SearchResult = Instrument & { type: string; country?: string }

export function SymbolPicker({ current, onSelect }: { current: Instrument; onSelect: (inst: Instrument) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data, error, isLoading } = useSWR<{ results: SearchResult[] }, MarketDataError>(
    submitted ? `/api/search?q=${encodeURIComponent(submitted)}` : null,
    jsonFetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  )

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const q = query.trim().toUpperCase()
  const local = CATALOG.filter((i) => !q || i.symbol.includes(q) || i.name.toUpperCase().includes(q))

  const choose = (inst: Instrument) => {
    onSelect(inst)
    setOpen(false)
    setQuery('')
    setSubmitted('')
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex items-center gap-1 rounded px-1.5 py-1 text-sm font-semibold text-foreground hover:bg-border"
      >
        {current.symbol}
        <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Choose symbol"
          className="absolute left-0 top-full z-30 mt-1 flex max-h-96 w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-md border border-border bg-panel shadow-xl"
        >
          <form
            className="flex items-center gap-2 border-b border-border px-3 py-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (query.trim().length >= 1) setSubmitted(query.trim())
            }}
          >
            <Search className="size-4 text-muted-foreground" aria-hidden />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter, or Enter to search provider"
              aria-label="Symbol search"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </form>
          <ul className="flex-1 overflow-y-auto py-1">
            {local.map((inst) => (
              <li key={`${inst.asset}-${inst.symbol}`}>
                <Row inst={inst} onClick={() => choose(inst)} active={inst.symbol === current.symbol && inst.asset === current.asset} />
              </li>
            ))}
            {submitted ? (
              <li className="border-t border-border px-3 pb-1 pt-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                Twelve Data results for {'"'}
                {submitted}
                {'"'}
              </li>
            ) : null}
            {isLoading ? <li className="px-3 py-2 text-xs text-muted-foreground">Searching…</li> : null}
            {error ? <li className="px-3 py-2 text-xs leading-relaxed text-down">{error.message}</li> : null}
            {data?.results.length === 0 ? <li className="px-3 py-2 text-xs text-muted-foreground">No matches.</li> : null}
            {data?.results.map((inst) => (
              <li key={`${inst.symbol}-${inst.exchange}-${inst.type}`}>
                <Row inst={inst} detail={`${inst.exchange} · ${inst.type}`} onClick={() => choose(inst)} />
              </li>
            ))}
          </ul>
          {!submitted ? (
            <p className="border-t border-border px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              Provider search uses 1 API credit per query.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function Row({ inst, detail, onClick, active }: { inst: Instrument; detail?: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx('flex w-full items-center gap-3 px-3 py-1.5 text-left hover:bg-border', active && 'bg-border/60')}
    >
      <span className="w-14 shrink-0 font-mono text-sm font-semibold text-foreground">{inst.symbol}</span>
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{detail ?? inst.name}</span>
      <span className="shrink-0 text-[10px] uppercase text-muted-foreground">{ASSET_LABEL[inst.asset]}</span>
    </button>
  )
}
