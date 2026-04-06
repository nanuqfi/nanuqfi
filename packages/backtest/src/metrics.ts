const DAYS_PER_YEAR = 365
const SQRT_DAYS_PER_YEAR = Math.sqrt(DAYS_PER_YEAR)

export function computeCagr(startValue: number, endValue: number, days: number): number {
  if (days <= 0 || startValue <= 0) return 0
  return Math.pow(endValue / startValue, DAYS_PER_YEAR / days) - 1
}

export function computeMaxDrawdown(values: number[]): number {
  if (values.length < 2) return 0
  let peak = values[0]!
  let maxDd = 0
  for (const v of values) {
    if (v > peak) peak = v
    const dd = (peak - v) / peak
    if (dd > maxDd) maxDd = dd
  }
  return maxDd
}

export function computeVolatility(dailyReturns: number[]): number {
  if (dailyReturns.length < 2) return 0
  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length
  const variance = dailyReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (dailyReturns.length - 1)
  return Math.sqrt(variance) * SQRT_DAYS_PER_YEAR
}

export function computeSharpeRatio(annualizedReturn: number, riskFreeRate: number, volatility: number): number {
  if (volatility === 0) return 0
  return (annualizedReturn - riskFreeRate) / volatility
}

export function computeSortinoRatio(dailyReturns: number[], riskFreeRate: number): number {
  if (dailyReturns.length < 2) return 0
  const dailyRf = riskFreeRate / DAYS_PER_YEAR
  const excessReturns = dailyReturns.map(r => r - dailyRf)
  const downsideReturns = excessReturns.filter(r => r < 0)
  if (downsideReturns.length === 0) return 0
  const downsideVariance = downsideReturns.reduce((sum, r) => sum + r ** 2, 0) / downsideReturns.length
  const downsideDev = Math.sqrt(downsideVariance) * SQRT_DAYS_PER_YEAR
  if (downsideDev === 0) return 0
  const annualizedReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length * DAYS_PER_YEAR
  return (annualizedReturn - riskFreeRate) / downsideDev
}
