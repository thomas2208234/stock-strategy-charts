'use client'

import clsx from 'clsx'
import { Check, ChartArea, ChartCandlestick, ChartLine, ChartSpline, type LucideIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { CHART_TYPES, type ChartType } from '@/lib/chart-style'

const ICON: Record<ChartType, LucideIcon> = {
  bars: ChartCandlestick,
  candles: ChartCandlestick,
  hollow: ChartCandlestick,
  heikin: ChartCandlestick,
  line: ChartLine,
  area: ChartArea,
  baseline: ChartSpline,
}

export function ChartTypeMenu({ value, onChange }: { value: ChartType; onChange: (t: ChartType) => void }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const Icon = ICON[value]
  const current = CHART_TYPES.find((t) => t.value === value)?.label ?? 'Chart type'

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Chart type: ${current}`}
        title={`Chart type: ${current}`}
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          'flex size-7 items-center justify-center rounded transition-colors',
          open ? 'bg-border text-foreground' : 'text-muted-foreground hover:bg-border hover:text-foreground',
        )}
      >
        <Icon className="size-[18px]" aria-hidden />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute left-0 top-full z-50 mt-1 flex w-44 flex-col rounded-md border border-border bg-panel py-1 shadow-xl"
        >
          {CHART_TYPES.map((t) => {
            const ItemIcon = ICON[t.value]
            const selected = t.value === value
            return (
              <button
                key={t.value}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  onChange(t.value)
                  setOpen(false)
                }}
                className={clsx(
                  'flex items-center gap-2.5 px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-border',
                  selected ? 'text-primary' : 'text-foreground',
                )}
              >
                <ItemIcon className="size-4 shrink-0" aria-hidden />
                <span className="flex-1">{t.label}</span>
                {selected ? <Check className="size-3.5" aria-hidden /> : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
