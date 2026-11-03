import { NextResponse, type NextRequest } from 'next/server'
import { CATALOG } from '@/lib/catalog'
import { hasBudget } from '@/lib/server/rate-limit'
import { ProviderError, getSeries, invalid } from '@/lib/server/twelvedata'
import type { CapabilityResult } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * Probes a 1-minute bar for each requested catalog symbol. Intraday 1-minute access is the most
 * restrictive case, so a pass here implies the other timeframes are reachable too. Symbols that would
 * exceed the per-minute safeguard are returned as "skipped" so the client can retry them later.
 */
export async function GET(request: NextRequest) {
  const requested = (request.nextUrl.searchParams.get('symbols') ?? '').split(',').filter(Boolean)
  const instruments = CATALOG.filter((i) => requested.includes(i.symbol))
  if (instruments.length === 0 || instruments.length > 20) return invalid('Provide 1–20 catalog symbols.')

  const results: CapabilityResult[] = []
  for (const inst of instruments) {
    if (!hasBudget(1)) {
      results.push({ symbol: inst.symbol, asset: inst.asset, status: 'skipped', message: 'Waiting for API credits.' })
      continue
    }
    try {
      const data = await getSeries({ symbol: inst.symbol, interval: '1min', asset: inst.asset, outputsize: 50 })
      results.push({
        symbol: inst.symbol,
        asset: inst.asset,
        status: 'supported',
        message: `${data.meta.type ?? 'Instrument'}${data.meta.exchange ? ` · ${data.meta.exchange}` : ''} · 1m–D available`,
      })
    } catch (error) {
      const e = error instanceof ProviderError ? error : null
      const status: CapabilityResult['status'] =
        e?.kind === 'unsupported' ? 'unsupported' : e?.kind === 'plan' ? 'plan' : e?.kind === 'rate_limit' ? 'skipped' : 'error'
      results.push({ symbol: inst.symbol, asset: inst.asset, status, message: e?.message ?? 'Unknown error.' })
      if (e?.kind === 'config') break
    }
  }
  return NextResponse.json({ results }, { headers: { 'Cache-Control': 'no-store' } })
}
