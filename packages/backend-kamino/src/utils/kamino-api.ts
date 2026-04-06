/**
 * Kamino REST API client for lending rate data.
 *
 * Uses api.kamino.finance — no SDK dependency, pure HTTP.
 * Provides both live rates and historical data for backtesting.
 */

import { fetchWithRetry } from '@nanuqfi/core'

const DEFAULT_API_BASE = 'https://api.kamino.finance'

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

const CACHE_TTL_MS = 60_000

interface CacheEntry<T> {
  value: T
  timestamp: number
}

let metricsCache: CacheEntry<KaminoReserveMetrics> | null = null

export function clearKaminoCache(): void {
  metricsCache = null
}

function isCacheValid<T>(entry: CacheEntry<T> | null): entry is CacheEntry<T> {
  if (!entry) return false
  return Date.now() - entry.timestamp < CACHE_TTL_MS
}

export async function fetchUsdcReserveMetrics(
  apiBaseUrl: string = DEFAULT_API_BASE
): Promise<KaminoReserveMetrics> {
  if (isCacheValid(metricsCache)) return metricsCache.value

  const url = `${apiBaseUrl}/kamino-market/${KAMINO_MAIN_MARKET}/reserves/metrics`
  const res = await fetchWithRetry(url)

  if (!res.ok) {
    throw new Error(`Kamino API error: ${res.status} ${res.statusText}`)
  }

  const data = (await res.json()) as RawReserveEntry[]
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

  metricsCache = { value: metrics, timestamp: Date.now() }
  return metrics
}

export async function fetchHistoricalMetrics(
  apiBaseUrl: string = DEFAULT_API_BASE
): Promise<KaminoHistoricalPoint[]> {
  const url = `${apiBaseUrl}/kamino-market/${KAMINO_MAIN_MARKET}/reserves/${KAMINO_USDC_RESERVE}/metrics/history`
  const res = await fetchWithRetry(url)

  if (!res.ok) {
    throw new Error(`Kamino API error: ${res.status} ${res.statusText}`)
  }

  const data = (await res.json()) as RawHistoryResponse

  return data.history.map((entry) => ({
    timestamp: new Date(entry.timestamp).getTime(),
    supplyApy: entry.metrics.supplyInterestAPY,
    borrowApy: entry.metrics.borrowInterestAPY,
    tvlUsd: Number(entry.metrics.depositTvl),
  }))
}
