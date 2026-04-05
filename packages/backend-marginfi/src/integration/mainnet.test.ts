import { describe, it, expect } from 'vitest'
import { createReadOnlyMarginfiClient } from '../utils/marginfi-connection'
import { fetchLendingRate, fetchBankMetrics, clearRateCache } from '../utils/marginfi-data-api'

const RPC_URL = process.env.SOLANA_RPC_URL

describe.skipIf(!RPC_URL)('Marginfi mainnet integration', () => {
  it('connects to mainnet and fetches USDC lending rate', async () => {
    const client = await createReadOnlyMarginfiClient({ rpcUrl: RPC_URL! })
    clearRateCache()

    const rate = fetchLendingRate(client, 'USDC')

    // Mainnet USDC lending rate should be between 0.1% and 30%
    expect(rate).toBeGreaterThan(0.001)
    expect(rate).toBeLessThan(0.30)
    console.log(`Live Marginfi USDC lending rate: ${(rate * 100).toFixed(2)}%`)
  }, 30_000)

  it('fetches USDC bank metrics with non-zero TVL', async () => {
    const client = await createReadOnlyMarginfiClient({ rpcUrl: RPC_URL! })
    clearRateCache()

    const metrics = fetchBankMetrics(client, 'USDC')

    expect(metrics.utilization).toBeGreaterThan(0)
    expect(metrics.utilization).toBeLessThan(1)
    expect(metrics.totalAssets).toBeGreaterThan(0)
    expect(metrics.availableLiquidity).toBeGreaterThan(0)
    console.log(`Marginfi USDC utilization: ${(metrics.utilization * 100).toFixed(1)}%`)
    console.log(`Available liquidity: $${(metrics.availableLiquidity / 1e6).toFixed(0)}`)
  }, 30_000)

  it('creates backend in real mode with live client', async () => {
    const { MarginfiLendingBackend } = await import('../backends/lending')
    const client = await createReadOnlyMarginfiClient({ rpcUrl: RPC_URL! })

    const backend = new MarginfiLendingBackend({
      mockMode: false,
      marginfiClient: client,
    })

    const estimate = await backend.getExpectedYield()
    expect(estimate.annualizedApy).toBeGreaterThan(0.001)
    expect(estimate.metadata?.mode).toBe('real')

    const risk = await backend.getRisk()
    expect(risk.volatilityScore).toBeGreaterThan(0)
    expect(risk.liquidationRisk).toBe('none')

    console.log(`Live APY: ${(estimate.annualizedApy * 100).toFixed(2)}%`)
    console.log(`Volatility score: ${risk.volatilityScore.toFixed(4)}`)
  }, 30_000)
})
