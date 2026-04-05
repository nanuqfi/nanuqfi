import { describe, it, expect } from 'vitest'
import { fetchUsdcReserveMetrics, fetchHistoricalMetrics, clearKaminoCache } from '../utils/kamino-api'
import { KaminoLendingBackend } from '../backends/lending'

const SKIP = !process.env.KAMINO_INTEGRATION

describe.skipIf(!SKIP)('Kamino mainnet integration', () => {
  it('fetches live USDC supply APY', async () => {
    clearKaminoCache()
    const metrics = await fetchUsdcReserveMetrics()

    expect(metrics.supplyApy).toBeGreaterThan(0.001)
    expect(metrics.supplyApy).toBeLessThan(0.30)
    expect(metrics.totalSupplyUsd).toBeGreaterThan(1_000_000)
    console.log(`Kamino USDC supply APY: ${(metrics.supplyApy * 100).toFixed(2)}%`)
    console.log(`TVL: $${(metrics.totalSupplyUsd / 1e6).toFixed(1)}M`)
  }, 15_000)

  it('fetches historical metrics', async () => {
    const points = await fetchHistoricalMetrics()

    expect(points.length).toBeGreaterThan(1000)
    expect(points[points.length - 1]!.supplyApy).toBeGreaterThan(0)
    console.log(`Historical data points: ${points.length}`)
    console.log(`Date range: ${new Date(points[0]!.timestamp).toISOString()} → ${new Date(points[points.length - 1]!.timestamp).toISOString()}`)
  }, 30_000)

  it('backend works end-to-end in real mode', async () => {
    clearKaminoCache()
    const backend = new KaminoLendingBackend({ mockMode: false })

    const estimate = await backend.getExpectedYield()
    expect(estimate.annualizedApy).toBeGreaterThan(0.001)
    expect(estimate.metadata?.mode).toBe('real')

    const risk = await backend.getRisk()
    expect(risk.volatilityScore).toBeGreaterThan(0)

    console.log(`Live APY: ${(estimate.annualizedApy * 100).toFixed(2)}%`)
    console.log(`Volatility: ${risk.volatilityScore.toFixed(4)}`)
  }, 15_000)
})
