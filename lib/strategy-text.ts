import { formatPrice } from './freshness'
import type { Side, StrategyConfig, StrategyOutput } from './strategy'
import type { Bar } from './types'

function joinOr(parts: string[]) {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} or ${parts[parts.length - 1]}`
}

const VERB = {
  long: { open: 'Buy', close: 'Sell' },
  short: { open: 'Short', close: 'Cover (buy back)' },
} as const

function sideRules(cfg: StrategyConfig, side: Side) {
  const { ma, macd, entry, exit, risk, vwap } = cfg
  const up = side === 'long'
  const into = up ? 'crosses above' : 'crosses below'
  const outOf = up ? 'drops below' : 'rises above'

  const open: string[] = []
  if (entry.maCrossUp && ma.enabled) open.push(`the ${ma.fast}-bar ${ma.type} ${into} the ${ma.slow}-bar ${ma.type}`)
  if (entry.macdCrossUp && macd.enabled) open.push(`MACD ${into} its signal line`)

  const close: string[] = []
  if (exit.maCrossDown && ma.enabled) close.push(`the ${ma.fast}-bar ${ma.type} ${outOf} the ${ma.slow}-bar ${ma.type}`)
  if (exit.macdCrossDown && macd.enabled) close.push(`MACD ${outOf} its signal line`)
  if (risk.useStop) close.push(`price ${up ? 'falls' : 'rises'} ${risk.stopPct}% (stop loss)`)
  if (risk.useTarget) close.push(`price ${up ? 'gains' : 'drops'} ${risk.targetPct}% (take profit)`)

  const filter = entry.requireAboveVwap && vwap.enabled ? `, but only while price is ${up ? 'above' : 'below'} VWAP` : ''
  const verb = VERB[side]

  return {
    active: open.length > 0,
    lines:
      open.length === 0
        ? []
        : [
            `${verb.open} when ${joinOr(open)}${filter}.`,
            close.length > 0 ? `${verb.close} when ${joinOr(close)}.` : 'No exit rule is on — trades stay open.',
          ],
  }
}

export function describeStrategy(cfg: StrategyConfig) {
  const sides: Side[] = cfg.direction === 'both' ? ['long', 'short'] : [cfg.direction]
  const rules = sides.map((s) => sideRules(cfg, s))
  const active = rules.some((r) => r.active)
  return {
    lines: active ? rules.flatMap((r) => r.lines) : ['No entry rule is switched on, so no signals will appear.'],
    active,
  }
}

export type SignalStatus =
  | { tone: 'off'; title: string; detail?: string }
  | { tone: 'long' | 'short'; title: string; detail: string; pnl: number }
  | { tone: 'flat'; title: string; detail?: string }

const SIGNAL_LABEL = {
  long: { entry: 'Buy', exit: 'Sell', stop: 'Stop loss hit', target: 'Target hit' },
  short: { entry: 'Short', exit: 'Cover', stop: 'Stop loss hit', target: 'Target hit' },
} as const

const WAITING = { long: 'Waiting for a buy signal', short: 'Waiting for a short signal', both: 'Waiting for a signal' } as const

export function describeStatus(bars: Bar[], out: StrategyOutput, cfg: StrategyConfig): SignalStatus {
  if (!cfg.showSignals) return { tone: 'off', title: 'Signals hidden', detail: 'Turn them on in the Strategy tab.' }
  if (!describeStrategy(cfg).active) return { tone: 'off', title: 'No entry rule active', detail: 'Pick one in the Strategy tab.' }

  const last = bars[bars.length - 1]
  if (out.open && last) {
    const { side, entry } = out.open
    const move = ((last.close - entry) / entry) * 100
    const pnl = side === 'long' ? move : -move
    const parts = [`${side === 'long' ? 'Bought' : 'Shorted'} at ${formatPrice(entry)}`]
    if (out.open.stop !== undefined) parts.push(`stop ${formatPrice(out.open.stop)}`)
    if (out.open.target !== undefined) parts.push(`target ${formatPrice(out.open.target)}`)
    return { tone: side, title: side === 'long' ? 'In a long trade' : 'In a short trade', detail: parts.join(' · '), pnl }
  }

  const title = WAITING[cfg.direction]
  const signal = out.signals[out.signals.length - 1]
  if (!signal) return { tone: 'flat', title, detail: 'No signals in view yet.' }
  const idx = bars.findIndex((b) => b.time === signal.time)
  const ago = idx >= 0 ? bars.length - 1 - idx : undefined
  return {
    tone: 'flat',
    title,
    detail: `Last: ${SIGNAL_LABEL[signal.side][signal.kind]} at ${formatPrice(signal.price)}${ago !== undefined ? ` · ${ago} ${ago === 1 ? 'bar' : 'bars'} ago` : ''}`,
  }
}
