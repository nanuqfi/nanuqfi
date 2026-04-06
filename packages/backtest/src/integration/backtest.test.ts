import { describe, it, expect } from 'vitest'
import { fetchHistoricalData } from '../data-loader'
import { runBacktest } from '../engine'
import { DEFAULT_BACKTEST_CONFIG } from '../types'

const SKIP = !process.env.BACKTEST_INTEGRATION

describe.skipIf(SKIP)('Backtest full integration', () => {
  it('runs backtest on real Kamino historical data', async () => {
    const data = await fetchHistoricalData(DEFAULT_BACKTEST_CONFIG)
    expect(data.length).toBeGreaterThan(1000)

    const result = runBacktest(data, DEFAULT_BACKTEST_CONFIG)

    console.log(`\n📊 BACKTEST RESULTS (${result.startDate} → ${result.endDate})`)
    console.log(`   Data points: ${result.dataPoints}`)
    console.log(`   NanuqFi Router: ${(result.totalReturn * 100).toFixed(2)}% total, ${(result.cagr * 100).toFixed(2)}% CAGR`)
    console.log(`   Max Drawdown: ${(result.maxDrawdown * 100).toFixed(2)}%`)
    console.log(`   Sharpe Ratio: ${result.sharpeRatio.toFixed(3)}`)
    console.log(`   Sortino Ratio: ${result.sortinoRatio.toFixed(3)}`)
    console.log(`   Volatility: ${(result.volatility * 100).toFixed(2)}%`)
    console.log(`\n   vs Individual Protocols:`)
    for (const [name, metrics] of Object.entries(result.protocols)) {
      console.log(`   ${name}: ${(metrics.totalReturn * 100).toFixed(2)}% total, ${(metrics.cagr * 100).toFixed(2)}% CAGR, Sharpe ${metrics.sharpeRatio.toFixed(3)}`)
    }

    expect(result.totalReturn).toBeGreaterThan(0)
    expect(result.cagr).toBeGreaterThan(0)
    expect(result.sharpeRatio).toBeGreaterThan(0)
    expect(result.protocols['kamino-lending']).toBeDefined()
    expect(result.totalReturn).toBeGreaterThan(result.protocols['kamino-lending']!.totalReturn)
  }, 30_000)
})
