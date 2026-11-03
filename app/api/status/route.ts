import { NextResponse } from 'next/server'
import { cached } from '@/lib/server/cache'
import { budgetSnapshot } from '@/lib/server/rate-limit'
import { ProviderError, isConfigured, tdFetch } from '@/lib/server/twelvedata'
import type { ProviderStatus } from '@/lib/types'

export const dynamic = 'force-dynamic'

interface UsageJson {
  current_usage?: number
  plan_limit?: number
  daily_usage?: number
  plan_daily_limit?: number
  plan_category?: string
}

export async function GET() {
  const base = { checkedAt: new Date().toISOString(), safeguard: budgetSnapshot() }

  if (!isConfigured()) {
    const body: ProviderStatus = {
      ...base,
      configured: false,
      ok: false,
      message: 'TWELVE_DATA_API_KEY is not set on the server.',
    }
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } })
  }

  try {
    // api_usage does not consume data credits, so it is not counted against the local safeguard.
    const { value } = await cached('api_usage', 30_000, 30_000, () => tdFetch<UsageJson>('/api_usage', {}, 0))
    const body: ProviderStatus = {
      ...base,
      configured: true,
      ok: true,
      planCategory: value.plan_category,
      minuteUsage: value.current_usage,
      minuteLimit: value.plan_limit,
      dailyUsage: value.daily_usage,
      dailyLimit: value.plan_daily_limit,
    }
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const body: ProviderStatus = {
      ...base,
      configured: true,
      ok: false,
      message: error instanceof ProviderError ? error.message : 'Could not check Twelve Data status.',
    }
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } })
  }
}
