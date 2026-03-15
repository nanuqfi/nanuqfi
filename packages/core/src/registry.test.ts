import { describe, it, expect, beforeEach } from 'vitest'
import { YieldBackendRegistry } from './registry'
import { MockYieldBackend } from './mocks/mock-yield-backend'

describe('YieldBackendRegistry', () => {
  let registry: YieldBackendRegistry

  beforeEach(() => {
    registry = new YieldBackendRegistry()
  })

  it('registers and retrieves a backend by name', () => {
    const backend = new MockYieldBackend('lending', { supportedAssets: ['USDC'] })
    registry.register(backend)
    expect(registry.get('lending')).toBe(backend)
  })

  it('returns undefined for unknown backend', () => {
    expect(registry.get('nonexistent')).toBeUndefined()
  })

  it('lists all registered backends', () => {
    registry.register(new MockYieldBackend('lending'))
    registry.register(new MockYieldBackend('basis'))
    expect(registry.list()).toHaveLength(2)
    expect(registry.list().map(b => b.name)).toEqual(['lending', 'basis'])
  })

  it('throws on duplicate registration', () => {
    registry.register(new MockYieldBackend('lending'))
    expect(() => registry.register(new MockYieldBackend('lending')))
      .toThrow('Backend "lending" is already registered')
  })

  it('unregisters a backend', () => {
    registry.register(new MockYieldBackend('lending'))
    registry.unregister('lending')
    expect(registry.get('lending')).toBeUndefined()
    expect(registry.list()).toHaveLength(0)
  })

  it('filters by capability', () => {
    registry.register(new MockYieldBackend('lending', {
      supportedAssets: ['USDC'],
      isDeltaNeutral: false,
    }))
    registry.register(new MockYieldBackend('basis', {
      supportedAssets: ['USDC', 'SOL'],
      isDeltaNeutral: true,
    }))

    const deltaNeutral = registry.filterByCapability(c => c.isDeltaNeutral)
    expect(deltaNeutral).toHaveLength(1)
    expect(deltaNeutral[0].name).toBe('basis')

    const usdcBackends = registry.filterByCapability(c =>
      c.supportedAssets.includes('USDC')
    )
    expect(usdcBackends).toHaveLength(2)
  })
})
