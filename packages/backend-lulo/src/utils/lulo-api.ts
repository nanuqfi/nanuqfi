/**
 * Lulo REST API client for lending rate and pool data.
 *
 * Lulo is Solana's lending aggregator — routes deposits across
 * Kamino, Drift, MarginFi, Jupiter to the highest-yielding protocol.
 *
 * Uses api.lulo.fi — no SDK dependency, pure HTTP.
 * Requires x-api-key header for all requests.
 *
 * Rate format:
 *   - rates.getRates → values are PERCENTAGE (8.25 = 8.25%) → divide by 100
 *   - pool.getPools  → APY values are already DECIMAL (0.0825 = 8.25%) → no conversion
 */

const DEFAULT_API_BASE = 'https://api.lulo.fi'
const CACHE_TTL_MS = 60_000

export interface LuloRates {
  regularApy: number
  protectedApy: number
  regular24hApy: number
  protected24hApy: number
}

export interface LuloPoolData {
  totalLiquidity: number
  availableLiquidity: number
  regularApy: number
  protectedApy: number
  averagePoolRate: number
}

interface RawRatesResponse {
  regular: {
    CURRENT: number
    '1HR': number
    '24HR': number
    '7DAY': number
    '30DAY': number
    '1YR': number
  }
  protected: {
    CURRENT: number
    '1HR': number
    '24HR': number
    '7DAY': number
    '30DAY': number
    '1YR': number
  }
}

interface RawPoolResponse {
  regular: { type: string; apy: number; maxWithdrawalAmount: number; price: number }
  protected: { type: string; apy: number; openCapacity: number; price: number }
  averagePoolRate: number
  totalLiquidity: number
  availableLiquidity: number
  regularLiquidityAmount: number
  protectedLiquidityAmount: number
  regularAvailableAmount: number
}

interface CacheEntry<T> {
  value: T
  timestamp: number
}

let ratesCache: CacheEntry<LuloRates> | null = null
let poolCache: CacheEntry<LuloPoolData> | null = null

export function clearLuloCache(): void {
  ratesCache = null
  poolCache = null
}

function isCacheValid<T>(entry: CacheEntry<T> | null): entry is CacheEntry<T> {
  if (!entry) return false
  return Date.now() - entry.timestamp < CACHE_TTL_MS
}

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    'x-api-key': apiKey,
    'Content-Type': 'application/json',
  }
}

/**
 * Fetch current and 24h APY rates from Lulo rates endpoint.
 *
 * NOTE: Response values are PERCENTAGE — this function converts to decimal by ÷ 100.
 */
export async function fetchLuloRates(
  apiKey: string,
  apiBaseUrl: string = DEFAULT_API_BASE
): Promise<LuloRates> {
  if (isCacheValid(ratesCache)) return ratesCache.value

  const url = `${apiBaseUrl}/v1/rates.getRates`
  const res = await fetch(url, { headers: buildHeaders(apiKey) })

  if (!res.ok) {
    throw new Error(`Lulo API error: ${res.status} ${res.statusText}`)
  }

  const data = (await res.json()) as RawRatesResponse

  // Convert from percentage to decimal
  const rates: LuloRates = {
    regularApy: data.regular.CURRENT / 100,
    protectedApy: data.protected.CURRENT / 100,
    regular24hApy: data.regular['24HR'] / 100,
    protected24hApy: data.protected['24HR'] / 100,
  }

  ratesCache = { value: rates, timestamp: Date.now() }
  return rates
}

/**
 * Fetch pool statistics from Lulo pool endpoint.
 *
 * NOTE: APY values in pool data are already DECIMAL — no conversion needed.
 */
export async function fetchLuloPoolData(
  apiKey: string,
  apiBaseUrl: string = DEFAULT_API_BASE
): Promise<LuloPoolData> {
  if (isCacheValid(poolCache)) return poolCache.value

  const url = `${apiBaseUrl}/v1/pool.getPools`
  const res = await fetch(url, { headers: buildHeaders(apiKey) })

  if (!res.ok) {
    throw new Error(`Lulo API error: ${res.status} ${res.statusText}`)
  }

  const data = (await res.json()) as RawPoolResponse

  const pool: LuloPoolData = {
    totalLiquidity: data.totalLiquidity,
    availableLiquidity: data.availableLiquidity,
    regularApy: data.regular.apy,
    protectedApy: data.protected.apy,
    averagePoolRate: data.averagePoolRate,
  }

  poolCache = { value: pool, timestamp: Date.now() }
  return pool
}
