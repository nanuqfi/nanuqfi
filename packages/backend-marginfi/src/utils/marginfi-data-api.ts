/**
 * Marginfi data API — rate fetching with in-memory cache.
 *
 * Uses MarginfiClient's bank objects for on-chain reads.
 * The MarginfiBank/MarginfiClientLike types are minimal interfaces
 * so unit tests can provide lightweight mocks without importing the full SDK.
 */

export interface MarginfiBank {
  tokenSymbol: string
  mint: { toBase58(): string }
  mintDecimals: number
  computeInterestRates(): { lendingRate: number; borrowingRate: number }
  computeUtilizationRate(): number
  getTotalAssetQuantity(): { toNumber(): number }
  getTotalLiabilityQuantity(): { toNumber(): number }
}

export interface MarginfiClientLike {
  getBankByTokenSymbol(symbol: string): MarginfiBank | null
}

export interface BankMetrics {
  utilization: number
  totalAssets: number
  totalLiabilities: number
  availableLiquidity: number
}

const CACHE_TTL_MS = 60_000 // 60 seconds

interface CacheEntry<T> {
  value: T
  timestamp: number
}

const rateCache = new Map<string, CacheEntry<number>>()
const metricsCache = new Map<string, CacheEntry<BankMetrics>>()

export function clearRateCache(): void {
  rateCache.clear()
  metricsCache.clear()
}

function isCacheValid<T>(entry: CacheEntry<T> | undefined): entry is CacheEntry<T> {
  if (!entry) return false
  return Date.now() - entry.timestamp < CACHE_TTL_MS
}

function requireBank(client: MarginfiClientLike, tokenSymbol: string): MarginfiBank {
  const bank = client.getBankByTokenSymbol(tokenSymbol)
  if (!bank) {
    throw new Error(`Bank ${tokenSymbol} not found on Marginfi`)
  }
  return bank
}

/**
 * Fetch current lending rate from a Marginfi bank.
 * Returns APY as a decimal (e.g. 0.065 = 6.5%).
 * Results are cached for 60 seconds.
 */
export function fetchLendingRate(client: MarginfiClientLike, tokenSymbol: string): number {
  const cacheKey = `rate:${tokenSymbol}`
  const cached = rateCache.get(cacheKey)
  if (isCacheValid(cached)) return cached.value

  const bank = requireBank(client, tokenSymbol)
  const { lendingRate } = bank.computeInterestRates()

  rateCache.set(cacheKey, { value: lendingRate, timestamp: Date.now() })
  return lendingRate
}

/**
 * Fetch bank metrics: utilization, total assets/liabilities, available liquidity.
 * Results are cached for 60 seconds.
 */
export function fetchBankMetrics(client: MarginfiClientLike, tokenSymbol: string): BankMetrics {
  const cacheKey = `metrics:${tokenSymbol}`
  const cached = metricsCache.get(cacheKey)
  if (isCacheValid(cached)) return cached.value

  const bank = requireBank(client, tokenSymbol)
  const totalAssets = bank.getTotalAssetQuantity().toNumber()
  const totalLiabilities = bank.getTotalLiabilityQuantity().toNumber()

  const metrics: BankMetrics = {
    utilization: bank.computeUtilizationRate(),
    totalAssets,
    totalLiabilities,
    availableLiquidity: totalAssets - totalLiabilities,
  }

  metricsCache.set(cacheKey, { value: metrics, timestamp: Date.now() })
  return metrics
}
