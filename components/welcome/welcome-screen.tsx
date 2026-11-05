'use client'

import { CandlestickChart } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

export function WelcomeScreen() {
  const [notice, setNotice] = useState<string | null>(null)

  return (
    <main className="flex min-h-dvh flex-col items-center bg-splash px-6 py-16 text-foreground">
      <header className="flex items-center gap-3">
        <CandlestickChart className="size-8 text-primary" aria-hidden="true" />
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">StratChart</h1>
      </header>

      <div className="flex w-full max-w-xs flex-1 flex-col items-stretch justify-center gap-3">
        <button
          type="button"
          onClick={() => setNotice('Log in is coming soon. Continue as a guest for now.')}
          className="h-11 rounded-md bg-primary text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Log in
        </button>
        <button
          type="button"
          onClick={() => setNotice('Sign up is coming soon. Continue as a guest for now.')}
          className="h-11 rounded-md border border-border bg-panel text-sm font-medium text-foreground transition-colors hover:bg-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Sign up
        </button>
        <Link
          href="/charts"
          className="flex h-11 items-center justify-center rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Continue as guest
        </Link>
        <p role="status" aria-live="polite" className="min-h-5 text-center text-sm text-muted-foreground">
          {notice}
        </p>
      </div>
    </main>
  )
}
