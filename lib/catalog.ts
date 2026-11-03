import type { Instrument } from './types'

export const CATALOG: Instrument[] = [
  { symbol: 'AAPL', name: 'Apple Inc.', asset: 'stock' },
  { symbol: 'NVDA', name: 'NVIDIA Corp.', asset: 'stock' },
  { symbol: 'TSLA', name: 'Tesla Inc.', asset: 'stock' },
  { symbol: 'MSFT', name: 'Microsoft Corp.', asset: 'stock' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', asset: 'stock' },
  { symbol: 'META', name: 'Meta Platforms Inc.', asset: 'stock' },
  { symbol: 'GOOGL', name: 'Alphabet Inc. Class A', asset: 'stock' },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF', asset: 'etf' },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', asset: 'etf' },
  { symbol: 'DIA', name: 'SPDR Dow Jones Industrial ETF', asset: 'etf' },
  { symbol: 'IWM', name: 'iShares Russell 2000 ETF', asset: 'etf' },
  { symbol: 'ES', name: 'E-mini S&P 500 Futures', asset: 'future' },
  { symbol: 'MES', name: 'Micro E-mini S&P 500 Futures', asset: 'future' },
  { symbol: 'NQ', name: 'E-mini Nasdaq-100 Futures', asset: 'future' },
  { symbol: 'MNQ', name: 'Micro E-mini Nasdaq-100 Futures', asset: 'future' },
  { symbol: 'YM', name: 'E-mini Dow Futures', asset: 'future' },
  { symbol: 'MYM', name: 'Micro E-mini Dow Futures', asset: 'future' },
  { symbol: 'RTY', name: 'E-mini Russell 2000 Futures', asset: 'future' },
  { symbol: 'M2K', name: 'Micro E-mini Russell 2000 Futures', asset: 'future' },
]

export const FUTURES_ETF_PROXY: Record<string, string> = {
  ES: 'SPY',
  MES: 'SPY',
  NQ: 'QQQ',
  MNQ: 'QQQ',
  YM: 'DIA',
  MYM: 'DIA',
  RTY: 'IWM',
  M2K: 'IWM',
}

export function findCatalog(symbol: string, asset?: string): Instrument | undefined {
  return CATALOG.find((i) => i.symbol === symbol && (!asset || i.asset === asset))
}

export const ASSET_LABEL: Record<string, string> = {
  stock: 'Stock',
  etf: 'ETF',
  future: 'Future',
  other: 'Other',
}
