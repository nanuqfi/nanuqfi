import { describe, it, expect } from 'vitest'
import { BN } from '@coral-xyz/anchor'
import { toBN, fromBN, toSpotPrecision, fromSpotPrecision } from './bn-convert'

describe('toBN', () => {
  it('converts zero', () => {
    expect(toBN(0n).toNumber()).toBe(0)
  })

  it('converts positive bigint', () => {
    expect(toBN(1_000_000n).toNumber()).toBe(1_000_000)
  })

  it('converts negative bigint', () => {
    expect(toBN(-500n).toNumber()).toBe(-500)
  })

  it('handles large values beyond Number.MAX_SAFE_INTEGER', () => {
    const large = 2n ** 64n
    const bn = toBN(large)
    expect(bn.toString()).toBe(large.toString())
  })

  it('handles large negative values', () => {
    const large = -(2n ** 64n)
    const bn = toBN(large)
    expect(bn.toString()).toBe(large.toString())
  })
})

describe('fromBN', () => {
  it('converts zero', () => {
    expect(fromBN(new BN(0))).toBe(0n)
  })

  it('converts positive BN', () => {
    expect(fromBN(new BN(1_000_000))).toBe(1_000_000n)
  })

  it('converts negative BN', () => {
    expect(fromBN(new BN(-500))).toBe(-500n)
  })

  it('handles large values beyond Number.MAX_SAFE_INTEGER', () => {
    const large = 2n ** 64n
    const bn = new BN(large.toString())
    expect(fromBN(bn)).toBe(large)
  })
})

describe('toBN <-> fromBN roundtrip', () => {
  const cases = [0n, 1n, -1n, 1_000_000n, -1_000_000n, 2n ** 53n, 2n ** 64n]

  for (const value of cases) {
    it(`roundtrips ${value}`, () => {
      expect(fromBN(toBN(value))).toBe(value)
    })
  }
})

describe('toSpotPrecision', () => {
  it('converts 1 USDC (6 decimals) to 1_000_000', () => {
    expect(toSpotPrecision(1, 6)).toBe(1_000_000n)
  })

  it('converts 0.5 USDC to 500_000', () => {
    expect(toSpotPrecision(0.5, 6)).toBe(500_000n)
  })

  it('converts zero', () => {
    expect(toSpotPrecision(0, 6)).toBe(0n)
  })

  it('converts 1 SOL (9 decimals) to 1_000_000_000', () => {
    expect(toSpotPrecision(1, 9)).toBe(1_000_000_000n)
  })

  it('converts 100 USDC to 100_000_000', () => {
    expect(toSpotPrecision(100, 6)).toBe(100_000_000n)
  })

  it('truncates sub-precision fractional dust', () => {
    const result = toSpotPrecision(1.0000001, 6)
    expect(result).toBe(1_000_000n)
  })

  it('handles 0 decimals', () => {
    expect(toSpotPrecision(42, 0)).toBe(42n)
  })

  it('throws on negative amount', () => {
    expect(() => toSpotPrecision(-1, 6)).toThrow()
  })

  it('throws on negative decimals', () => {
    expect(() => toSpotPrecision(1, -1)).toThrow()
  })
})

describe('fromSpotPrecision', () => {
  it('converts 1_000_000 to 1 USDC (6 decimals)', () => {
    expect(fromSpotPrecision(1_000_000n, 6)).toBe(1)
  })

  it('converts 500_000 to 0.5 USDC', () => {
    expect(fromSpotPrecision(500_000n, 6)).toBe(0.5)
  })

  it('converts zero', () => {
    expect(fromSpotPrecision(0n, 6)).toBe(0)
  })

  it('converts 1_000_000_000 to 1 SOL (9 decimals)', () => {
    expect(fromSpotPrecision(1_000_000_000n, 9)).toBe(1)
  })

  it('handles 0 decimals', () => {
    expect(fromSpotPrecision(42n, 0)).toBe(42)
  })

  it('throws on negative decimals', () => {
    expect(() => fromSpotPrecision(1_000_000n, -1)).toThrow()
  })
})

describe('toSpotPrecision <-> fromSpotPrecision roundtrip', () => {
  const cases = [
    { amount: 1, decimals: 6 },
    { amount: 0.5, decimals: 6 },
    { amount: 100, decimals: 6 },
    { amount: 1, decimals: 9 },
    { amount: 0.001, decimals: 9 },
    { amount: 42, decimals: 0 },
  ]

  for (const { amount, decimals } of cases) {
    it(`roundtrips ${amount} with ${decimals} decimals`, () => {
      expect(fromSpotPrecision(toSpotPrecision(amount, decimals), decimals)).toBe(amount)
    })
  }
})
