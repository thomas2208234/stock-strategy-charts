'use client'

import clsx from 'clsx'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { CATALOG } from '@/lib/catalog'
import type { CapabilityResult } from '@/lib/types'
import { Section, Segmented, Switch } from './controls'
import { useDashboard } from './dashboard-context'

const STATUS_STYLE: Record<CapabilityResult['status'], string> = {
  supported: 'text-up',
  unsupported: 'text-down',
  plan: 'text-down',
  skipped: 'text-muted-foreground',
  error: 'text-warning',
}

const STATUS_LABEL: Record<CapabilityResult['status'], string> = {
  supported: 'Supported',
  unsupported: 'Unavailable',
  plan: 'Plan-locked',
  skipped: 'Pending',
  error: 'Error',
}

export function SettingsPanel() {
  const { settings, setSettings } = useDashboard()

  return (
    <div className="flex flex-col">
      <Section title="Chart">
        <Switch label="Volume" checked={settings.showVolume} onChange={(v) => setSettings({ showVolume: v })} />
        <Switch label="Grid lines" checked={settings.showGrid} onChange={(v) => setSettings({ showGrid: v })} />
        <Switch label="Magnet crosshair" description="Snap crosshair to OHLC values." checked={settings.magnetCrosshair} onChange={(v) => setSettings({ magnetCrosshair: v })} />
        <Switch label="Local time zone" description="Off shows UTC." checked={settings.localTime} onChange={(v) => setSettings({ localTime: v })} />
      </Section>
      <Section title="Data">
        <Segmented
          label="Auto-refresh"
          value={settings.refreshSeconds}
          onChange={(v) => setSettings({ refreshSeconds: v })}
          options={[
            { value: 0, label: 'Off' },
            { value: 60, label: '1m' },
            { value: 120, label: '2m' },
            { value: 300, label: '5m' },
          ]}
        />
        <Segmented
          label="Bars per chart"
          value={settings.barCount}
          onChange={(v) => setSettings({ barCount: v })}
          options={[
            { value: 200, label: '200' },
            { value: 300, label: '300' },
            { value: 500, label: '500' },
            { value: 1000, label: '1000' },
          ]}
        />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Each chart refresh costs 1 Twelve Data credit. Four charts at 1-minute refresh use about 4 credits/min. The
          server caches responses and enforces a per-minute and daily credit safeguard.
        </p>
      </Section>
      <CapabilityCheck />
    </div>
  )
}

function CapabilityCheck() {
  const [results, setResults] = useState<Record<string, CapabilityResult>>({})
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setRunning(true)
    setError(null)
    try {
      let pending = CATALOG.map((c) => c.symbol).filter((s) => results[s]?.status !== 'supported')
      for (let round = 0; round < 6 && pending.length > 0; round++) {
        const res = await fetch(`/api/capabilities?symbols=${pending.join(',')}`)
        const body = (await res.json()) as { results?: CapabilityResult[]; error?: { message: string } }
        if (!res.ok || !body.results) throw new Error(body.error?.message ?? 'Check failed.')
        setResults((prev) => ({ ...prev, ...Object.fromEntries(body.results!.map((r) => [r.symbol, r])) }))
        pending = body.results.filter((r) => r.status === 'skipped').map((r) => r.symbol)
        if (pending.length > 0) await new Promise((r) => setTimeout(r, 62_000))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check failed.')
    } finally {
      setRunning(false)
    }
  }

  return (
    <Section title="Provider capability check">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Tests each catalog symbol against your Twelve Data plan with a small 1-minute request. Uses about 1 credit per
        symbol and pauses between rounds to stay within the per-minute safeguard.
      </p>
      <button
        type="button"
        onClick={run}
        disabled={running}
        className="flex items-center justify-center gap-2 rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
      >
        {running ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {running ? 'Checking…' : 'Run check'}
      </button>
      {error ? <p className="text-xs text-down">{error}</p> : null}
      {Object.keys(results).length > 0 ? (
        <ul className="flex flex-col divide-y divide-border rounded border border-border">
          {CATALOG.map((c) => {
            const r = results[c.symbol]
            return (
              <li key={c.symbol} className="flex flex-col gap-0.5 px-2.5 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-foreground">{c.symbol}</span>
                  <span className={clsx('text-[11px]', r ? STATUS_STYLE[r.status] : 'text-muted-foreground')}>
                    {r ? STATUS_LABEL[r.status] : '—'}
                  </span>
                </div>
                {r && r.status !== 'skipped' ? (
                  <span className="text-pretty text-[11px] leading-relaxed text-muted-foreground">{r.message}</span>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
    </Section>
  )
}
