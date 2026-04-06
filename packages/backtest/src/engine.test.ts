import { describe, it, expect } from 'vitest'
import { runBacktest } from './engine'
import type { HistoricalDataPoint } from './types'
import { DEFAULT_BACKTEST_CONFIG } from './types'

function makeSyntheticData(days: number, kaminoApy: number): HistoricalDataPoint[] {
  const start = new Date('2024-01-01').getTime()
  const DAY_MS = 86_400_000
  const config = DEFAULT_BACKTEST_CONFIG
  return Array.from({ length: days }, (_, i) => {
    const marginfiApy = kaminoApy * config.marginfiApyMultiplier
    const luloApy = Math.max(kaminoApy, marginfiApy) * config.luloApyMultiplier
    return { timestamp: start + i * DAY_MS, kaminoApy, marginfiApy, luloApy }
  })
}

describe('runBacktest', () => {
  it('produces correct number of data points', () => {
    const result = runBacktest(makeSyntheticData(100, 0.05), DEFAULT_BACKTEST_CONFIG)
    expect(result.series).toHaveLength(100)
    expect(result.dataPoints).toBe(100)
  })

  it('all portfolios start at initialDeposit', () => {
    const result = runBacktest(makeSyntheticData(10, 0.05), DEFAULT_BACKTEST_CONFIG)
    expect(result.series[0]!.portfolioValue).toBe(10000)
    expect(result.series[0]!.kaminoValue).toBe(10000)
  })

  it('portfolio grows over time with positive APY', () => {
    const result = runBacktest(makeSyntheticData(365, 0.05), DEFAULT_BACKTEST_CONFIG)
    expect(result.series[result.series.length - 1]!.portfolioValue).toBeGreaterThan(10000)
  })

  it('router outperforms lowest-yield protocol', () => {
    const result = runBacktest(makeSyntheticData(365, 0.05), DEFAULT_BACKTEST_CONFIG)
    const last = result.series[result.series.length - 1]!
    expect(last.portfolioValue).toBeGreaterThan(last.kaminoValue)
  })

  it('computes totalReturn correctly', () => {
    const result = runBacktest(makeSyntheticData(365, 0.05), DEFAULT_BACKTEST_CONFIG)
    const last = result.series[result.series.length - 1]!
    expect(result.totalReturn).toBeCloseTo((last.portfolioValue - 10000) / 10000, 4)
  })

  it('computes CAGR', () => {
    const result = runBacktest(makeSyntheticData(365, 0.05), DEFAULT_BACKTEST_CONFIG)
    expect(result.cagr).toBeGreaterThan(0)
  })

  it('includes protocol comparison metrics', () => {
    const result = runBacktest(makeSyntheticData(365, 0.05), DEFAULT_BACKTEST_CONFIG)
    expect(result.protocols['kamino-lending']).toBeDefined()
    expect(result.protocols['marginfi-lending']).toBeDefined()
    expect(result.protocols['lulo-lending']).toBeDefined()
    expect(result.protocols['kamino-lending']!.totalReturn).toBeGreaterThan(0)
  })

  it('sets metadata correctly', () => {
    const result = runBacktest(makeSyntheticData(100, 0.05), DEFAULT_BACKTEST_CONFIG)
    expect(result.startDate).toBe('2024-01-01')
    expect(result.riskFreeRate).toBe(0.04)
  })
})
