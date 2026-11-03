'use client'

import clsx from 'clsx'
import { AlertTriangle, Ban, KeyRound, Loader2, Lock, RefreshCw, Timer } from 'lucide-react'
import { ASSET_LABEL, FUTURES_ETF_PROXY, findCatalog } from '@/lib/catalog'
import { formatAge, formatPrice, freshness } from '@/lib/freshness'
import { INTERVALS, type ApiErrorKind } from '@/lib/types'
import { useMarketData } from '@/lib/use-market-data'
import { useDashboard, type ChartSlot } from './dashboard-context'
import { PriceChart } from './price-chart'
import { SymbolPicker } from './symbol-picker'
import { useNow } from './use-now'

const ERROR_COPY: Record<ApiErrorKind, { title: string; icon: typeof Ban }> = {
  unsupported: { title: 'Not available from provider', icon: Ban },
  plan: { title: 'Not included in your plan', icon: Lock },
  rate_limit: { title: 'Rate limit — waiting for credits', icon: Timer },
  config: { title: 'API key problem', icon: KeyRound },
  invalid: { title: 'Invalid request', icon: AlertTriangle },
  upstream: { title: 'Provider error', icon: AlertTriangle },
}

export function ChartPanel({ slot, className }: { slot: ChartSlot; className?: string }) {
  const { strategy, settings, activeChart, setActiveChart, updateChart, loadInstrument } = useDashboard()
  const { data, error, isLoading, isValidating, mutate } = useMarketData(slot, settings.barCount, settings.refreshSeconds)
  const now = useNow(15_000)
  const isActive = activeChart === slot.id

  const bars = data?.bars ?? []
  const last = bars[bars.length - 1]
  const prev = bars[bars.length - 2]
  const change = last && prev ? ((last.close - prev.close) / prev.close) * 100 : undefined
  const fresh = last ? freshness(last.time, slot.interval, now) : undefined
  const proxy = slot.asset === 'future' ? FUTURES_ETF_PROXY[slot.symbol] : undefined

  return (
    <section
      aria-label={`${slot.symbol} chart`}
      onPointerDown={() => setActiveChart(slot.id)}
      className={clsx(
        'flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border bg-background',
        isActive ? 'border-primary/60' : 'border-border',
        className,
      )}
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-panel px-2 py-1">
        <SymbolPicker current={slot} onSelect={(inst) => loadInstrument(inst, slot.id)} />
        <span className="rounded bg-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          {ASSET_LABEL[slot.asset]}
        </span>
        {last ? (
          <span className="flex items-baseline gap-1.5 font-mono text-xs">
            <span className="text-foreground">{formatPrice(last.close)}</span>
            {change !== undefined ? (
              <span className={change >= 0 ? 'text-up' : 'text-down'}>
                {change >= 0 ? '+' : ''}
                {change.toFixed(2)}%
              </span>
            ) : null}
          </span>
        ) : null}
        <div role="radiogroup" aria-label="Timeframe" className="ml-auto flex items-center">
          {INTERVALS.map((iv) => (
            <button
              key={iv.value}
              type="button"
              role="radio"
              aria-checked={slot.interval === iv.value}
              onClick={() => updateChart(slot.id, { interval: iv.value })}
              className={clsx(
                'rounded px-1.5 py-0.5 font-mono text-[11px] transition-colors',
                slot.interval === iv.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {iv.label}
            </button>
          ))}
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        {bars.length > 0 ? (
          <PriceChart bars={bars} interval={slot.interval} strategy={strategy} settings={settings} />
        ) : null}

        {isLoading && bars.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading {slot.symbol} from Twelve Data…
          </div>
        ) : null}

        {error && bars.length === 0 ? (
          <ErrorState
            kind={error.kind}
            message={error.message}
            onRetry={() => mutate()}
            proxy={proxy}
            onProxy={proxy ? () => loadInstrument(findCatalog(proxy, 'etf')!, slot.id) : undefined}
          />
        ) : null}
      </div>

      <footer className="flex items-center gap-2 border-t border-border bg-panel px-2 py-1 text-[11px] text-muted-foreground">
        {fresh ? (
          <span
            className="flex items-center gap-1.5"
            title="Inferred from the age of the newest bar. Latency depends on your Twelve Data plan and exchange licensing."
          >
            <span className={clsx('size-1.5 rounded-full', fresh.state === 'recent' ? 'bg-up' : 'bg-warning')} aria-hidden />
            {fresh.state === 'recent' ? 'Recent' : 'Delayed / market closed'}
            <span className="font-mono">· last bar {formatAge(fresh.ageSec)} ago</span>
          </span>
        ) : (
          <span>No data</span>
        )}
        {error && bars.length > 0 ? <span className="truncate text-warning">Refresh failed: {error.message}</span> : null}
        <span className="ml-auto hidden font-mono sm:inline">
          {data ? `fetched ${new Date(data.fetchedAt).toLocaleTimeString()}${data.cached ? ' (cached)' : ''}` : ''}
        </span>
        <button
          type="button"
          onClick={() => mutate()}
          aria-label={`Refresh ${slot.symbol}`}
          className="rounded p-0.5 hover:bg-border hover:text-foreground"
        >
          <RefreshCw className={clsx('size-3.5', isValidating && 'animate-spin')} aria-hidden />
        </button>
      </footer>
    </section>
  )
}

function ErrorState({
  kind,
  message,
  onRetry,
  proxy,
  onProxy,
}: {
  kind: ApiErrorKind
  message: string
  onRetry: () => void
  proxy?: string
  onProxy?: () => void
}) {
  const { title, icon: Icon } = ERROR_COPY[kind]
  return (
    <div className="absolute inset-0 flex items-center justify-center p-4">
      <div className="flex max-w-sm flex-col items-center gap-2 text-center">
        <Icon className={clsx('size-5', kind === 'rate_limit' ? 'text-warning' : 'text-down')} aria-hidden />
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-pretty text-xs leading-relaxed text-muted-foreground">{message}</p>
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          {kind === 'upstream' || kind === 'rate_limit' ? (
            <button type="button" onClick={onRetry} className="rounded border border-border px-2.5 py-1 text-xs text-foreground hover:bg-border">
              Retry
            </button>
          ) : null}
          {proxy && onProxy ? (
            <button type="button" onClick={onProxy} className="rounded border border-border px-2.5 py-1 text-xs text-foreground hover:bg-border">
              Chart {proxy} ETF instead
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
