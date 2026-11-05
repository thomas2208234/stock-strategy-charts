'use client'

import { RotateCcw } from 'lucide-react'
import { DEFAULT_STRATEGY, type StrategyConfig } from '@/lib/strategy'
import { describeStrategy } from '@/lib/strategy-text'
import { NumberField, Section, Segmented, Switch } from './controls'
import { useDashboard } from './dashboard-context'

type Group = keyof Omit<StrategyConfig, 'showSignals' | 'direction'>

const LABELS = {
  long: {
    enter: 'When to buy',
    enterDesc: 'A buy signal appears when any switched-on rule is met.',
    maIn: 'Fast MA crosses above slow MA',
    macdIn: 'MACD crosses above signal',
    vwap: 'Filter: close above VWAP',
    exit: 'When to sell',
    maOut: 'Fast MA crosses below slow MA',
    macdOut: 'MACD crosses below signal',
    stop: 'Below entry',
    target: 'Above entry',
  },
  short: {
    enter: 'When to short',
    enterDesc: 'A short signal appears when any switched-on rule is met.',
    maIn: 'Fast MA crosses below slow MA',
    macdIn: 'MACD crosses below signal',
    vwap: 'Filter: close below VWAP',
    exit: 'When to cover',
    maOut: 'Fast MA crosses above slow MA',
    macdOut: 'MACD crosses above signal',
    stop: 'Above entry',
    target: 'Below entry',
  },
  both: {
    enter: 'When to enter',
    enterDesc: 'Crosses up open a long, crosses down open a short.',
    maIn: 'Fast MA crosses slow MA',
    macdIn: 'MACD crosses signal',
    vwap: 'Filter: longs above VWAP, shorts below',
    exit: 'When to exit',
    maOut: 'Fast MA crosses back against the trade',
    macdOut: 'MACD crosses back against the trade',
    stop: 'Against entry',
    target: 'In favor of entry',
  },
} as const

