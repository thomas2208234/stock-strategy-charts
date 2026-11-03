"use client"

import clsx from "clsx"
import { LayoutGrid, List, SlidersHorizontal } from "lucide-react"
import { useState } from "react"
import { ChartPanel } from "@/components/chart-panel"
import { SettingsDialog } from "@/components/settings-dialog"
import { StrategyPanel } from "@/components/strategy-panel"
import { SymbolSearch } from "@/components/symbol-search"
import { TopBar } from "@/components/top-bar"
import { Watchlist } from "@/components/watchlist"
import { usePersistentSettings } from "@/lib/client"
import type { ChartConfig } from "@/lib/settings"

type SearchTarget = { mode: "chart"; index: number } | { mode: "watchlist" } | null
type MobileView = "charts" | "watchlist" | "strategy"
type SideTab = "watchlist" | "strategy"

export function Dashboard() {
  const { settings, update, reset } = usePersistentSettings()
  const [activeIndex, setActiveIndex] = useState(0)
  const [searchTarget, setSearchTarget] = useState<SearchTarget>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mobileView, setMobileView] = useState<MobileView>("charts")
  const [sideTab, setSideTab] = useState<SideTab>("watchlist")

  const changeChart = (index: number, patch: Partial<ChartConfig>) =>
    update((s) => ({
      ...s,
      charts: s.charts.map((c, i) =>
        i === index ? { ...c, ...patch, levels: patch.symbol && patch.symbol !== c.symbol ? [] : (patch.levels ?? c.levels) } : c,
      ),
    }))

  const watchlist = (
    <Watchlist
      symbols={settings.watchlist}
      timeZone={settings.prefs.timeZone}
      autoRefresh={settings.prefs.autoRefresh}
      onPick={(s) => {
        changeChart(activeIndex, { symbol: s })
        setMobileView("charts")
      }}
      onAdd={() => setSearchTarget({ mode: "watchlist" })}
      onRemove={(s) => update((st) => ({ ...st, watchlist: st.watchlist.filter((w) => w !== s) }))}
    />
  )
  const strategy = (
    <StrategyPanel
      settings={settings}
      update={update}
      activeChart={settings.charts[activeIndex]}
      onChangeChart={(patch) => changeChart(activeIndex, patch)}
    />
  )

  return (
    <div className="flex h-dvh flex-col">
      <TopBar onOpenSettings={() => setSettingsOpen(true)} />

      <div className="flex min-h-0 flex-1">
        <main className={clsx("min-h-0 min-w-0 flex-1 flex-col p-1.5 lg:flex", mobileView === "charts" ? "flex" : "hidden")}>
          <div role="tablist" aria-label="Select chart" className="mb-1.5 flex gap-1 lg:hidden">
            {settings.charts.map((c, i) => (
              <button
                key={c.id}
                role="tab"
                type="button"
                aria-selected={activeIndex === i}
                onClick={() => setActiveIndex(i)}
                className={clsx(
                  "flex-1 truncate rounded-md border px-2 py-1.5 font-mono text-xs",
                  activeIndex === i ? "border-primary/60 bg-panel-raised text-foreground" : "text-muted-foreground",
                )}
              >
                {c.symbol} · {c.interval.replace("min", "m")}
              </button>
            ))}
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-1.5 lg:grid-cols-2 lg:grid-rows-2">
            {settings.charts.map((c, i) => (
              <div key={c.id} className={clsx("min-h-0 min-w-0 lg:flex", activeIndex === i ? "flex" : "hidden")}>
                <div className="flex min-h-0 min-w-0 flex-1 flex-col *:flex-1">
                  <ChartPanel
                    config={c}
                    settings={settings}
                    active={activeIndex === i}
                    onActivate={() => setActiveIndex(i)}
                    onOpenSearch={() => setSearchTarget({ mode: "chart", index: i })}
                    onChange={(patch) => changeChart(i, patch)}
                  />
                </div>
              </div>
            ))}
          </div>
        </main>

        <aside
          className={clsx(
            "min-h-0 w-full flex-col overflow-y-auto border-l bg-panel lg:flex lg:w-80 lg:shrink-0",
            mobileView === "charts" ? "hidden" : "flex",
          )}
        >
          <div role="tablist" aria-label="Sidebar" className="sticky top-0 z-10 hidden border-b bg-panel lg:flex">
            {(["watchlist", "strategy"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                type="button"
                aria-selected={sideTab === t}
                onClick={() => setSideTab(t)}
                className={clsx(
                  "flex-1 border-b-2 py-2.5 text-xs font-medium capitalize",
                  sideTab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground",
                )}
              >
                {t === "strategy" ? "Indicators & strategy" : "Watchlist"}
              </button>
            ))}
          </div>
          <div className="lg:hidden">{mobileView === "watchlist" ? watchlist : strategy}</div>
          <div className="hidden lg:block">{sideTab === "watchlist" ? watchlist : strategy}</div>
        </aside>
      </div>

      <nav aria-label="Views" className="flex shrink-0 border-t bg-panel lg:hidden">
        {(
          [
            { id: "charts", label: "Charts", icon: LayoutGrid },
            { id: "watchlist", label: "Watchlist", icon: List },
            { id: "strategy", label: "Strategy", icon: SlidersHorizontal },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setMobileView(id)}
            aria-current={mobileView === id ? "page" : undefined}
            className={clsx(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-xs",
              mobileView === id ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        ))}
      </nav>

      <SymbolSearch
        open={searchTarget !== null}
        title={searchTarget?.mode === "watchlist" ? "Add to watchlist" : "Choose symbol"}
        onClose={() => setSearchTarget(null)}
        onSelect={(s) => {
          if (searchTarget?.mode === "chart") changeChart(searchTarget.index, { symbol: s })
          if (searchTarget?.mode === "watchlist")
            update((st) => ({ ...st, watchlist: st.watchlist.includes(s) ? st.watchlist : [...st.watchlist, s].slice(0, 12) }))
        }}
      />
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        update={update}
        onReset={reset}
      />
    </div>
  )
}
