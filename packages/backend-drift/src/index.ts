// @nanuqfi/backend-drift — Drift Protocol yield backends

export { DriftLendingBackend } from './backends/lending'
export type { DriftLendingConfig } from './backends/lending'

export { DriftInsuranceBackend } from './backends/insurance'
export type { DriftInsuranceConfig } from './backends/insurance'

export { DriftBasisTradeBackend } from './backends/basis-trade'
export type { DriftBasisTradeConfig } from './backends/basis-trade'

export { DriftFundingBackend } from './backends/funding'
export type { DriftFundingConfig } from './backends/funding'

export { DriftJitoDNBackend } from './backends/jito-dn'
export type { DriftJitoDNConfig } from './backends/jito-dn'

export { createDriftConnection, isSubscriptionHealthy } from './drift-connection'
export type { DriftConnectionConfig } from './drift-connection'

export { toBN, fromBN, toSpotPrecision, fromSpotPrecision } from './utils/bn-convert'

export { fetchFundingRates, fetchDepositRate, fetchBorrowRate, parseFundingRate, parseDepositRate, DRIFT_DATA_API_URL } from './utils/drift-data-api'
export type { RawFundingRate, ParsedFundingRate } from './utils/drift-data-api'
