import { CandlestickChart } from 'lucide-react'
import Link from 'next/link'

const focus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

export function WelcomeScreen() {
  return (
    <main className="flex min-h-dvh flex-col items-center bg-splash px-6 py-16 text-foreground">
      <header className="flex items-center gap-3">
        <CandlestickChart className="size-8 text-primary" aria-hidden="true" />
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">StratChart</h1>
      </header>

      <div className="flex w-full max-w-xs flex-1 flex-col items-stretch justify-center gap-3">
        <Link
          href="/sign-in"
          className={`flex h-11 items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 ${focus}`}
        >
          Log in
        </Link>
        <Link
          href="/sign-up"
          className={`flex h-11 items-center justify-center rounded-md border border-border bg-panel text-sm font-medium text-foreground transition-colors hover:bg-border ${focus}`}
        >
          Sign up
        </Link>
        <Link
          href="/charts"
          className={`flex h-11 items-center justify-center rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground ${focus}`}
        >
          Continue as guest
        </Link>
      </div>
    </main>
  )
}
