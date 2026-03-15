import { describe, it, expect } from 'vitest'
import { BaseVaultStrategy } from './strategy'
import type { WeightProposal, RebalanceResult, GuardrailConfig, RiskLevel } from './types'
import type { YieldBackend } from './interfaces'

class TestStrategy extends BaseVaultStrategy {
  readonly riskLevel: RiskLevel = 'moderate'
  readonly allowedSources: YieldBackend[] = []
  readonly guardrails: GuardrailConfig = {
    maxPerStrategyAllocation: { lending: 40, basis: 60 },
    maxDrawdown: 0.05,
    maxLeverage: 1,
    maxSingleAssetConcentration: 0.20,
    minRebalanceIntervalMs: 3_600_000,
    maxAllocationShiftPerRebalance: 20,
    redemptionPeriodMs: 172_800_000,
  }

  protected async executeRebalance(weights: WeightProposal): Promise<RebalanceResult> {
    return {
      status: 'executed',
      previousWeights: { lending: 50, basis: 50 },
      newWeights: weights.weights,
      guardrailViolations: [],
      txSignature: 'mock-tx',
      timestamp: Date.now(),
    }
  }
}

describe('BaseVaultStrategy', () => {
  it('validates weights sum to 100', async () => {
    const strategy = new TestStrategy()
    const proposal: WeightProposal = {
      weights: { lending: 30, basis: 60 },
      riskLevel: 'moderate',
      algoScores: {},
      timestamp: Date.now(),
    }
    await expect(strategy.rebalance(proposal)).rejects.toThrow('Weights must sum to 100')
  })

  it('rejects negative weights', async () => {
    const strategy = new TestStrategy()
    const proposal: WeightProposal = {
      weights: { lending: -10, basis: 110 },
      riskLevel: 'moderate',
      algoScores: {},
      timestamp: Date.now(),
    }
    await expect(strategy.rebalance(proposal)).rejects.toThrow('Negative weight')
  })

  it('rejects weights exceeding per-strategy caps', async () => {
    const strategy = new TestStrategy()
    const proposal: WeightProposal = {
      weights: { lending: 10, basis: 90 },
      riskLevel: 'moderate',
      algoScores: {},
      timestamp: Date.now(),
    }
    await expect(strategy.rebalance(proposal)).rejects.toThrow('exceeds max allocation')
  })

  it('executes valid rebalance', async () => {
    const strategy = new TestStrategy()
    const proposal: WeightProposal = {
      weights: { lending: 40, basis: 60 },
      riskLevel: 'moderate',
      algoScores: {},
      timestamp: Date.now(),
    }
    const result = await strategy.rebalance(proposal)
    expect(result.status).toBe('executed')
    expect(result.newWeights).toEqual({ lending: 40, basis: 60 })
  })
})
