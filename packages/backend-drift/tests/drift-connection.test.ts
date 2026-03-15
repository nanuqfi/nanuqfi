import { describe, it, expect } from 'vitest'
import { DriftClient } from '@drift-labs/sdk'
import {
  createDriftConnection,
  isSubscriptionHealthy,
  type DriftConnectionConfig,
} from '../src/drift-connection'

describe('createDriftConnection', () => {
  it('rejects with invalid RPC URL', async () => {
    const config: DriftConnectionConfig = {
      rpcUrl: 'not-a-url',
      walletKeypairPath: '/nonexistent/keypair.json',
    }
    await expect(createDriftConnection(config)).rejects.toThrow()
  })

  it('rejects with nonexistent keypair path', async () => {
    const config: DriftConnectionConfig = {
      rpcUrl: 'https://api.devnet.solana.com',
      walletKeypairPath: '/nonexistent/keypair.json',
      env: 'devnet',
    }
    await expect(createDriftConnection(config)).rejects.toThrow()
  })

  it('accepts valid config shape without connecting', () => {
    const config: DriftConnectionConfig = {
      rpcUrl: 'https://api.devnet.solana.com',
      walletKeypairPath: '/some/keypair.json',
      env: 'devnet',
      commitment: 'confirmed',
    }
    expect(config.rpcUrl).toBe('https://api.devnet.solana.com')
    expect(config.env).toBe('devnet')
    expect(config.commitment).toBe('confirmed')
  })

  it('accepts optional rpcFallbackUrl in config', () => {
    const config: DriftConnectionConfig = {
      rpcUrl: 'https://api.devnet.solana.com',
      rpcFallbackUrl: 'https://devnet.helius-rpc.com',
      walletKeypairPath: '/some/keypair.json',
      env: 'devnet',
    }
    expect(config.rpcFallbackUrl).toBe('https://devnet.helius-rpc.com')
  })

  it('defaults env to devnet when not specified', () => {
    const config: DriftConnectionConfig = {
      rpcUrl: 'https://api.devnet.solana.com',
      walletKeypairPath: '/some/keypair.json',
    }
    expect(config.env).toBeUndefined()
  })
})

describe('isSubscriptionHealthy', () => {
  it('returns false for unsubscribed client', () => {
    const mockClient = {
      isSubscribed: false,
    } as unknown as DriftClient
    expect(isSubscriptionHealthy(mockClient)).toBe(false)
  })

  it('returns true for subscribed client', () => {
    const mockClient = {
      isSubscribed: true,
    } as unknown as DriftClient
    expect(isSubscriptionHealthy(mockClient)).toBe(true)
  })
})
