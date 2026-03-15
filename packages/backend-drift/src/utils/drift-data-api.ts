export const DRIFT_DATA_API_URL = 'https://data.api.drift.trade'

const PRICE_PRECISION = 1e9
const ORACLE_PRECISION = 1e6
const HOURS_PER_YEAR = 24 * 365

export interface RawFundingRate {
  slot: number
  fundingRate: string
  oraclePriceTwap: string
  markPriceTwap: string
  fundingRateLong: string
  fundingRateShort: string
}

export interface ParsedFundingRate {
  slot: number
  hourlyRate: number
  annualizedApr: number
  oraclePrice: number
}

export function parseFundingRate(raw: RawFundingRate): ParsedFundingRate {
  const fundingRate = Number(raw.fundingRate) / PRICE_PRECISION
  const oraclePrice = Number(raw.oraclePriceTwap) / ORACLE_PRECISION
  const hourlyRate = oraclePrice === 0 ? 0 : fundingRate / oraclePrice
  const annualizedApr = hourlyRate * HOURS_PER_YEAR * 100

  return {
    slot: raw.slot,
    hourlyRate,
    annualizedApr,
    oraclePrice,
  }
}

export function parseDepositRate(rate: string): number {
  if (rate.trim() === '') return NaN
  return Number(rate)
}

interface FundingRateResponse {
  fundingRates: RawFundingRate[]
}

interface RateHistoryResponse {
  rates: { ts: number; rate: string }[]
}

export async function fetchFundingRates(
  marketName: string,
  baseUrl: string = DRIFT_DATA_API_URL,
): Promise<RawFundingRate[]> {
  const url = `${baseUrl}/fundingRates?marketName=${encodeURIComponent(marketName)}`
  const res = await fetch(url)

  if (!res.ok) {
    throw new Error(`Drift Data API error: ${res.status} ${res.statusText}`)
  }

  const data = (await res.json()) as FundingRateResponse
  return data.fundingRates ?? []
}

export async function fetchDepositRate(
  marketIndex: number,
  baseUrl: string = DRIFT_DATA_API_URL,
): Promise<number> {
  const url = `${baseUrl}/rateHistory?marketIndex=${marketIndex}&type=deposit`
  const res = await fetch(url)

  if (!res.ok) {
    throw new Error(`Drift Data API error: ${res.status} ${res.statusText}`)
  }

  const data = (await res.json()) as RateHistoryResponse
  const rates = data.rates ?? []

  if (rates.length === 0) {
    return 0
  }

  return parseDepositRate(rates[rates.length - 1]!.rate)
}

export async function fetchBorrowRate(
  marketIndex: number,
  baseUrl: string = DRIFT_DATA_API_URL,
): Promise<number> {
  const url = `${baseUrl}/rateHistory?marketIndex=${marketIndex}&type=borrow`
  const res = await fetch(url)

  if (!res.ok) {
    throw new Error(`Drift Data API error: ${res.status} ${res.statusText}`)
  }

  const data = (await res.json()) as RateHistoryResponse
  const rates = data.rates ?? []

  if (rates.length === 0) {
    return 0
  }

  return parseDepositRate(rates[rates.length - 1]!.rate)
}
