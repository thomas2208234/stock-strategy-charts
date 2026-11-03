'use client'

import clsx from 'clsx'
import { X } from 'lucide-react'
import useSWR from 'swr'
import { ASSET_LABEL } from '@/lib/catalog'
import { formatPrice } from '@/lib/freshness'
import type { AssetClass, Instrument, MarketDataResponse } from '@/lib/types'
import { marketDataKey } from '@/lib/use-market-data'
import { useDashboard } from './dashboard-context'

const GROUPS: { asset: AssetClass; title: string }[] = [
  { asset: 'stock', title: 'Stocks' },
  { asset: 'etf', title: 'ETFs' },
  { asset: 'future', title: 'Futures' },
  { asset: 'other', title: 'Other' },
]

export function Watchlist() {
  const { watchlist } = useDashboard()
  return (
    <div className="flex flex-col">
      <p className="px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        Click a symbol to load it into the active chart. Prices appear for symbols currently on a chart — the watchlist
        does not poll on its own, to conserve API credits.
      </p>
      {GROUPS.map(({ asset, title }) => {
        const items = watchlist.filter((w) => w.asset === asset)
        if (items.length === 0) return null
        return (
          <div key={asset} className="flex flex-col border-t border-border">
            <h3 className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {title}
            </h3>
            <ul>
              {items.map((inst) => (
                <WatchRow key={`${inst.asset}-${inst.symbol}-${inst.exchange ?? ''}`} inst={inst} />
              ))}
            </ul>
            {asset === 'future' ? (
              <p className="px-4 pb-3 pt-1 text-[11px] leading-relaxed text-muted-foreground">
                Futures availability depends on your Twelve Data access. If the provider can{"'"}t return the actual
                contract, the chart says so instead of substituting another instrument.
              </p>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function WatchRow({ inst }: { inst: Instrument }) {
  const { charts, activeChart, settings, loadInstrument, toggleWatchlist } = useDashboard()
  const onChart = charts.find((c) => c.symbol === inst.symbol && c.asset === inst.asset && c.exchange === inst.exchange)
  const { data } = useSWR<MarketDataResponse>(onChart ? marketDataKey(onChart, settings.barCount) : null, null, {
    revalidateOnMount: false,
    revalidateOnFocus: false,
  })
  const bars = data?.bars
  const last = bars?.[bars.length - 1]
  const prev = bars?.[bars.length - 2]
  const change = last && prev ? ((last.close - prev.close) / prev.close) * 100 : undefined
  const isActive = charts[activeChart]?.symbol === inst.symbol && charts[activeChart]?.asset === inst.asset

  return (
    <li className="group flex items-center">
      <button
        type="button"
        onClick={() => loadInstrument(inst)}
        className={clsx('flex min-w-0 flex-1 items-center gap-3 px-4 py-1.5 text-left hover:bg-border/60', isActive && 'bg-border/40')}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-mono text-sm font-semibold text-foreground">{inst.symbol}</span>
          <span className="truncate text-[11px] text-muted-foreground">
            {inst.name}
            {inst.exchange ? ` · ${inst.exchange}` : ''}
          </span>
        </span>
        {last ? (
          <span className="flex flex-col items-end font-mono text-xs">
            <span className="text-foreground">{formatPrice(last.close)}</span>
            {change !== undefined ? (
              <span className={change >= 0 ? 'text-up' : 'text-down'}>
                {change >= 0 ? '+' : ''}
                {change.toFixed(2)}%
              </span>
            ) : null}
          </span>
        ) : (
          <span className="text-[10px] uppercase text-muted-foreground">{ASSET_LABEL[inst.asset]}</span>
        )}
      </button>
      <button
        type="button"
        onClick={() => toggleWatchlist(inst)}
        aria-label={`Remove ${inst.symbol} from watchlist`}
        className="mr-2 rounded p-1 text-muted-foreground opacity-0 hover:bg-border hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </li>
  )
}
