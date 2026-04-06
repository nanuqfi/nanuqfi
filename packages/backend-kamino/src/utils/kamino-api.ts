/**
 * Kamino REST API client for lending rate data.
 *
 * Uses api.kamino.finance — no SDK dependency, pure HTTP.
 * Provides both live rates and historical data for backtesting.
 */

import { fetchWithRetry, TtlCache, getEnv } from '@nanuqfi/core'

const DEFAULT_API_BASE = getEnv('KAMINO_API_URL') ?? 'https://api.kamino.finance'

export const KAMINO_MAIN_MARKET = '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF'
export const KAMINO_USDC_RESERVE = 'D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59'

export interface KaminoReserveMetrics {
  supplyApy: number
  borrowApy: number
  totalSupplyUsd: number
  totalBorrowUsd: number
  availableLiquidityUsd: number
  utilization: number
}

export interface KaminoHistoricalPoint {
  timestamp: number
  supplyApy: number
  borrowApy: number
  tvlUsd: number
}

interface RawReserveEntry {
  reserve: string
  liquidityToken: string
  supplyApy: string
  borrowApy: string
  totalSupplyUsd: string
  totalBorrowUsd: string
}

interface RawHistoryEntry {
  timestamp: string
  metrics: {
    supplyInterestAPY: number
    borrowInterestAPY: number
    depositTvl: string
  }
}

interface RawHistoryResponse {
  reserve: string
  history: RawHistoryEntry[]
}

const metricsCache = new TtlCache<KaminoReserveMetrics>(60_000, 120_000)

export function clearKaminoCache(): void {
  metricsCache.clear()
}

export async function fetchUsdcReserveMetrics(
  apiBaseUrl: string = DEFAULT_API_BASE
): Promise<KaminoReserveMetrics> {
  const cached = metricsCache.get('metrics')
  if (cached && !cached.stale) return cached.value

  try {
    const url = `${apiBaseUrl}/kamino-market/${KAMINO_MAIN_MARKET}/reserves/metrics`
    const res = await fetchWithRetry(url)
    const data = (await res.json()) as RawReserveEntry[]

    if (!Array.isArray(data)) {
      throw new Error(`Kamino API: expected array, got ${typeof data}`)
    }

    const usdc = data.find((r) => r.liquidityToken === 'USDC')

    if (!usdc) {
      throw new Error('USDC reserve not found in Kamino response')
    }

    const totalSupplyUsd = Number(usdc.totalSupplyUsd)
    const totalBorrowUsd = Number(usdc.totalBorrowUsd)

    const metrics: KaminoReserveMetrics = {
      supplyApy: Number(usdc.supplyApy),
      borrowApy: Number(usdc.borrowApy),
      totalSupplyUsd,
      totalBorrowUsd,
      availableLiquidityUsd: totalSupplyUsd - totalBorrowUsd,
      utilization: totalSupplyUsd > 0 ? totalBorrowUsd / totalSupplyUsd : 0,
    }

    metricsCache.set('metrics', metrics)
    return metrics
  } catch (err) {
    if (cached?.stale) return cached.value
    throw err
  }
}

export async function fetchHistoricalMetrics(
  apiBaseUrl: string = DEFAULT_API_BASE
): Promise<KaminoHistoricalPoint[]> {
  const url = `${apiBaseUrl}/kamino-market/${KAMINO_MAIN_MARKET}/reserves/${KAMINO_USDC_RESERVE}/metrics/history`
  const res = await fetchWithRetry(url)
  const raw: unknown = await res.json()

  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { history?: unknown }).history)) {
    throw new Error('Kamino API: invalid history response shape')
  }

  const data = raw as RawHistoryResponse

  return data.history.map((entry) => ({
    timestamp: new Date(entry.timestamp).getTime(),
    supplyApy: entry.metrics.supplyInterestAPY,
    borrowApy: entry.metrics.borrowInterestAPY,
    tvlUsd: Number(entry.metrics.depositTvl),
  }))
}
