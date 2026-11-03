'use client'

import clsx from 'clsx'
import { CandlestickChart } from 'lucide-react'
import { useState } from 'react'
import { ChartPanel } from './chart-panel'
import { ConnectionStatus } from './connection-status'
import { DashboardProvider, useDashboard } from './dashboard-context'
import { SettingsPanel } from './settings-panel'
import { StrategyPanel } from './strategy-panel'
import { Watchlist } from './watchlist'

const TABS = [
  { id: 'watchlist', label: 'Watchlist' },
  { id: 'strategy', label: 'Strategy' },
  { id: 'settings', label: 'Settings' },
] as const

type TabId = (typeof TABS)[number]['id']

export function Dashboard() {
  return (
    <DashboardProvider>
      <Shell />
    </DashboardProvider>
  )
}

function Shell() {
  const { charts, activeChart, setActiveChart } = useDashboard()
  const [tab, setTab] = useState<TabId>('watchlist')

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground lg:h-dvh">
      <header className="flex items-center gap-3 border-b border-border bg-panel px-3 py-2">
        <div className="flex items-center gap-2">
          <CandlestickChart className="size-5 text-primary" aria-hidden />
          <h1 className="text-sm font-semibold">Strat Chart</h1>
        </div>
        <div className="ml-auto min-w-0">
          <ConnectionStatus />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <main className="flex min-h-0 flex-1 flex-col gap-2 p-2">
          <nav aria-label="Charts" className="flex gap-1 overflow-x-auto lg:hidden">
            {charts.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveChart(c.id)}
                aria-current={activeChart === c.id ? 'true' : undefined}
                className={clsx(
                  'shrink-0 rounded px-3 py-1.5 font-mono text-xs',
                  activeChart === c.id ? 'bg-primary text-primary-foreground' : 'bg-panel text-muted-foreground',
                )}
              >
                {c.symbol}
              </button>
            ))}
          </nav>
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 lg:grid-cols-2 lg:grid-rows-2">
            {charts.map((c) => (
              <ChartPanel
                key={c.id}
                slot={c}
                className={clsx('h-[62dvh] lg:h-auto', activeChart === c.id ? 'flex' : 'hidden lg:flex')}
              />
            ))}
          </div>
        </main>

        <aside className="flex min-h-0 flex-col border-t border-border bg-panel lg:w-80 lg:border-l lg:border-t-0">
          <div role="tablist" aria-label="Sidebar" className="flex border-b border-border">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`panel-${t.id}`}
                onClick={() => setTab(t.id)}
                className={clsx(
                  'flex-1 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors',
                  tab === t.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="min-h-0 flex-1 overflow-y-auto">
            {tab === 'watchlist' ? <Watchlist /> : tab === 'strategy' ? <StrategyPanel /> : <SettingsPanel />}
          </div>
          <p className="border-t border-border px-4 py-2 text-[11px] leading-relaxed text-muted-foreground">
            Market data by Twelve Data. Educational tool — not financial advice.
          </p>
        </aside>
      </div>
    </div>
  )
}
