import { formatPrice } from './freshness'
import type { StrategyConfig, StrategyOutput } from './strategy'
import type { Bar } from './types'

function joinOr(parts: string[]) {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} or ${parts[parts.length - 1]}`
}

export function describeStrategy(cfg: StrategyConfig) {
  const { ma, rsi, macd, entry, exit, risk, vwap } = cfg
  const buy: string[] = []
  if (entry.maCrossUp && ma.enabled) buy.push(`the ${ma.fast}-bar ${ma.type} crosses above the ${ma.slow}-bar ${ma.type}`)
  if (entry.rsiOversoldExit && rsi.enabled) buy.push(`RSI climbs back above ${rsi.oversold}`)
  if (entry.macdCrossUp && macd.enabled) buy.push('MACD crosses above its signal line')

  const sell: string[] = []
  if (exit.maCrossDown && ma.enabled) sell.push(`the ${ma.fast}-bar ${ma.type} drops below the ${ma.slow}-bar ${ma.type}`)
  if (exit.rsiOverbought && rsi.enabled) sell.push(`RSI rises above ${rsi.overbought}`)
  if (exit.macdCrossDown && macd.enabled) sell.push('MACD crosses below its signal line')
  if (risk.useStop) sell.push(`price falls ${risk.stopPct}% (stop loss)`)
  if (risk.useTarget) sell.push(`price gains ${risk.targetPct}% (take profit)`)

  const filter = entry.requireAboveVwap && vwap.enabled ? ', but only while price is above VWAP' : ''

  return {
    buy: buy.length > 0 ? `Buy when ${joinOr(buy)}${filter}.` : 'No buy rule is switched on, so no signals will appear.',
    sell: buy.length > 0 ? (sell.length > 0 ? `Sell when ${joinOr(sell)}.` : 'No sell rule is on — trades stay open.') : '',
    active: buy.length > 0,
  }
}

export type SignalStatus =
  | { tone: 'off'; title: string; detail?: string }
  | { tone: 'long'; title: string; detail: string; pnl: number }
  | { tone: 'flat'; title: string; detail?: string }

const EXIT_LABEL = { entry: 'Buy', exit: 'Sell', stop: 'Stop loss hit', target: 'Target hit' } as const

export function describeStatus(bars: Bar[], out: StrategyOutput, cfg: StrategyConfig): SignalStatus {
  if (!cfg.showSignals) return { tone: 'off', title: 'Signals hidden', detail: 'Turn them on in the Strategy tab.' }
  if (!describeStrategy(cfg).active) return { tone: 'off', title: 'No buy rule active', detail: 'Pick one in the Strategy tab.' }

  const last = bars[bars.length - 1]
  if (out.open && last) {
    const pnl = ((last.close - out.open.entry) / out.open.entry) * 100
    const parts = [`Bought at ${formatPrice(out.open.entry)}`]
    if (out.open.stop !== undefined) parts.push(`stop ${formatPrice(out.open.stop)}`)
    if (out.open.target !== undefined) parts.push(`target ${formatPrice(out.open.target)}`)
    return { tone: 'long', title: 'In a trade', detail: parts.join(' · '), pnl }
  }

  const signal = out.signals[out.signals.length - 1]
  if (!signal) return { tone: 'flat', title: 'Waiting for a buy signal', detail: 'No signals in view yet.' }
  const idx = bars.findIndex((b) => b.time === signal.time)
  const ago = idx >= 0 ? bars.length - 1 - idx : undefined
  return {
    tone: 'flat',
    title: 'Waiting for a buy signal',
    detail: `Last: ${EXIT_LABEL[signal.kind]} at ${formatPrice(signal.price)}${ago !== undefined ? ` · ${ago} ${ago === 1 ? 'bar' : 'bars'} ago` : ''}`,
  }
}
