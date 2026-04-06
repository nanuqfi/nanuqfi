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

import { fetchWithRetry, TtlCache } from '@nanuqfi/core'

const DEFAULT_API_BASE = 'https://api.lulo.fi'

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

const ratesCache = new TtlCache<LuloRates>(60_000, 120_000)
const poolCache = new TtlCache<LuloPoolData>(60_000, 120_000)

export function clearLuloCache(): void {
  ratesCache.clear()
  poolCache.clear()
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
  const cached = ratesCache.get('rates')
  if (cached && !cached.stale) return cached.value

  try {
    const url = `${apiBaseUrl}/v1/rates.getRates`
    const res = await fetchWithRetry(url, { headers: buildHeaders(apiKey) })
    const data = (await res.json()) as RawRatesResponse

    if (!data || typeof data !== 'object' || !(data as Record<string, unknown>).regular || !(data as Record<string, unknown>).protected) {
      throw new Error('Lulo API: invalid rates response shape')
    }

    // Convert from percentage to decimal
    const rates: LuloRates = {
      regularApy: data.regular.CURRENT / 100,
      protectedApy: data.protected.CURRENT / 100,
      regular24hApy: data.regular['24HR'] / 100,
      protected24hApy: data.protected['24HR'] / 100,
    }

    ratesCache.set('rates', rates)
    return rates
  } catch (err) {
    if (cached?.stale) return cached.value
    throw err
  }
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
  const cachedPool = poolCache.get('pool')
  if (cachedPool && !cachedPool.stale) return cachedPool.value

  try {
    const url = `${apiBaseUrl}/v1/pool.getPools`
    const res = await fetchWithRetry(url, { headers: buildHeaders(apiKey) })
    const data = (await res.json()) as RawPoolResponse

    if (!data || typeof data !== 'object' || typeof (data as Record<string, unknown>).totalLiquidity !== 'number') {
      throw new Error('Lulo API: invalid pool response shape')
    }

    const pool: LuloPoolData = {
      totalLiquidity: data.totalLiquidity,
      availableLiquidity: data.availableLiquidity,
      regularApy: data.regular.apy,
      protectedApy: data.protected.apy,
      averagePoolRate: data.averagePoolRate,
    }

    poolCache.set('pool', pool)
    return pool
  } catch (err) {
    if (cachedPool?.stale) return cachedPool.value
    throw err
  }
}
