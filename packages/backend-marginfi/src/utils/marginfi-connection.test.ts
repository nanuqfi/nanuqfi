import { describe, it, expect } from 'vitest'
import { createReadOnlyMarginfiClient, type MarginfiConnectionConfig } from './marginfi-connection'

describe('createReadOnlyMarginfiClient', () => {
  it('exports a factory function', () => {
    expect(typeof createReadOnlyMarginfiClient).toBe('function')
  })

  it('requires rpcUrl in config', () => {
    expect(() => createReadOnlyMarginfiClient({ rpcUrl: '' })).toThrow('rpcUrl is required')
  })

  it('returns a promise', () => {
    const config: MarginfiConnectionConfig = { rpcUrl: 'https://api.mainnet-beta.solana.com' }
    const result = createReadOnlyMarginfiClient(config)
    expect(result).toBeInstanceOf(Promise)
    // Don't await — this would make a real RPC call
    // Just verify it returns a promise
  })
})
