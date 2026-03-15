import { BN } from '@coral-xyz/anchor'

export function toBN(value: bigint): BN {
  if (value < 0n) {
    return new BN((-value).toString()).neg()
  }
  return new BN(value.toString())
}

export function fromBN(value: BN): bigint {
  if (value.isNeg()) {
    return -BigInt(value.neg().toString())
  }
  return BigInt(value.toString())
}

export function toSpotPrecision(amount: number, decimals: number): bigint {
  if (amount < 0) {
    throw new Error('amount must be non-negative')
  }
  if (decimals < 0) {
    throw new Error('decimals must be non-negative')
  }
  const multiplier = 10 ** decimals
  return BigInt(Math.trunc(amount * multiplier))
}

export function fromSpotPrecision(amount: bigint, decimals: number): number {
  if (decimals < 0) {
    throw new Error('decimals must be non-negative')
  }
  const multiplier = 10 ** decimals
  return Number(amount) / multiplier
}
