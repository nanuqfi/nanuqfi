import { describe, it, expect } from 'vitest'
import {
  parseFundingRate,
  parseDepositRate,
  DRIFT_DATA_API_URL,
  type RawFundingRate,
} from './drift-data-api'

describe('DRIFT_DATA_API_URL', () => {
  it('points to the Drift data API', () => {
    expect(DRIFT_DATA_API_URL).toBe('https://data.api.drift.trade')
  })
})

describe('parseFundingRate', () => {
  it('computes hourly rate from fundingRate / oraclePriceTwap', () => {
    const raw: RawFundingRate = {
      slot: 100,
      fundingRate: '1000000',       // 1e6 => 1e6 / 1e9 = 0.001
      oraclePriceTwap: '100000000', // 1e8 => 1e8 / 1e6 = 100
      markPriceTwap: '100500000',
      fundingRateLong: '1000000',
      fundingRateShort: '-1000000',
    }

    const parsed = parseFundingRate(raw)

    // hourlyRate = (1e6 / 1e9) / (1e8 / 1e6) = 0.001 / 100 = 0.00001
    expect(parsed.slot).toBe(100)
    expect(parsed.hourlyRate).toBeCloseTo(0.00001, 10)
    expect(parsed.annualizedApr).toBeCloseTo(0.00001 * 24 * 365 * 100, 4)
    expect(parsed.oraclePrice).toBeCloseTo(100, 6)
  })

  it('handles negative funding rate', () => {
    const raw: RawFundingRate = {
      slot: 200,
      fundingRate: '-500000',       // -5e5 / 1e9 = -0.0005
      oraclePriceTwap: '50000000',  // 5e7 / 1e6 = 50
      markPriceTwap: '49800000',
      fundingRateLong: '-500000',
      fundingRateShort: '500000',
    }

    const parsed = parseFundingRate(raw)

    // hourlyRate = (-0.0005) / 50 = -0.00001
    expect(parsed.hourlyRate).toBeCloseTo(-0.00001, 10)
    expect(parsed.annualizedApr).toBeLessThan(0)
  })

  it('handles zero funding rate', () => {
    const raw: RawFundingRate = {
      slot: 300,
      fundingRate: '0',
      oraclePriceTwap: '100000000',
      markPriceTwap: '100000000',
      fundingRateLong: '0',
      fundingRateShort: '0',
    }

    const parsed = parseFundingRate(raw)

    expect(parsed.hourlyRate).toBe(0)
    expect(parsed.annualizedApr).toBe(0)
    expect(parsed.oraclePrice).toBeCloseTo(100, 6)
  })

  it('handles very large funding rate values', () => {
    const raw: RawFundingRate = {
      slot: 400,
      fundingRate: '10000000000',   // 1e10 / 1e9 = 10
      oraclePriceTwap: '200000000', // 2e8 / 1e6 = 200
      markPriceTwap: '210000000',
      fundingRateLong: '10000000000',
      fundingRateShort: '-10000000000',
    }

    const parsed = parseFundingRate(raw)

    // hourlyRate = 10 / 200 = 0.05
    expect(parsed.hourlyRate).toBeCloseTo(0.05, 10)
    // annualized = 0.05 * 24 * 365 * 100 = 43800
    expect(parsed.annualizedApr).toBeCloseTo(43800, 0)
  })

  it('handles very small oracle price', () => {
    const raw: RawFundingRate = {
      slot: 500,
      fundingRate: '1000',          // 1e3 / 1e9 = 0.000001
      oraclePriceTwap: '1000',      // 1e3 / 1e6 = 0.001
      markPriceTwap: '1000',
      fundingRateLong: '1000',
      fundingRateShort: '-1000',
    }

    const parsed = parseFundingRate(raw)

    // hourlyRate = 0.000001 / 0.001 = 0.001
    expect(parsed.hourlyRate).toBeCloseTo(0.001, 10)
    expect(parsed.oraclePrice).toBeCloseTo(0.001, 6)
  })

  it('preserves slot number', () => {
    const raw: RawFundingRate = {
      slot: 999_999_999,
      fundingRate: '1000000',
      oraclePriceTwap: '100000000',
      markPriceTwap: '100000000',
      fundingRateLong: '1000000',
      fundingRateShort: '-1000000',
    }

    expect(parseFundingRate(raw).slot).toBe(999_999_999)
  })
})

describe('parseDepositRate', () => {
  it('parses a normal decimal string rate', () => {
    expect(parseDepositRate('0.08')).toBeCloseTo(0.08, 10)
  })

  it('parses zero rate', () => {
    expect(parseDepositRate('0')).toBe(0)
    expect(parseDepositRate('0.0')).toBe(0)
    expect(parseDepositRate('0.00')).toBe(0)
  })

  it('parses a very small rate', () => {
    expect(parseDepositRate('0.001')).toBeCloseTo(0.001, 10)
  })

  it('parses a rate greater than 1', () => {
    expect(parseDepositRate('1.5')).toBeCloseTo(1.5, 10)
  })

  it('parses integer string', () => {
    expect(parseDepositRate('5')).toBe(5)
  })

  it('returns NaN for non-numeric string', () => {
    expect(parseDepositRate('abc')).toBeNaN()
  })

  it('returns NaN for empty string', () => {
    expect(parseDepositRate('')).toBeNaN()
  })
})
