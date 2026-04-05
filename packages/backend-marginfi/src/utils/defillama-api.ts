/**
 * DeFi Llama yield API client for historical rate data.
 *
 * Used for backtesting — pulls historical APY timeseries for any pool.
 * Works for any protocol listed in DeFi Llama yields (Kamino, Jupiter, Save, etc.).
 *
 * Note: Marginfi lending pools are NOT listed in DeFi Llama yields API.
 * For Marginfi backtest, use comparable protocol data or the rate snapshotter.
 *
 * Known pool IDs:
 * - Kamino USDC lending: d2141a59-c199-4be7-8d4b-c8223954836b
 * - Jupiter USDC lending: d783c8df-e2ed-44b4-8317-161ccc1b5f06
 */

const DEFILLAMA_YIELDS_BASE = 'https://yields.llama.fi'

export interface HistoricalRatePoint {
  timestamp: number    // epoch ms
  apy: number          // decimal (0.065 = 6.5%)
  tvlUsd: number
}

interface RawChartEntry {
  timestamp: string
  tvlUsd: number
  apy: number | null
  apyBase: number | null
  apyReward: number | null
}

interface ChartResponse {
  status: string
  data: RawChartEntry[]
}

/**
 * Parse DeFi Llama chart response into typed rate points.
 * Converts percentage APY (6.5) to decimal (0.065).
 * Filters out entries with null/zero APY.
 */
export function parseHistoricalResponse(raw: ChartResponse): HistoricalRatePoint[] {
  return raw.data
    .filter((entry) => entry.apy != null && entry.apy > 0)
    .map((entry) => ({
      timestamp: new Date(entry.timestamp).getTime(),
      apy: entry.apy! / 100,
      tvlUsd: entry.tvlUsd,
    }))
}

/**
 * Fetch historical APY timeseries from DeFi Llama for a given pool.
 * Returns daily data points going back to pool creation.
 */
export async function fetchHistoricalRates(poolId: string): Promise<HistoricalRatePoint[]> {
  const url = `${DEFILLAMA_YIELDS_BASE}/chart/${poolId}`
  const res = await fetch(url)

  if (!res.ok) {
    throw new Error(`DeFi Llama API error: ${res.status} ${res.statusText}`)
  }

  const data = (await res.json()) as ChartResponse
  return parseHistoricalResponse(data)
}
