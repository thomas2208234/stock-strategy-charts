import type { Interval } from "@/lib/market"

export type MaType = "SMA" | "EMA"
export type EntryRule = "ma_cross" | "rsi_reversal" | "macd_cross" | "vwap_reclaim"
export type ExitRule = "opposite" | "rsi_overbought" | "macd_cross_down" | "vwap_lose" | "none"

export interface MaSettings {
  enabled: boolean
  type: MaType
  period: number
}

export interface IndicatorSettings {
  fastMa: MaSettings
  slowMa: MaSettings
  vwap: { enabled: boolean }
  rsi: { enabled: boolean; period: number; overbought: number; oversold: number }
  macd: { enabled: boolean; fast: number; slow: number; signal: number }
}

export interface StrategySettings {
  enabled: boolean
  entry: EntryRule
  exit: ExitRule
  requireAboveVwap: boolean
  requireAboveSlowMa: boolean
  useStopLoss: boolean
  stopLossPct: number
  useTakeProfit: boolean
  takeProfitPct: number
}

export interface LevelSettings {
  autoEnabled: boolean
  strength: number
  count: number
}

export interface ChartPrefs {
  magnetCrosshair: boolean
  showVolume: boolean
  showGrid: boolean
  timeZone: string
  autoRefresh: boolean
  outputsize: 200 | 500 | 1000 | 2000
}

export interface ChartConfig {
  id: string
  symbol: string
  interval: Interval
  /** Manual support/resistance prices for this chart. */
  levels: number[]
}

export interface AppSettings {
  version: 1
  charts: ChartConfig[]
  watchlist: string[]
  indicators: IndicatorSettings
  strategy: StrategySettings
  levels: LevelSettings
  prefs: ChartPrefs
}

export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,
  charts: [
    { id: "c1", symbol: "SPY", interval: "5min", levels: [] },
    { id: "c2", symbol: "AAPL", interval: "15min", levels: [] },
    { id: "c3", symbol: "NVDA", interval: "1h", levels: [] },
    { id: "c4", symbol: "ES", interval: "5min", levels: [] },
  ],
  watchlist: ["SPY", "QQQ", "AAPL", "NVDA", "TSLA", "MSFT"],
  indicators: {
    fastMa: { enabled: true, type: "EMA", period: 9 },
    slowMa: { enabled: true, type: "EMA", period: 21 },
    vwap: { enabled: true },
    rsi: { enabled: true, period: 14, overbought: 70, oversold: 30 },
    macd: { enabled: false, fast: 12, slow: 26, signal: 9 },
  },
  strategy: {
    enabled: true,
    entry: "ma_cross",
    exit: "opposite",
    requireAboveVwap: false,
    requireAboveSlowMa: false,
    useStopLoss: true,
    stopLossPct: 1,
    useTakeProfit: true,
    takeProfitPct: 2,
  },
  levels: { autoEnabled: true, strength: 5, count: 2 },
  prefs: {
    magnetCrosshair: false,
    showVolume: true,
    showGrid: true,
    timeZone: "America/New_York",
    autoRefresh: true,
    outputsize: 500,
  },
}

export const STORAGE_KEY = "ssc-settings-v1"

export function mergeSettings(raw: unknown): AppSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_SETTINGS
  const r = raw as Partial<AppSettings>
  const d = DEFAULT_SETTINGS
  const charts =
    Array.isArray(r.charts) && r.charts.length === 4
      ? r.charts.map((c, i) => ({ ...d.charts[i], ...c, levels: Array.isArray(c.levels) ? c.levels : [] }))
      : d.charts
  return {
    version: 1,
    charts,
    watchlist: Array.isArray(r.watchlist) ? r.watchlist.slice(0, 12) : d.watchlist,
    indicators: {
      fastMa: { ...d.indicators.fastMa, ...r.indicators?.fastMa },
      slowMa: { ...d.indicators.slowMa, ...r.indicators?.slowMa },
      vwap: { ...d.indicators.vwap, ...r.indicators?.vwap },
      rsi: { ...d.indicators.rsi, ...r.indicators?.rsi },
      macd: { ...d.indicators.macd, ...r.indicators?.macd },
    },
    strategy: { ...d.strategy, ...r.strategy },
    levels: { ...d.levels, ...r.levels },
    prefs: { ...d.prefs, ...r.prefs },
  }
}
