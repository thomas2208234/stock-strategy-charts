import { NextResponse, type NextRequest } from 'next/server'
import { EXCHANGE_RE, SYMBOL_RE, errorResponse, getSeries, invalid } from '@/lib/server/twelvedata'
import { INTERVAL_VALUES, type AssetClass, type Interval } from '@/lib/types'

export const dynamic = 'force-dynamic'

const ASSETS: AssetClass[] = ['stock', 'etf', 'future', 'other']

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const symbol = (params.get('symbol') ?? '').trim().toUpperCase()
  const interval = params.get('interval') as Interval
  const asset = (params.get('asset') ?? 'stock') as AssetClass
  const exchange = params.get('exchange')?.trim() || undefined
  const outputsize = Math.min(1000, Math.max(50, Number(params.get('outputsize')) || 300))

  if (!SYMBOL_RE.test(symbol)) return invalid('Invalid symbol.')
  if (!INTERVAL_VALUES.includes(interval)) return invalid(`Unsupported interval. Use one of: ${INTERVAL_VALUES.join(', ')}.`)
  if (!ASSETS.includes(asset)) return invalid('Invalid asset class.')
  if (exchange && !EXCHANGE_RE.test(exchange)) return invalid('Invalid exchange.')

  try {
    const data = await getSeries({ symbol, interval, asset, exchange, outputsize })
    return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return errorResponse(error)
  }
}
