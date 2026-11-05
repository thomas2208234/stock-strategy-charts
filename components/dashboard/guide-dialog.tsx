'use client'

import clsx from 'clsx'
import { ArrowDown, ArrowUp, BookOpen, X } from 'lucide-react'
import { useRef, type ReactNode } from 'react'

type Swatch =
  | { kind: 'candle'; tone: 'up' | 'down' }
  | { kind: 'line'; color: string; dashed?: boolean; dotted?: boolean }
  | { kind: 'arrow'; color: string; dir: 'up' | 'down' }
  | { kind: 'tag'; color: string; text: string }

function SwatchIcon({ s }: { s: Swatch }) {
  if (s.kind === 'candle') {
    return (
      <span className="flex h-5 w-6 items-center justify-center" aria-hidden>
        <span className={clsx('relative h-4 w-2 rounded-[1px]', s.tone === 'up' ? 'bg-up' : 'bg-down')}>
          <span className={clsx('absolute -top-1 -bottom-1 left-1/2 w-px -translate-x-1/2', s.tone === 'up' ? 'bg-up' : 'bg-down')} />
        </span>
      </span>
    )
  }
  if (s.kind === 'line') {
    return (
      <span className="flex h-5 w-6 items-center" aria-hidden>
        <span
          className={clsx('w-full border-t-2', s.color, s.dashed && 'border-dashed', s.dotted && 'border-dotted')}
        />
      </span>
    )
  }
  if (s.kind === 'arrow') {
    const Icon = s.dir === 'up' ? ArrowUp : ArrowDown
    return (
      <span className="flex h-5 w-6 items-center justify-center" aria-hidden>
        <Icon className={clsx('size-4', s.color)} strokeWidth={3} />
      </span>
    )
  }
  return (
    <span className="flex h-5 w-6 items-center justify-center" aria-hidden>
      <span className={clsx('rounded-sm px-1 font-mono text-[10px] font-semibold leading-4 text-primary-foreground', s.color)}>
        {s.text}
      </span>
    </span>
  )
}

function Item({ swatch, title, children }: { swatch: Swatch; title: string; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <SwatchIcon s={swatch} />
      <div className="flex min-w-0 flex-col">
        <span className="text-sm font-medium text-foreground">{title}</span>
        <span className="text-pretty text-sm leading-relaxed text-muted-foreground">{children}</span>
      </div>
    </li>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <ul className="flex flex-col gap-3">{children}</ul>
    </section>
  )
}

export function GuideButton() {
  const ref = useRef<HTMLDialogElement>(null)

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/60 hover:bg-primary/10"
      >
        <BookOpen className="size-3.5 text-primary" aria-hidden />
        How to read
      </button>
      <dialog
        ref={ref}
        aria-labelledby="guide-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close()
        }}
        className="m-auto max-h-[85dvh] w-[min(42rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-panel p-0 text-foreground shadow-2xl backdrop:bg-background/80 backdrop:backdrop-blur-sm"
      >
        <div className="flex max-h-[85dvh] flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
            <div className="flex flex-col gap-1">
              <h2 id="guide-title" className="text-balance text-lg font-semibold">
                How to read these charts
              </h2>
              <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
                Each chart shows price over time plus the lines and markers your strategy uses. Here&apos;s what
                everything means.
              </p>
            </div>
            <button
              type="button"
              onClick={() => ref.current?.close()}
              aria-label="Close guide"
              className="rounded-md p-1 text-muted-foreground hover:bg-border hover:text-foreground"
            >
              <X className="size-4" aria-hidden />
            </button>
          </header>

          <div className="grid gap-8 overflow-y-auto px-6 py-6 md:grid-cols-2">
            <Group title="Price">
              <Item swatch={{ kind: 'candle', tone: 'up' }} title="Green candle">
                Price closed higher than it opened during that bar.
              </Item>
              <Item swatch={{ kind: 'candle', tone: 'down' }} title="Red candle">
                Price closed lower than it opened. The thin wick shows the high and low.
              </Item>
              <Item swatch={{ kind: 'tag', color: 'bg-primary', text: '5m' }} title="Timeframe">
                How much time one candle covers — 1 minute up to 1 day (D).
              </Item>
            </Group>

            <Group title="Trend lines">
              <Item swatch={{ kind: 'line', color: 'border-warning' }} title="Fast moving average">
                Average of the last few closes. Reacts quickly to price changes.
              </Item>
              <Item swatch={{ kind: 'line', color: 'border-primary' }} title="Slow moving average">
                Average over a longer window. Fast above slow usually means an uptrend. Each line is an{' '}
                <strong className="font-medium text-foreground">EMA</strong> (Exponential Moving Average, favors recent prices) or an{' '}
                <strong className="font-medium text-foreground">SMA</strong> (Simple Moving Average, weights every price equally).
              </Item>
              <Item swatch={{ kind: 'line', color: 'border-foreground', dashed: true }} title="VWAP · Volume-Weighted Average Price">
                The day&apos;s average price, weighted by how much traded at each price. Intraday charts only.
              </Item>
            </Group>

            <Group title="Price levels">
              <Item swatch={{ kind: 'tag', color: 'bg-down', text: 'R' }} title="Resistance">
                A recent high where price has turned down before — a possible ceiling.
              </Item>
              <Item swatch={{ kind: 'tag', color: 'bg-up', text: 'S' }} title="Support">
                A recent low where price has bounced before — a possible floor.
              </Item>
            </Group>

            <Group title="Signals">
              <Item swatch={{ kind: 'arrow', color: 'text-primary', dir: 'up' }} title="Buy">
                Your entry rules were met at the close of this bar.
              </Item>
              <Item swatch={{ kind: 'arrow', color: 'text-warning', dir: 'down' }} title="Exit">
                A sell rule triggered, closing the simulated trade.
              </Item>
              <Item swatch={{ kind: 'arrow', color: 'text-primary', dir: 'down' }} title="Short">
                A short entry: the simulated trade profits if price falls. Shown above the bar.
              </Item>
              <Item swatch={{ kind: 'arrow', color: 'text-warning', dir: 'up' }} title="Cover">
                An exit rule closed the short by buying it back.
              </Item>
              <Item swatch={{ kind: 'arrow', color: 'text-up', dir: 'down' }} title="TP · take profit">
                Price reached your profit target (arrow points up when covering a short).
              </Item>
              <Item swatch={{ kind: 'arrow', color: 'text-down', dir: 'down' }} title="SL · stop loss">
                Price moved against you to your stop, limiting the loss.
              </Item>
            </Group>

            <Group title="Data">
              <Item swatch={{ kind: 'tag', color: 'bg-warning', text: '•' }} title="Delayed / market closed">
                The newest candle is old — usually because the market is closed.
              </Item>
            </Group>
          </div>

          <footer className="border-t border-border px-6 py-4 text-xs leading-relaxed text-muted-foreground">
            Signals are simulated, long-only, and computed in your browser. Educational only — not financial advice.
          </footer>
        </div>
      </dialog>
    </>
  )
}
