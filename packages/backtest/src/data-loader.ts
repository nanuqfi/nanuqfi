import type { HistoricalDataPoint, BacktestConfig } from './types'

interface RawHistoryEntry {
  timestamp: string
  metrics: { supplyInterestAPY: number; borrowInterestAPY: number; depositTvl: string }
}

interface RawHistoryResponse {
  reserve: string
  history: RawHistoryEntry[]
}

export async function fetchHistoricalData(
  config: BacktestConfig,
  apiBaseUrl: string = process.env.KAMINO_API_URL ?? 'https://api.kamino.finance'
): Promise<HistoricalDataPoint[]> {
  const market = config.kaminoMarket ?? '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF'
  const reserve = config.kaminoReserve ?? 'D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59'
  const url = `${apiBaseUrl}/kamino-market/${market}/reserves/${reserve}/metrics/history`
  const res = await fetch(url)

  if (!res.ok) {
    throw new Error(`Kamino API error: ${res.status} ${res.statusText}`)
  }

  const raw = (await res.json()) as RawHistoryResponse

  const hourly = raw.history
    .filter((entry) => entry.metrics.supplyInterestAPY > 0)
    .map((entry) => {
      const kaminoApy = entry.metrics.supplyInterestAPY
      const marginfiApy = kaminoApy * config.marginfiApyMultiplier
      const luloApy = Math.max(kaminoApy, marginfiApy) * config.luloApyMultiplier
      return {
        timestamp: new Date(entry.timestamp).getTime(),
        kaminoApy,
        marginfiApy,
        luloApy,
      }
    })

  return aggregateToDaily(hourly)
}

/**
 * Aggregates sub-daily (e.g. hourly) data points into daily averages.
 * The Kamino API returns ~hourly observations; treating each as a daily
 * data point causes the engine to compound ~24x too often, inflating returns.
 */
function aggregateToDaily(points: HistoricalDataPoint[]): HistoricalDataPoint[] {
  const byDay = new Map<string, HistoricalDataPoint[]>()
  for (const p of points) {
    const day = new Date(p.timestamp).toISOString().split('T')[0]!
    const existing = byDay.get(day) ?? []
    existing.push(p)
    byDay.set(day, existing)
  }

  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, dayPoints]) => ({
      timestamp: new Date(day + 'T00:00:00.000Z').getTime(),
      kaminoApy: dayPoints.reduce((s, p) => s + p.kaminoApy, 0) / dayPoints.length,
      marginfiApy: dayPoints.reduce((s, p) => s + p.marginfiApy, 0) / dayPoints.length,
      luloApy: dayPoints.reduce((s, p) => s + p.luloApy, 0) / dayPoints.length,
    }))
}
