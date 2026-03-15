// Drift client connection wrapper
// Real implementation will be built during Drift integration phase
// For now, backends use mockMode for unit testing

export interface DriftConnectionConfig {
  rpcUrl: string
  walletKeypairPath: string
  env?: 'devnet' | 'mainnet-beta'
}

// Placeholder — real Drift client init requires Context7 SDK docs verification
export function createDriftConnection(_config: DriftConnectionConfig): never {
  throw new Error(
    'Drift client initialization not yet implemented. ' +
    'Use mockMode for unit testing. ' +
    'Real connection will be built during Drift integration phase.'
  )
}
