import type { Bar, Interval } from './types'

export type ChartType = 'candles' | 'hollow' | 'bars' | 'heikin' | 'line' | 'area' | 'baseline'
export type ScaleMode = 'normal' | 'log' | 'percent'

export const CHART_TYPES: { value: ChartType; label: string }[] = [
  { value: 'bars', label: 'Bars' },
  { value: 'candles', label: 'Candles' },
  { value: 'hollow', label: 'Hollow candles' },
  { value: 'heikin', label: 'Heikin Ashi' },
  { value: 'line', label: 'Line' },
  { value: 'area', label: 'Area' },
  { value: 'baseline', label: 'Baseline' },
]

export const isOhlcType = (t: ChartType) => t === 'candles' || t === 'hollow' || t === 'bars' || t === 'heikin'

/** Short interval codes as TradingView shows them in the legend. */
export const INTERVAL_CODE: Record<Interval, string> = {
  '1min': '1',
  '5min': '5',
  '15min': '15',
  '30min': '30',
  '1h': '1h',
  '4h': '4h',
  '1day': '1D',
}

export function heikinAshi(bars: Bar[]): Bar[] {
  const out: Bar[] = []
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]
    const close = (b.open + b.high + b.low + b.close) / 4
    const open = i === 0 ? (b.open + b.close) / 2 : (out[i - 1].open + out[i - 1].close) / 2
    out.push({
      time: b.time,
      open,
      close,
      high: Math.max(b.high, open, close),
      low: Math.min(b.low, open, close),
      volume: b.volume,
    })
  }
  return out
}

export function formatVolume(v: number) {
  const abs = Math.abs(v)
  if (abs >= 1e9) return `${(v / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${(v / 1e3).toFixed(2)}K`
  return v.toFixed(0)
}
