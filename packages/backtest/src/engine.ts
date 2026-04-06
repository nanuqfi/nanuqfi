import type { HistoricalDataPoint, BacktestConfig, BacktestResult, BacktestDataPoint } from './types'
import { computeCagr, computeMaxDrawdown, computeSharpeRatio, computeSortinoRatio, computeVolatility } from './metrics'

const DAYS_PER_YEAR = 365

// Risk-adjusted weights: lower-volatility protocols get a slight preference
// when yields are equal, acting as a tiebreaker toward stability.
const VOLATILITY_WEIGHTS: Record<string, number> = {
  'kamino-lending': 1.0,
  'marginfi-lending': 0.95,
  'lulo-lending': 0.90,
}

function computeWeights(
  kaminoApy: number,
  marginfiApy: number,
  luloApy: number,
): Record<string, number> {
  const scores: Record<string, number> = {
    'kamino-lending': kaminoApy * VOLATILITY_WEIGHTS['kamino-lending']!,
    'marginfi-lending': marginfiApy * VOLATILITY_WEIGHTS['marginfi-lending']!,
    'lulo-lending': luloApy * VOLATILITY_WEIGHTS['lulo-lending']!,
  }
  const total = Object.values(scores).reduce((a, b) => a + b, 0)
  if (total === 0) {
    return { 'kamino-lending': 1 / 3, 'marginfi-lending': 1 / 3, 'lulo-lending': 1 / 3 }
  }
  const weights: Record<string, number> = {}
  for (const [key, score] of Object.entries(scores)) {
    weights[key] = score / total
  }
  return weights
}

export function runBacktest(data: HistoricalDataPoint[], config: BacktestConfig): BacktestResult {
  const initial = config.initialDeposit
  let portfolioValue = initial
  let kaminoValue = initial
  let marginfiValue = initial
  let luloValue = initial

  const series: BacktestDataPoint[] = []
  const portfolioValues: number[] = []
  const dailyReturns: number[] = []

  for (let i = 0; i < data.length; i++) {
    const day = data[i]!

    // Day 0: record opening state — all portfolios at initial deposit
    if (i === 0) {
      series.push({
        timestamp: day.timestamp,
        portfolioValue: initial,
        kaminoValue: initial,
        marginfiValue: initial,
        luloValue: initial,
      })
      portfolioValues.push(initial)
      continue
    }

    // Compute router weights based on risk-adjusted yield scores
    const weights = computeWeights(day.kaminoApy, day.marginfiApy, day.luloApy)

    const routerDailyReturn =
      (weights['kamino-lending']! * day.kaminoApy +
        weights['marginfi-lending']! * day.marginfiApy +
        weights['lulo-lending']! * day.luloApy) /
      DAYS_PER_YEAR

    const prevPortfolio = portfolioValue
    portfolioValue *= 1 + routerDailyReturn
    kaminoValue *= 1 + day.kaminoApy / DAYS_PER_YEAR
    marginfiValue *= 1 + day.marginfiApy / DAYS_PER_YEAR
    luloValue *= 1 + day.luloApy / DAYS_PER_YEAR

    series.push({ timestamp: day.timestamp, portfolioValue, kaminoValue, marginfiValue, luloValue })
    portfolioValues.push(portfolioValue)
    dailyReturns.push((portfolioValue - prevPortfolio) / prevPortfolio)
  }

  const last = series[series.length - 1]!
  const days = data.length

  const totalReturn = (last.portfolioValue - initial) / initial
  const cagr = computeCagr(initial, last.portfolioValue, days)
  const maxDrawdown = computeMaxDrawdown(portfolioValues)
  const volatility = computeVolatility(dailyReturns)
  const sharpeRatio = computeSharpeRatio(cagr, config.riskFreeRate, volatility)
  const sortinoRatio = computeSortinoRatio(dailyReturns, config.riskFreeRate)

  // Per-protocol daily return series for individual metrics
  const kaminoReturns = series
    .slice(1)
    .map((p, i) => (p.kaminoValue - series[i]!.kaminoValue) / series[i]!.kaminoValue)
  const marginfiReturns = series
    .slice(1)
    .map((p, i) => (p.marginfiValue - series[i]!.marginfiValue) / series[i]!.marginfiValue)
  const luloReturns = series
    .slice(1)
    .map((p, i) => (p.luloValue - series[i]!.luloValue) / series[i]!.luloValue)

  function protocolMetrics(endValue: number, returns: number[], values: number[]) {
    const tr = (endValue - initial) / initial
    const c = computeCagr(initial, endValue, days)
    const md = computeMaxDrawdown(values)
    const vol = computeVolatility(returns)
    return {
      totalReturn: tr,
      cagr: c,
      maxDrawdown: md,
      sharpeRatio: computeSharpeRatio(c, config.riskFreeRate, vol),
    }
  }

  const startDate = new Date(data[0]!.timestamp).toISOString().split('T')[0]!
  const endDate = new Date(data[data.length - 1]!.timestamp).toISOString().split('T')[0]!

  return {
    totalReturn,
    cagr,
    maxDrawdown,
    sharpeRatio,
    sortinoRatio,
    volatility,
    protocols: {
      'kamino-lending': protocolMetrics(
        last.kaminoValue,
        kaminoReturns,
        series.map((s) => s.kaminoValue),
      ),
      'marginfi-lending': protocolMetrics(
        last.marginfiValue,
        marginfiReturns,
        series.map((s) => s.marginfiValue),
      ),
      'lulo-lending': protocolMetrics(
        last.luloValue,
        luloReturns,
        series.map((s) => s.luloValue),
      ),
    },
    series,
    startDate,
    endDate,
    dataPoints: data.length,
    riskFreeRate: config.riskFreeRate,
  }
}
