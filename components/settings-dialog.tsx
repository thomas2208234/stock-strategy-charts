"use client"

import { Modal, Section, SelectField, Switch } from "@/components/ui"
import type { AppSettings, ChartPrefs } from "@/lib/settings"

const TIME_ZONES = [
  { value: "America/New_York", label: "New York (ET)" },
  { value: "America/Chicago", label: "Chicago (CT)" },
  { value: "America/Denver", label: "Denver (MT)" },
  { value: "America/Los_Angeles", label: "Los Angeles (PT)" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Berlin", label: "Berlin" },
  { value: "Asia/Tokyo", label: "Tokyo" },
  { value: "UTC", label: "UTC" },
]

const SIZES: { value: string; label: string }[] = [
  { value: "200", label: "200 bars" },
  { value: "500", label: "500 bars" },
  { value: "1000", label: "1,000 bars" },
  { value: "2000", label: "2,000 bars" },
]

export function SettingsDialog({
  open,
  onClose,
  settings,
  update,
  onReset,
}: {
  open: boolean
  onClose: () => void
  settings: AppSettings
  update: (fn: (s: AppSettings) => AppSettings) => void
  onReset: () => void
}) {
  const p = settings.prefs
  const set = (patch: Partial<ChartPrefs>) => update((s) => ({ ...s, prefs: { ...s.prefs, ...patch } }))

  return (
    <Modal open={open} onClose={onClose} title="Chart preferences">
      <Section title="Display">
        <SelectField label="Time zone" value={p.timeZone} options={TIME_ZONES} onChange={(v) => set({ timeZone: v })} />
        <Switch label="Magnet crosshair" description="Snap the crosshair to candle OHLC values." checked={p.magnetCrosshair} onChange={(v) => set({ magnetCrosshair: v })} />
        <Switch label="Volume bars" checked={p.showVolume} onChange={(v) => set({ showVolume: v })} />
        <Switch label="Grid lines" checked={p.showGrid} onChange={(v) => set({ showGrid: v })} />
      </Section>
      <Section title="Data & API usage">
        <SelectField
          label="History per chart"
          value={String(p.outputsize)}
          options={SIZES}
          onChange={(v) => set({ outputsize: Number(v) as ChartPrefs["outputsize"] })}
        />
        <Switch
          label="Auto-refresh"
          description="Refreshes 1m charts every 60s, 5m every 2 min, others every 5 min, and quotes every 3 min. Each chart refresh costs 1 Twelve Data credit."
          checked={p.autoRefresh}
          onChange={(v) => set({ autoRefresh: v })}
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          The server caches responses and caps requests at your per-minute credit limit (set TWELVE_DATA_CREDITS_PER_MINUTE to
          match your plan). When the limit is reached, cached data is shown and labeled.
        </p>
      </Section>
      <Section title="Reset">
        <button
          type="button"
          onClick={() => {
            onReset()
            onClose()
          }}
          className="self-start rounded-md border px-3 py-1.5 text-xs text-down hover:bg-panel-raised"
        >
          Reset charts, watchlist & indicators to defaults
        </button>
        <p className="text-xs text-muted-foreground">Layout and preferences are saved in this browser only.</p>
      </Section>
    </Modal>
  )
}
