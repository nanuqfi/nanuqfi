import { describe, it, expect } from 'vitest'
import { fetchLuloRates, fetchLuloPoolData, clearLuloCache } from '../utils/lulo-api'
import { LuloLendingBackend } from '../backends/lending'

const SKIP = !process.env.LULO_API_KEY

describe.skipIf(SKIP)('Lulo mainnet integration', () => {
  it('fetches live rates and validates decimal conversion', async () => {
    clearLuloCache()
    const apiKey = process.env.LULO_API_KEY!
    const rates = await fetchLuloRates(apiKey)

    // Values must be in decimal form (not percentage)
    expect(rates.regularApy).toBeGreaterThan(0.001)
    expect(rates.regularApy).toBeLessThan(0.50)   // sanity: < 50%
    expect(rates.protectedApy).toBeGreaterThan(0.001)
    expect(rates.protectedApy).toBeLessThan(0.50)
    expect(rates.regular24hApy).toBeGreaterThan(0.001)

    console.log(`Lulo regular APY (current): ${(rates.regularApy * 100).toFixed(2)}%`)
    console.log(`Lulo protected APY (current): ${(rates.protectedApy * 100).toFixed(2)}%`)
    console.log(`Lulo regular APY (24h): ${(rates.regular24hApy * 100).toFixed(2)}%`)
  }, 15_000)

  it('fetches live pool data', async () => {
    clearLuloCache()
    const apiKey = process.env.LULO_API_KEY!
    const pool = await fetchLuloPoolData(apiKey)

    expect(pool.totalLiquidity).toBeGreaterThan(1_000)
    expect(pool.availableLiquidity).toBeGreaterThan(0)
    expect(pool.regularApy).toBeGreaterThan(0.001)
    expect(pool.regularApy).toBeLessThan(0.50)
    expect(pool.averagePoolRate).toBeGreaterThan(0.001)

    console.log(`Total liquidity: $${(pool.totalLiquidity / 1e6).toFixed(1)}M`)
    console.log(`Available liquidity: $${(pool.availableLiquidity / 1e6).toFixed(1)}M`)
    console.log(`Average pool rate: ${(pool.averagePoolRate * 100).toFixed(2)}%`)
  }, 15_000)

  it('backend works end-to-end in real mode', async () => {
    clearLuloCache()
    const apiKey = process.env.LULO_API_KEY!
    const backend = new LuloLendingBackend({ mockMode: false, apiKey })

    const estimate = await backend.getExpectedYield()
    expect(estimate.annualizedApy).toBeGreaterThan(0.001)
    expect(estimate.annualizedApy).toBeLessThan(0.50)
    expect(estimate.metadata?.mode).toBe('real')
    expect(estimate.asset).toBe('USDC')

    const risk = await backend.getRisk()
    expect(risk.volatilityScore).toBeGreaterThan(0)
    expect(risk.volatilityScore).toBeLessThan(0.5)
    expect(risk.liquidationRisk).toBe('none')

    console.log(`Live APY: ${(estimate.annualizedApy * 100).toFixed(2)}%`)
    console.log(`Volatility score: ${risk.volatilityScore.toFixed(4)}`)
    console.log(`Utilization: ${((risk.metadata?.utilization as number) * 100).toFixed(2)}%`)
  }, 15_000)
})
