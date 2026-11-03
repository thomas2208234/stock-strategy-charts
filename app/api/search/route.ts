import { NextResponse, type NextRequest } from 'next/server'
import { cached } from '@/lib/server/cache'
import { errorResponse, invalid, tdFetch } from '@/lib/server/twelvedata'
import type { AssetClass, Instrument } from '@/lib/types'

export const dynamic = 'force-dynamic'

interface SearchJson {
  data?: {
    symbol: string
    instrument_name: string
    exchange: string
    instrument_type: string
    country?: string
  }[]
}

function assetFromType(type: string): AssetClass {
  if (/etf/i.test(type)) return 'etf'
  if (/futur/i.test(type)) return 'future'
  if (/stock|share|depositary/i.test(type)) return 'stock'
  return 'other'
}

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get('q') ?? '').trim()
  if (!/^[A-Za-z0-9 .\-&]{1,30}$/.test(q)) return invalid('Search must be 1–30 letters, numbers, or spaces.')

  try {
    const { value } = await cached(`search:${q.toUpperCase()}`, 30 * 60_000, 60_000, async () => {
      const json = await tdFetch<SearchJson>('/symbol_search', { symbol: q, outputsize: '15' })
      return (json.data ?? []).map(
        (d): Instrument & { type: string; country?: string } => ({
          symbol: d.symbol,
          name: d.instrument_name,
          exchange: d.exchange,
          asset: assetFromType(d.instrument_type),
          type: d.instrument_type,
          country: d.country,
        }),
      )
    })
    return NextResponse.json({ results: value }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return errorResponse(error)
  }
}
