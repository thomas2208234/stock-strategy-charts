"use client"

import clsx from "clsx"
import { AlertTriangle, ChevronDown, Loader2, RefreshCw } from "lucide-react"
import { useMemo } from "react"
import useSWR from "swr"
import { PriceChart } from "@/components/price-chart"
import { FetchError, formatPrice, formatTimestamp, jsonFetcher } from "@/lib/client"
import { autoLevels as computeAutoLevels } from "@/lib/indicators"
import { findPreset, INTERVALS, type FreshnessStatus, type Interval, type MarketDataResponse } from "@/lib/market"
import type { AppSettings, ChartConfig } from "@/lib/settings"
import { computeIndicators, runStrategy } from "@/lib/strategy"

function refreshMs(interval: Interval): number {
  if (interval === "1min") return 60_000
  if (interval === "5min") return 120_000
  if (interval === "1day") return 30 * 60_000
  return 5 * 60_000
}

const FRESHNESS_STYLE: Record<FreshnessStatus, string> = {
  recent: "border-up/40 text-up",
  delayed: "border-warn/40 text-warn",
  closed: "border-border text-muted-foreground",
  historical: "border-border text-muted-foreground",
  unknown: "border-border text-muted-foreground",
}

export function ChartPanel({
  config,
  settings,
  active,
  onActivate,
  onOpenSearch,
  onChange,
}: {
  config: ChartConfig
  settings: AppSettings
  active: boolean
  onActivate: () => void
  onOpenSearch: () => void
  onChange: (patch: Partial<ChartConfig>) => void
}) {
  const preset = findPreset(config.symbol)
  const key = `/api/market?symbol=${encodeURIComponent(config.symbol)}&interval=${config.interval}&outputsize=${settings.prefs.outputsize}`
  const { data, error, isLoading, isValidating, mutate } = useSWR<MarketDataResponse, FetchError>(key, jsonFetcher, {
    refreshInterval: settings.prefs.autoRefresh ? refreshMs(config.interval) : 0,
    revalidateOnFocus: false,
    keepPreviousData: true,
    shouldRetryOnError: (err: FetchError) => err.kind === "rate_limited" || err.kind === "network",
    errorRetryInterval: 20_000,
    errorRetryCount: 4,
  })

  const showData = data && data.symbol.toUpperCase() === config.symbol.toUpperCase() && data.interval === config.interval
  const candles = showData ? data.candles : null
  const tz = settings.prefs.timeZone

  const indicators = useMemo(
    () => (candles ? computeIndicators(candles, settings.indicators, settings.strategy, data?.meta.exchangeTimezone) : null),
    [candles, settings.indicators, settings.strategy, data?.meta.exchangeTimezone],
  )
  const strategy = useMemo(
    () => (candles && indicators ? runStrategy(candles, indicators, settings.strategy, settings.indicators.rsi) : null),
    [candles, indicators, settings.strategy, settings.indicators.rsi],
  )
  const levels = useMemo(
    () =>
      candles && settings.levels.autoEnabled
        ? computeAutoLevels(candles, settings.levels.strength, settings.levels.count)
        : { support: [], resistance: [] },
    [candles, settings.levels],
  )

  const last = candles?.at(-1)
  const prev = candles?.at(-2)
  const change = last && prev ? ((last.close - prev.close) / prev.close) * 100 : null

  return (
    <article
      onPointerDown={onActivate}
      aria-label={`Chart ${config.symbol} ${config.interval}`}
      className={clsx(
        "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border bg-panel",
        active ? "border-primary/60" : "border-border",
      )}
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-2 py-1.5">
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-sm font-semibold hover:bg-panel-raised"
          aria-label={`Change symbol, currently ${config.symbol}`}
        >
          {config.symbol}
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
        </button>
        <div role="group" aria-label="Timeframe" className="flex items-center overflow-x-auto">
          {INTERVALS.map((i) => (
            <button
              key={i.value}
              type="button"
              onClick={() => onChange({ interval: i.value })}
              aria-pressed={config.interval === i.value}
              className={clsx(
                "rounded px-1.5 py-0.5 font-mono text-xs",
                config.interval === i.value
                  ? "bg-panel-raised text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {i.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {last && (
            <span className="font-mono text-xs">
              {formatPrice(last.close)}{" "}
              {change != null && (
                <span className={change >= 0 ? "text-up" : "text-down"}>
                  {change >= 0 ? "+" : ""}
                  {change.toFixed(2)}%
                </span>
              )}
            </span>
          )}
          <button
            type="button"
            onClick={() => mutate()}
            className="rounded p-1 text-muted-foreground hover:bg-panel-raised hover:text-foreground"
            aria-label="Refresh chart data"
          >
            <RefreshCw className={clsx("size-3.5", isValidating && "animate-spin")} />
          </button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        {candles && indicators && strategy && (
          <PriceChart
            candles={candles}
            indicators={indicators}
            strategy={strategy}
            settings={settings}
            manualLevels={config.levels}
            autoLevels={levels}
            resetKey={`${config.symbol}:${config.interval}`}
          />
        )}

        {candles && (
          <Legend settings={settings} entries={strategy?.entries ?? 0} />
        )}

        {isLoading && !candles && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading {config.symbol}…
          </div>
        )}

        {error && !candles && (
          <div className="absolute inset-0 flex items-center justify-center overflow-y-auto p-4">
            <div className="flex max-w-sm flex-col items-center gap-3 text-center" role="alert">
              <AlertTriangle className={clsx("size-5", error.kind === "rate_limited" ? "text-warn" : "text-down")} aria-hidden />
              <p className="text-pretty text-sm leading-relaxed text-foreground">{error.message}</p>
              <div className="flex flex-wrap justify-center gap-2">
                {preset?.kind === "futures" && preset.proxy && (
                  <button
                    type="button"
                    onClick={() => onChange({ symbol: preset.proxy! })}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                  >
                    View {preset.proxy} (ETF proxy)
                  </button>
                )}
                {error.kind !== "missing_key" && preset?.kind !== "futures" && (
                  <button
                    type="button"
                    onClick={() => mutate()}
                    className="rounded-md border px-3 py-1.5 text-xs hover:bg-panel-raised"
                  >
                    Retry
                  </button>
                )}
                <button type="button" onClick={onOpenSearch} className="rounded-md border px-3 py-1.5 text-xs hover:bg-panel-raised">
                  Change symbol
                </button>
              </div>
            </div>
          </div>
        )}

        {error && candles && (
          <p className="absolute bottom-8 left-2 z-10 max-w-[80%] rounded bg-background/90 px-2 py-1 text-xs text-warn" role="status">
            Refresh failed: {error.message} Showing last loaded data.
          </p>
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t px-2 py-1 text-xs text-muted-foreground">
        {showData ? (
          <>
            <span
              className={clsx("rounded border px-1.5 py-px font-medium", FRESHNESS_STYLE[data.freshness.status])}
              title={data.freshness.detail}
            >
              {data.freshness.label}
            </span>
            {data.stale && <span className="text-warn">Cached (credit limit)</span>}
            <span className="truncate">
              {data.freshness.lastBarAt ? `Last bar ${formatTimestamp(data.freshness.lastBarAt, tz)}` : "No bars"}
            </span>
            <span className="ml-auto truncate">
              {data.meta.exchange ? `${data.meta.exchange} · ` : ""}Twelve Data · fetched{" "}
              {formatTimestamp(Math.floor(data.fetchedAt / 1000), tz, false)}
            </span>
          </>
        ) : (
          <span>{preset?.kind === "futures" ? "Futures — not available from Twelve Data" : "No data loaded"}</span>
        )}
      </footer>
    </article>
  )
}

function Legend({ settings, entries }: { settings: AppSettings; entries: number }) {
  const { indicators: ind, strategy } = settings
  const items: { label: string; color: string }[] = []
  if (ind.fastMa.enabled) items.push({ label: `${ind.fastMa.type} ${ind.fastMa.period}`, color: "bg-warn" })
  if (ind.slowMa.enabled) items.push({ label: `${ind.slowMa.type} ${ind.slowMa.period}`, color: "bg-primary" })
  if (ind.vwap.enabled) items.push({ label: "VWAP", color: "bg-foreground" })
  if (items.length === 0 && !strategy.enabled) return null
  return (
    <div className="pointer-events-none absolute left-2 top-1.5 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1">
          <span className={clsx("h-0.5 w-3", i.color)} aria-hidden />
          {i.label}
        </span>
      ))}
      {strategy.enabled && <span>{entries} signal{entries === 1 ? "" : "s"}</span>}
    </div>
  )
}
