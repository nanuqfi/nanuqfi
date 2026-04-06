import { describe, it, expect } from 'vitest'
import { computeCagr, computeMaxDrawdown, computeSharpeRatio, computeSortinoRatio, computeVolatility } from './metrics'

describe('computeCagr', () => {
  it('computes compound annual growth rate', () => {
    expect(computeCagr(10000, 11000, 365)).toBeCloseTo(0.10, 2)
  })
  it('computes CAGR over 2 years', () => {
    expect(computeCagr(10000, 12100, 730)).toBeCloseTo(0.10, 2)
  })
  it('returns 0 for zero days', () => {
    expect(computeCagr(10000, 10000, 0)).toBe(0)
  })
})

describe('computeMaxDrawdown', () => {
  it('finds worst peak-to-trough decline', () => {
    const values = [100, 110, 105, 95, 100, 108]
    expect(computeMaxDrawdown(values)).toBeCloseTo(0.1364, 3)
  })
  it('returns 0 for monotonically increasing series', () => {
    expect(computeMaxDrawdown([100, 101, 102, 103])).toBe(0)
  })
  it('returns 0 for empty series', () => {
    expect(computeMaxDrawdown([])).toBe(0)
  })
})

describe('computeVolatility', () => {
  it('computes annualized volatility from daily returns', () => {
    const returns = Array(30).fill(0.001)
    expect(computeVolatility(returns)).toBeCloseTo(0, 5)
  })
  it('returns 0 for empty returns', () => {
    expect(computeVolatility([])).toBe(0)
  })
})

describe('computeSharpeRatio', () => {
  it('computes risk-adjusted return', () => {
    expect(computeSharpeRatio(0.10, 0.04, 0.12)).toBeCloseTo(0.5, 2)
  })
  it('returns 0 for zero volatility', () => {
    expect(computeSharpeRatio(0.10, 0.04, 0)).toBe(0)
  })
})

describe('computeSortinoRatio', () => {
  it('uses only downside deviation', () => {
    const returns = [0.01, -0.005, 0.008, -0.003, 0.012, -0.001]
    const result = computeSortinoRatio(returns, 0.04)
    expect(result).toBeGreaterThan(0)
  })
  it('returns 0 for empty returns', () => {
    expect(computeSortinoRatio([], 0.04)).toBe(0)
  })
})
