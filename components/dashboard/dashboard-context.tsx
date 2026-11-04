'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { CATALOG } from '@/lib/catalog'
import { DEFAULT_STRATEGY, type StrategyConfig } from '@/lib/strategy'
import type { Instrument, Interval } from '@/lib/types'

export interface ChartSlot extends Instrument {
  id: number
  interval: Interval
}

export interface ChartSettings {
  showVolume: boolean
  showGrid: boolean
  magnetCrosshair: boolean
  localTime: boolean
  refreshSeconds: 0 | 60 | 120 | 300
  barCount: 200 | 300 | 500 | 1000
}

export const DEFAULT_SETTINGS: ChartSettings = {
  showVolume: true,
  showGrid: false,
  magnetCrosshair: false,
  localTime: true,
  refreshSeconds: 60,
  barCount: 300,
}

function slot(id: number, symbol: string, interval: Interval): ChartSlot {
  const inst = CATALOG.find((c) => c.symbol === symbol)!
  return { ...inst, id, interval }
}

const DEFAULT_CHARTS: ChartSlot[] = [
  slot(0, 'SPY', '5min'),
  slot(1, 'AAPL', '15min'),
  slot(2, 'NVDA', '1h'),
  slot(3, 'MSFT', '1day'),
]

interface DashboardState {
  charts: ChartSlot[]
  activeChart: number
  watchlist: Instrument[]
  strategy: StrategyConfig
  settings: ChartSettings
  setActiveChart: (id: number) => void
  updateChart: (id: number, patch: Partial<Omit<ChartSlot, 'id'>>) => void
  loadInstrument: (inst: Instrument, chartId?: number) => void
  toggleWatchlist: (inst: Instrument) => void
  setStrategy: (updater: (prev: StrategyConfig) => StrategyConfig) => void
  setSettings: (patch: Partial<ChartSettings>) => void
}

const DashboardContext = createContext<DashboardState | null>(null)

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [charts, setCharts] = useState(DEFAULT_CHARTS)
  const [activeChart, setActiveChart] = useState(0)
  const [watchlist, setWatchlist] = useState<Instrument[]>(CATALOG)
  const [strategy, setStrategyState] = useState(DEFAULT_STRATEGY)
  const [settings, setSettingsState] = useState(DEFAULT_SETTINGS)

  const updateChart = useCallback((id: number, patch: Partial<Omit<ChartSlot, 'id'>>) => {
    setCharts((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }, [])

  const loadInstrument = useCallback(
    (inst: Instrument, chartId?: number) => {
      const id = chartId ?? activeChart
      setCharts((prev) =>
        prev.map((c) =>
          c.id === id
            ? { ...c, symbol: inst.symbol, name: inst.name, asset: inst.asset, exchange: inst.exchange }
            : c,
        ),
      )
    },
    [activeChart],
  )

  const toggleWatchlist = useCallback((inst: Instrument) => {
    setWatchlist((prev) => {
      const exists = prev.some((w) => w.symbol === inst.symbol && w.exchange === inst.exchange && w.asset === inst.asset)
      return exists
        ? prev.filter((w) => !(w.symbol === inst.symbol && w.exchange === inst.exchange && w.asset === inst.asset))
        : [...prev, inst]
    })
  }, [])

  const setStrategy = useCallback((updater: (prev: StrategyConfig) => StrategyConfig) => setStrategyState(updater), [])
  const setSettings = useCallback((patch: Partial<ChartSettings>) => setSettingsState((p) => ({ ...p, ...patch })), [])

  const value = useMemo(
    () => ({
      charts,
      activeChart,
      watchlist,
      strategy,
      settings,
      setActiveChart,
      updateChart,
      loadInstrument,
      toggleWatchlist,
      setStrategy,
      setSettings,
    }),
    [charts, activeChart, watchlist, strategy, settings, updateChart, loadInstrument, toggleWatchlist, setStrategy, setSettings],
  )

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>
}

export function useDashboard() {
  const ctx = useContext(DashboardContext)
  if (!ctx) throw new Error('useDashboard must be used inside DashboardProvider')
  return ctx
}
