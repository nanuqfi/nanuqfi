import type { GuardrailConfig, RiskLevel, WeightProposal, RebalanceResult } from './types'
import type { YieldBackend } from './interfaces'

export abstract class BaseVaultStrategy {
  abstract readonly riskLevel: RiskLevel
  abstract readonly allowedSources: YieldBackend[]
  abstract readonly guardrails: GuardrailConfig

  async rebalance(proposal: WeightProposal): Promise<RebalanceResult> {
    this.validateWeights(proposal)
    this.validateGuardrails(proposal)
    return this.executeRebalance(proposal)
  }

  protected abstract executeRebalance(proposal: WeightProposal): Promise<RebalanceResult>

  private validateWeights(proposal: WeightProposal): void {
    const values = Object.values(proposal.weights)

    for (const [name, weight] of Object.entries(proposal.weights)) {
      if (weight < 0) {
        throw new Error(`Negative weight for "${name}": ${weight}`)
      }
    }

    const sum = values.reduce((a, b) => a + b, 0)
    if (Math.abs(sum - 100) > 0.01) {
      throw new Error(`Weights must sum to 100, got ${sum}`)
    }
  }

  private validateGuardrails(proposal: WeightProposal): void {
    const caps = this.guardrails.maxPerStrategyAllocation

    for (const [name, weight] of Object.entries(proposal.weights)) {
      const max = caps[name]
      if (max !== undefined && weight > max) {
        throw new Error(
          `"${name}" weight ${weight}% exceeds max allocation of ${max}%`
        )
      }
    }
  }
}
