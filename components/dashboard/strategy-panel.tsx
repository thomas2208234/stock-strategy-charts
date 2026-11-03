'use client'

import { RotateCcw } from 'lucide-react'
import { DEFAULT_STRATEGY, type StrategyConfig } from '@/lib/strategy'
import { NumberField, Section, Segmented, Switch } from './controls'
import { useDashboard } from './dashboard-context'

type Group = keyof Omit<StrategyConfig, 'showSignals'>

export function StrategyPanel() {
  const { strategy: s, setStrategy } = useDashboard()
  const set = <G extends Group>(group: G, patch: Partial<StrategyConfig[G]>) =>
    setStrategy((prev) => ({ ...prev, [group]: { ...prev[group], ...patch } }))

  return (
    <div className="flex flex-col">
      <div className="mx-4 my-3 rounded border border-warning/40 bg-warning/10 px-3 py-2 text-xs leading-relaxed text-foreground">
        <strong className="font-semibold">Educational only.</strong> Signals are rule-based visual markers computed in
        your browser. They are not financial advice and nothing here places trades.
      </div>

      <Section
        title="Signals"
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
          description="Long-only. Enters at bar close; one position at a time."
          checked={s.showSignals}
          onChange={(v) => setStrategy((p) => ({ ...p, showSignals: v }))}
        />
      </Section>

      <Section title="Moving averages">
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

      <Section title="VWAP">
        <Switch
          label="Session VWAP"
          description="Intraday only; resets each UTC day. Hidden for instruments without volume."
          checked={s.vwap.enabled}
          onChange={(v) => set('vwap', { enabled: v })}
        />
      </Section>

      <Section title="RSI">
        <Switch label="RSI pane" checked={s.rsi.enabled} onChange={(v) => set('rsi', { enabled: v })} />
        <div className="grid grid-cols-3 gap-3">
          <NumberField label="Period" value={s.rsi.period} min={2} max={100} onChange={(v) => set('rsi', { period: v })} disabled={!s.rsi.enabled} />
          <NumberField label="Overbought" value={s.rsi.overbought} min={50} max={99} onChange={(v) => set('rsi', { overbought: v })} disabled={!s.rsi.enabled} />
          <NumberField label="Oversold" value={s.rsi.oversold} min={1} max={50} onChange={(v) => set('rsi', { oversold: v })} disabled={!s.rsi.enabled} />
        </div>
      </Section>

      <Section title="MACD">
        <Switch label="MACD pane" checked={s.macd.enabled} onChange={(v) => set('macd', { enabled: v })} />
        <div className="grid grid-cols-3 gap-3">
          <NumberField label="Fast" value={s.macd.fast} min={2} max={100} onChange={(v) => set('macd', { fast: v })} disabled={!s.macd.enabled} />
          <NumberField label="Slow" value={s.macd.slow} min={3} max={200} onChange={(v) => set('macd', { slow: v })} disabled={!s.macd.enabled} />
          <NumberField label="Signal" value={s.macd.signal} min={2} max={50} onChange={(v) => set('macd', { signal: v })} disabled={!s.macd.enabled} />
        </div>
      </Section>

      <Section title="Support / resistance">
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

      <Section title="Entry rules (any)">
        <Switch label="Fast MA crosses above slow MA" checked={s.entry.maCrossUp} onChange={(v) => set('entry', { maCrossUp: v })} disabled={!s.ma.enabled} />
        <Switch label="RSI crosses up out of oversold" checked={s.entry.rsiOversoldExit} onChange={(v) => set('entry', { rsiOversoldExit: v })} disabled={!s.rsi.enabled} />
        <Switch label="MACD crosses above signal" checked={s.entry.macdCrossUp} onChange={(v) => set('entry', { macdCrossUp: v })} disabled={!s.macd.enabled} />
        <Switch
          label="Filter: close above VWAP"
          description="Applies on intraday charts with volume."
          checked={s.entry.requireAboveVwap}
          onChange={(v) => set('entry', { requireAboveVwap: v })}
          disabled={!s.vwap.enabled}
        />
      </Section>

      <Section title="Exit rules (any)">
        <Switch label="Fast MA crosses below slow MA" checked={s.exit.maCrossDown} onChange={(v) => set('exit', { maCrossDown: v })} disabled={!s.ma.enabled} />
        <Switch label="RSI crosses into overbought" checked={s.exit.rsiOverbought} onChange={(v) => set('exit', { rsiOverbought: v })} disabled={!s.rsi.enabled} />
        <Switch label="MACD crosses below signal" checked={s.exit.macdCrossDown} onChange={(v) => set('exit', { macdCrossDown: v })} disabled={!s.macd.enabled} />
      </Section>

      <Section title="Stop loss / take profit">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Switch label="Stop" checked={s.risk.useStop} onChange={(v) => set('risk', { useStop: v })} />
            <NumberField label="Below entry" suffix="%" step={0.1} value={s.risk.stopPct} min={0.1} max={50} onChange={(v) => set('risk', { stopPct: v })} disabled={!s.risk.useStop} />
          </div>
          <div className="flex flex-col gap-2">
            <Switch label="Target" checked={s.risk.useTarget} onChange={(v) => set('risk', { useTarget: v })} />
            <NumberField label="Above entry" suffix="%" step={0.1} value={s.risk.targetPct} min={0.1} max={100} onChange={(v) => set('risk', { targetPct: v })} disabled={!s.risk.useTarget} />
          </div>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Checked against each later bar{"'"}s low/high. If both could hit in one bar, the stop is assumed first.
        </p>
      </Section>
    </div>
  )
}
