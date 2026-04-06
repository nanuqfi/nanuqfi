export type {
  BacktestConfig,
  BacktestResult,
  BacktestDataPoint,
  HistoricalDataPoint,
  ProtocolMetrics,
} from './types'
export { DEFAULT_BACKTEST_CONFIG } from './types'
export { fetchHistoricalData } from './data-loader'
export { runBacktest } from './engine'
