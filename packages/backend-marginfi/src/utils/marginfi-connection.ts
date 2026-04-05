import { Connection, Keypair } from '@solana/web3.js'
import { MarginfiClient, getConfig } from '@mrgnlabs/marginfi-client-v2'
import { NodeWallet } from '@mrgnlabs/mrgn-common'

export interface MarginfiConnectionConfig {
  rpcUrl: string
  commitment?: 'confirmed' | 'finalized'
}

async function fetchMarginfiClient(config: MarginfiConnectionConfig): Promise<MarginfiClient> {
  const commitment = config.commitment ?? 'confirmed'
  const connection = new Connection(config.rpcUrl, { commitment })
  const wallet = new NodeWallet(Keypair.generate())
  const marginfiConfig = getConfig('production')

  return MarginfiClient.fetch(marginfiConfig, wallet, connection)
}

/**
 * Create a read-only MarginfiClient for fetching bank data from mainnet.
 * Uses a dummy wallet — no signing, no transactions.
 *
 * Throws synchronously on invalid config so callers can catch guard errors
 * without needing to await.
 */
export function createReadOnlyMarginfiClient(
  config: MarginfiConnectionConfig
): Promise<MarginfiClient> {
  if (!config.rpcUrl) {
    throw new Error('rpcUrl is required')
  }

  return fetchMarginfiClient(config)
}
