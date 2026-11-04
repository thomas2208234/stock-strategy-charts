'use client'

import clsx from 'clsx'
import { AlertTriangle, Ban, KeyRound, Loader2, Lock, RefreshCw, Timer } from 'lucide-react'
import { useMemo } from 'react'
import { ASSET_LABEL, FUTURES_ETF_PROXY, findCatalog } from '@/lib/catalog'
import { formatAge, formatPrice, freshness } from '@/lib/freshness'
import { runStrategy } from '@/lib/strategy'
import { describeStatus, type SignalStatus } from '@/lib/strategy-text'
import { INTERVALS, type ApiErrorKind, type Interval } from '@/lib/types'
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

const INTERVAL_NAME: Record<Interval, string> = {
  '1min': '1 minute',
  '5min': '5 minutes',
  '15min': '15 minutes',
  '30min': '30 minutes',
  '1h': '1 hour',
  '4h': '4 hours',
  '1day': '1 day',
}

export function ChartPanel({ slot, className }: { slot: ChartSlot; className?: string }) {
  const { strategy, settings, activeChart, setActiveChart, updateChart, loadInstrument } = useDashboard()
  const { data, error, isLoading, isValidating, mutate } = useMarketData(slot, settings.barCount, settings.refreshSeconds)
  const now = useNow(15_000)
  const isActive = activeChart === slot.id

  const bars = useMemo(() => data?.bars ?? [], [data])
  const intraday = slot.interval !== '1day'
  const output = useMemo(() => runStrategy(bars, strategy, intraday), [bars, strategy, intraday])
  const status = bars.length > 0 ? describeStatus(bars, output, strategy) : undefined

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
        'flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-background transition-[border-color,box-shadow]',
        isActive ? 'border-primary/70 shadow-[0_0_0_1px_var(--primary)]' : 'border-border hover:border-muted-foreground/40',
        className,
      )}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border bg-panel px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <SymbolPicker current={slot} onSelect={(inst) => loadInstrument(inst, slot.id)} />
          <div className="hidden min-w-0 flex-col leading-tight 2xl:flex">
            <span className="truncate text-xs text-muted-foreground">{slot.name}</span>
          </div>
          <span className="rounded bg-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {ASSET_LABEL[slot.asset]}
          </span>
        </div>
        {last ? (
          <span className="flex items-baseline gap-2 font-mono">
            <span className="text-sm font-semibold text-foreground">{formatPrice(last.close)}</span>
            {change !== undefined ? (
              <span
                className={clsx('rounded px-1 text-xs', change >= 0 ? 'bg-up/15 text-up' : 'bg-down/15 text-down')}
                title="Change since the previous bar"
              >
                {change >= 0 ? '+' : ''}
                {change.toFixed(2)}%
              </span>
            ) : null}
          </span>
        ) : null}
        <div
          role="radiogroup"
          aria-label="Timeframe (time per candle)"
          className="ml-auto flex items-center rounded-md bg-background p-0.5"
        >
          {INTERVALS.map((iv) => (
            <button
              key={iv.value}
              type="button"
              role="radio"
              aria-checked={slot.interval === iv.value}
              aria-label={`Each candle is ${INTERVAL_NAME[iv.value]}`}
              title={`Each candle = ${INTERVAL_NAME[iv.value]}`}
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

      {status ? <StatusBar status={status} /> : null}

      <div className="relative min-h-0 flex-1">
        {bars.length > 0 ? (
          <PriceChart bars={bars} output={output} interval={slot.interval} strategy={strategy} settings={settings} />
        ) : null}

        {isLoading && bars.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading {slot.symbol}…
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

      <footer className="flex items-center gap-2 border-t border-border bg-panel px-3 py-1.5 text-[11px] text-muted-foreground">
        {fresh ? (
          <span
            className="flex items-center gap-1.5"
            title="Based on the age of the newest candle. Latency depends on your Twelve Data plan and exchange licensing."
          >
            <span className={clsx('size-1.5 rounded-full', fresh.state === 'recent' ? 'bg-up' : 'bg-warning')} aria-hidden />
            {fresh.state === 'recent' ? 'Up to date' : 'Delayed or market closed'}
            <span>· updated {formatAge(fresh.ageSec)} ago</span>
          </span>
        ) : (
          <span>No data</span>
        )}
        {error && bars.length > 0 ? <span className="truncate text-warning">Refresh failed: {error.message}</span> : null}
        <span className="ml-auto hidden sm:inline">
          {data ? `Each candle = ${INTERVAL_NAME[slot.interval]}` : ''}
        </span>
        <button
          type="button"
          onClick={() => mutate()}
          aria-label={`Refresh ${slot.symbol}`}
          title={data ? `Last fetched ${new Date(data.fetchedAt).toLocaleTimeString()}${data.cached ? ' (cached)' : ''}` : 'Refresh'}
          className="rounded p-0.5 hover:bg-border hover:text-foreground"
        >
          <RefreshCw className={clsx('size-3.5', isValidating && 'animate-spin')} aria-hidden />
        </button>
      </footer>
    </section>
  )
}

function StatusBar({ status }: { status: SignalStatus }) {
  return (
    <div
      className={clsx(
        'flex items-center gap-2 border-b px-3 py-1.5 text-xs',
        status.tone === 'long' && 'border-primary/30 bg-primary/10',
        status.tone === 'flat' && 'border-border bg-background',
        status.tone === 'off' && 'border-border bg-background',
      )}
    >
      <span
        aria-hidden
        className={clsx(
          'size-2 shrink-0 rounded-full',
          status.tone === 'long' && 'animate-pulse bg-primary',
          status.tone === 'flat' && 'bg-muted-foreground',
          status.tone === 'off' && 'border border-muted-foreground',
        )}
      />
      <span className="shrink-0 font-medium text-foreground">{status.title}</span>
      {status.detail ? <span className="min-w-0 truncate text-muted-foreground">{status.detail}</span> : null}
      {status.tone === 'long' ? (
        <span
          className={clsx('ml-auto shrink-0 font-mono font-semibold', status.pnl >= 0 ? 'text-up' : 'text-down')}
          title="Simulated profit or loss since entry"
        >
          {status.pnl >= 0 ? '+' : ''}
          {status.pnl.toFixed(2)}%
        </span>
      ) : null}
    </div>
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
