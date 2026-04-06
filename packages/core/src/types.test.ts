import { describe, it, expect } from 'vitest'
import { RISK_LEVELS, isValidRiskLevel } from './types'

describe('RiskLevel', () => {
  it('defines three risk levels', () => {
    expect(RISK_LEVELS).toEqual(['conservative', 'moderate', 'aggressive'])
  })

  it('validates valid risk levels', () => {
    expect(isValidRiskLevel('conservative')).toBe(true)
    expect(isValidRiskLevel('moderate')).toBe(true)
    expect(isValidRiskLevel('aggressive')).toBe(true)
  })

  it('rejects invalid risk levels', () => {
    expect(isValidRiskLevel('unknown')).toBe(false)
    expect(isValidRiskLevel('')).toBe(false)
    expect(isValidRiskLevel(undefined as unknown as string)).toBe(false)
  })
})
