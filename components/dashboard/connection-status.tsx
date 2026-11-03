'use client'

import clsx from 'clsx'
import useSWR from 'swr'
import type { ProviderStatus } from '@/lib/types'
import { jsonFetcher } from '@/lib/use-market-data'

export function ConnectionStatus() {
  const { data, error, isLoading } = useSWR<ProviderStatus>('/api/status', jsonFetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
  })

  let tone: 'ok' | 'warn' | 'bad' | 'idle' = 'idle'
  let label = 'Checking provider…'
  let detail: string | undefined

  if (error) {
    tone = 'bad'
    label = 'Status unavailable'
    detail = error.message
  } else if (data && !data.configured) {
    tone = 'bad'
    label = 'API key not configured'
    detail = data.message
  } else if (data && !data.ok) {
    tone = 'warn'
    label = 'Provider issue'
    detail = data.message
  } else if (data) {
    tone = 'ok'
    label = `Twelve Data${data.planCategory ? ` · ${data.planCategory}` : ''}`
    detail =
      data.dailyLimit !== undefined
        ? `${data.dailyUsage ?? 0}/${data.dailyLimit} credits today · ${data.minuteUsage ?? 0}/${data.minuteLimit ?? '?'} this minute`
        : undefined
  }

  return (
    <div className="flex min-w-0 items-center gap-2 text-xs" role="status" aria-live="polite" title={detail}>
      <span
        aria-hidden
        className={clsx(
          'size-2 shrink-0 rounded-full',
          tone === 'ok' && 'bg-up',
          tone === 'warn' && 'bg-warning',
          tone === 'bad' && 'bg-down',
          tone === 'idle' && 'bg-muted-foreground',
          isLoading && 'animate-pulse',
        )}
      />
      <span className="truncate text-foreground">{label}</span>
      {detail ? <span className="hidden truncate font-mono text-muted-foreground md:inline">{detail}</span> : null}
    </div>
  )
}
