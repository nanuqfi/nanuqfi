import type { HistoricalDataPoint, BacktestConfig } from './types'

const KAMINO_MAIN_MARKET = '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF'
const KAMINO_USDC_RESERVE = 'D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59'

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
  apiBaseUrl: string = 'https://api.kamino.finance'
): Promise<HistoricalDataPoint[]> {
  const url = `${apiBaseUrl}/kamino-market/${KAMINO_MAIN_MARKET}/reserves/${KAMINO_USDC_RESERVE}/metrics/history`
  const res = await fetch(url)

  if (!res.ok) {
    throw new Error(`Kamino API error: ${res.status} ${res.statusText}`)
  }

  const raw = (await res.json()) as RawHistoryResponse

  return raw.history
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
}