export function StrategyPanel() {
  const { strategy: s, setStrategy } = useDashboard()
  const set = <G extends Group>(group: G, patch: Partial<StrategyConfig[G]>) =>
    setStrategy((prev) => ({ ...prev, [group]: { ...prev[group], ...patch } }))

  const summary = describeStrategy(s)
  const L = LABELS[s.direction]

  return (
    <div className="flex flex-col">
      <div className="mx-4 my-4 flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/10 p-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">Your strategy in plain English</span>
        {summary.lines.map((line) => (
          <p key={line} className="text-pretty text-sm leading-relaxed text-foreground">
            {line}
          </p>
        ))}
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Simulated only — signals are drawn on the chart, no real trades are placed. Not financial advice.
        </p>
      </div>

      <Section
        title="Signals on chart"
        aside={
          <button
            type="button"
            onClick={() => setStrategy(() => DEFAULT_STRATEGY)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="size-3" aria-hidden /> Reset
          </button>
        }
      >
        <Switch
          label="Show entry / exit markers"
          description="Enters at bar close; one position at a time."
          checked={s.showSignals}
          onChange={(v) => setStrategy((p) => ({ ...p, showSignals: v }))}
        />
        <Segmented
          label="Trade direction"
          value={s.direction}
          onChange={(v) => setStrategy((p) => ({ ...p, direction: v }))}
          options={[
            { value: 'long', label: 'Long' },
            { value: 'short', label: 'Short' },
            { value: 'both', label: 'Both' },
          ]}
        />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Long profits when price rises. Short sells first and buys back later, profiting when price falls. Both
          flips between the two as signals appear.
        </p>
      </Section>

      <Section title="Moving averages" description="Smoothed trend lines. When the fast line crosses above the slow one, momentum is turning up. EMA = Exponential Moving Average (reacts faster to recent prices). SMA = Simple Moving Average (equal weight to every price).">
        <Switch label="MA crossover lines" checked={s.ma.enabled} onChange={(v) => set('ma', { enabled: v })} />
        <Segmented
          label="Type"
          value={s.ma.type}
          onChange={(v) => set('ma', { type: v })}
          options={[
            { value: 'EMA', label: 'EMA' },
            { value: 'SMA', label: 'SMA' },
          ]}
        />
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Fast" value={s.ma.fast} min={2} max={200} onChange={(v) => set('ma', { fast: v })} disabled={!s.ma.enabled} />
          <NumberField label="Slow" value={s.ma.slow} min={3} max={400} onChange={(v) => set('ma', { slow: v })} disabled={!s.ma.enabled} />
        </div>
      </Section>

      <Section title="VWAP · Volume-Weighted Average Price" description="The average price paid today, weighted by volume. Price above VWAP suggests buyers are in control.">
        <Switch
          label="Session VWAP"
          description="Intraday only; resets each UTC day. Hidden for instruments without volume."
          checked={s.vwap.enabled}
          onChange={(v) => set('vwap', { enabled: v })}
        />
      </Section>

      <Section title="MACD" description="Another momentum indicator in its own pane. Crosses of its two lines hint at trend changes.">
        <Switch label="MACD pane" checked={s.macd.enabled} onChange={(v) => set('macd', { enabled: v })} />
        <div className="grid grid-cols-3 gap-3">
          <NumberField label="Fast" value={s.macd.fast} min={2} max={100} onChange={(v) => set('macd', { fast: v })} disabled={!s.macd.enabled} />
          <NumberField label="Slow" value={s.macd.slow} min={3} max={200} onChange={(v) => set('macd', { slow: v })} disabled={!s.macd.enabled} />
          <NumberField label="Signal" value={s.macd.signal} min={2} max={50} onChange={(v) => set('macd', { signal: v })} disabled={!s.macd.enabled} />
        </div>
      </Section>

      <Section title="Support & resistance" description="Price zones where the market has turned before. Add your own levels or let them be detected.">
        <Switch label="Show levels" checked={s.levels.enabled} onChange={(v) => set('levels', { enabled: v })} />
        <Switch
          label="Auto-detect swing levels"
          checked={s.levels.auto}
          onChange={(v) => set('levels', { auto: v })}
          disabled={!s.levels.enabled}
        />
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Pivot lookback" value={s.levels.lookback} min={2} max={50} onChange={(v) => set('levels', { lookback: v })} disabled={!s.levels.enabled || !s.levels.auto} />
          <NumberField label="Max levels" value={s.levels.maxLevels} min={1} max={10} onChange={(v) => set('levels', { maxLevels: v })} disabled={!s.levels.enabled || !s.levels.auto} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="manual-levels" className="text-xs text-muted-foreground">
            Manual levels (comma-separated prices)
          </label>
          <input
            id="manual-levels"
            value={s.levels.manual}
            onChange={(e) => set('levels', { manual: e.target.value })}
            disabled={!s.levels.enabled}
            placeholder="e.g. 520, 535.5"
            className="rounded border border-border bg-background px-2 py-1.5 font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary disabled:opacity-50"
          />
        </div>
      </Section>

      <Section title={L.enter} description={L.enterDesc}>
        <Switch label={L.maIn} checked={s.entry.maCrossUp} onChange={(v) => set('entry', { maCrossUp: v })} disabled={!s.ma.enabled} />
        <Switch label={L.macdIn} checked={s.entry.macdCrossUp} onChange={(v) => set('entry', { macdCrossUp: v })} disabled={!s.macd.enabled} />
        <Switch
          label={L.vwap}
          description="Applies on intraday charts with volume."
          checked={s.entry.requireAboveVwap}
          onChange={(v) => set('entry', { requireAboveVwap: v })}
          disabled={!s.vwap.enabled}
        />
      </Section>

      <Section title={L.exit} description="The simulated trade closes when any switched-on rule is met.">
        <Switch label={L.maOut} checked={s.exit.maCrossDown} onChange={(v) => set('exit', { maCrossDown: v })} disabled={!s.ma.enabled} />
        <Switch label={L.macdOut} checked={s.exit.macdCrossDown} onChange={(v) => set('exit', { macdCrossDown: v })} disabled={!s.macd.enabled} />
      </Section>

      <Section title="Stop loss & take profit" description="Automatic exits based on how far price moves from your entry.">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Switch label="Stop" checked={s.risk.useStop} onChange={(v) => set('risk', { useStop: v })} />
            <NumberField label={L.stop} suffix="%" step={0.1} value={s.risk.stopPct} min={0.1} max={50} onChange={(v) => set('risk', { stopPct: v })} disabled={!s.risk.useStop} />
          </div>
          <div className="flex flex-col gap-2">
            <Switch label="Target" checked={s.risk.useTarget} onChange={(v) => set('risk', { useTarget: v })} />
            <NumberField label={L.target} suffix="%" step={0.1} value={s.risk.targetPct} min={0.1} max={100} onChange={(v) => set('risk', { targetPct: v })} disabled={!s.risk.useTarget} />
          </div>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Checked against each later bar{"'"}s low/high. If both could hit in one bar, the stop is assumed first.
        </p>
      </Section>
    </div>
  )
}
