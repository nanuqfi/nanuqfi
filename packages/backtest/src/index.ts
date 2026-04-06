export type {
  BacktestConfig,
  BacktestResult,
  BacktestDataPoint,
  HistoricalDataPoint,
  ProtocolMetrics,
} from './types'
export { DEFAULT_BACKTEST_CONFIG } from './types'
export { runBacktest } from './engine'
export { fetchHistoricalData } from './data-loader'
export {
  computeCagr,
  computeMaxDrawdown,
  computeSharpeRatio,
  computeSortinoRatio,
  computeVolatility,
} from './metrics'
