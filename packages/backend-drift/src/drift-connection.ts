import { Connection, type Commitment } from '@solana/web3.js'
import {
  Wallet,
  loadKeypair,
  DriftClient,
  initialize,
  getMarketsAndOraclesForSubscription,
  type DriftClientConfig,
} from '@drift-labs/sdk'

export interface DriftConnectionConfig {
  rpcUrl: string
  rpcFallbackUrl?: string
  walletKeypairPath: string
  env?: 'devnet' | 'mainnet-beta'
  commitment?: Commitment
}

function buildClientConfig(
  connection: Connection,
  wallet: Wallet,
  env: 'devnet' | 'mainnet-beta',
  commitment: Commitment
): DriftClientConfig {
  const { perpMarketIndexes, spotMarketIndexes, oracleInfos } =
    getMarketsAndOraclesForSubscription(env)

  return {
    // Type assertion needed: @solana/web3.js minor version mismatch
    // between this package and @drift-labs/sdk peer dep. Identical at runtime.
    connection: connection as unknown as DriftClientConfig['connection'],
    wallet,
    env,
    opts: { commitment, preflightCommitment: commitment },
    accountSubscription: {
      type: 'websocket',
      commitment,
    },
    perpMarketIndexes,
    spotMarketIndexes,
    oracleInfos,
  }
}

export async function createDriftConnection(
  config: DriftConnectionConfig
): Promise<DriftClient> {
  const env = config.env ?? 'devnet'
  const commitment = config.commitment ?? 'confirmed'

  const keypair = loadKeypair(config.walletKeypairPath)
  const wallet = new Wallet(keypair)

  initialize({ env })

  let connection = new Connection(config.rpcUrl, { commitment })

  try {
    const client = new DriftClient(
      buildClientConfig(connection, wallet, env, commitment)
    )
    await client.subscribe()
    return client
  } catch (primaryError) {
    if (!config.rpcFallbackUrl) {
      throw primaryError
    }

    connection = new Connection(config.rpcFallbackUrl, { commitment })
    const client = new DriftClient(
      buildClientConfig(connection, wallet, env, commitment)
    )
    await client.subscribe()
    return client
  }
}

export function isSubscriptionHealthy(client: DriftClient): boolean {
  return client.isSubscribed
}
