/**
 * Cross-package integration tests
 *
 * Validates the full router → backend → strategy flow using MockYieldBackend
 * and verifies failure cascades through the CircuitBreaker state machine.
 *
 * All tests are fully offline — no network, no timers.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  YieldBackendRegistry,
  YieldRouter,
  MockYieldBackend,
  CircuitBreaker,
  CircuitState,
  noopLogger,
} from '../index'

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Access the router's private breakers map without touching source. */
function getBreakerFor(
  router: YieldRouter,
  backendName: string,
): CircuitBreaker | undefined {
  const breakers = (router as unknown as { breakers: Map<string, CircuitBreaker> }).breakers
  return breakers.get(backendName)
}

/**
 * Simulate the reset timeout elapsing by backdating lastFailureTime.
 * Adds 1 ms past the 30 s threshold to guarantee the OPEN → HALF_OPEN
 * transition fires on the next `state` access.
 */
function backdateBreaker(breaker: CircuitBreaker): void {
  Object.assign(breaker, { lastFailureTime: Date.now() - 31_000 })
}

// ─── Fixture ────────────────────────────────────────────────────────────────

// Expected risk-adjusted scores:
//   marginfi → 0.065 / 0.04 = 1.625
//   kamino   → 0.045 / 0.03 = 1.500
//   lulo     → 0.082 / 0.02 = 4.100  ← highest
let registry: YieldBackendRegistry
let router: YieldRouter
let marginfi: MockYieldBackend
let kamino: MockYieldBackend
let lulo: MockYieldBackend

beforeEach(() => {
  registry = new YieldBackendRegistry()
  router = new YieldRouter(registry, noopLogger)

  marginfi = new MockYieldBackend('marginfi-lending', {}, { apy: 0.065, volatility: 0.04 })
  kamino = new MockYieldBackend('kamino-lending', {}, { apy: 0.045, volatility: 0.03 })
  lulo = new MockYieldBackend('lulo-lending', {}, { apy: 0.082, volatility: 0.02 })

  registry.register(marginfi)
  registry.register(kamino)
  registry.register(lulo)
})

// ─── Full Lifecycle Flow ─────────────────────────────────────────────────────

describe('full lifecycle flow', () => {
  it('ranks 3 backends by risk-adjusted score with lulo first', async () => {
    const ranked = await router.getBestYields({ asset: 'USDC' })

    expect(ranked).toHaveLength(3)
    expect(ranked[0].backend).toBe('lulo-lending')
    expect(ranked[1].backend).toBe('marginfi-lending')
    expect(ranked[2].backend).toBe('kamino-lending')

    // Verify the actual scores are calculated correctly
    expect(ranked[0].riskAdjustedScore).toBeCloseTo(4.1, 1)
    expect(ranked[1].riskAdjustedScore).toBeCloseTo(1.625, 2)
    expect(ranked[2].riskAdjustedScore).toBeCloseTo(1.5, 1)
  })

  it('filters by minYield — excludes kamino at 4.5% when threshold is 6%', async () => {
    const ranked = await router.getBestYields({ asset: 'USDC', minYield: 0.06 })

    expect(ranked).toHaveLength(2)
    expect(ranked.map(r => r.backend)).not.toContain('kamino-lending')
    // Must still be sorted highest score first
    expect(ranked[0].backend).toBe('lulo-lending')
    expect(ranked[1].backend).toBe('marginfi-lending')
  })

  it('weight distribution derived from scores sums to 100', async () => {
    const ranked = await router.getBestYields({ asset: 'USDC' })

    const totalScore = ranked.reduce((sum, r) => sum + r.riskAdjustedScore, 0)
    const weights = ranked.map(r => (r.riskAdjustedScore / totalScore) * 100)
    const totalWeight = weights.reduce((sum, w) => sum + w, 0)

    expect(totalWeight).toBeCloseTo(100, 10)
    // Lulo must hold the largest weight share
    expect(weights[0]).toBeGreaterThan(weights[1])
    expect(weights[0]).toBeGreaterThan(weights[2])
  })

  it('deposit and withdraw round-trip through the best backend', async () => {
    const ranked = await router.getBestYields({ asset: 'USDC' })
    const bestName = ranked[0].backend  // lulo-lending

    const best = registry.get(bestName)!
    const depositAmount = 1_000_000n   // 1 USDC (6 decimals)

    const depositTx = await best.deposit(depositAmount)
    expect(depositTx).toBe(`mock-tx-${bestName}-deposit`)

    const positionAfterDeposit = await best.getPosition()
    expect(positionAfterDeposit.depositedAmount).toBe(depositAmount)
    expect(positionAfterDeposit.isActive).toBe(true)

    const withdrawTx = await best.withdraw(depositAmount)
    expect(withdrawTx).toBe(`mock-tx-${bestName}-withdraw`)

    const positionAfterWithdraw = await best.getPosition()
    expect(positionAfterWithdraw.depositedAmount).toBe(0n)
    expect(positionAfterWithdraw.isActive).toBe(false)
  })
})

// ─── Failure Cascades ────────────────────────────────────────────────────────

describe('failure cascades', () => {
  it('one backend fails — router returns the remaining 2', async () => {
    marginfi.setFailMode(true)

    const ranked = await router.getBestYields({ asset: 'USDC' })

    expect(ranked).toHaveLength(2)
    expect(ranked.map(r => r.backend)).not.toContain('marginfi-lending')
    expect(ranked[0].backend).toBe('lulo-lending')
  })

  it('two backends fail — router returns the single healthy backend', async () => {
    marginfi.setFailMode(true)
    kamino.setFailMode(true)

    const ranked = await router.getBestYields({ asset: 'USDC' })

    expect(ranked).toHaveLength(1)
    expect(ranked[0].backend).toBe('lulo-lending')
  })

  it('all backends fail — router returns empty array without throwing', async () => {
    marginfi.setFailMode(true)
    kamino.setFailMode(true)
    lulo.setFailMode(true)

    const ranked = await router.getBestYields({ asset: 'USDC' })

    expect(ranked).toHaveLength(0)
  })

  it('circuit breaker trips to OPEN after 3 consecutive failures', async () => {
    marginfi.setFailMode(true)

    // Three calls required to hit failureThreshold of 3
    await router.getBestYields({ asset: 'USDC' })
    await router.getBestYields({ asset: 'USDC' })
    await router.getBestYields({ asset: 'USDC' })

    const breaker = getBreakerFor(router, 'marginfi-lending')!
    expect(breaker.state).toBe(CircuitState.OPEN)
  })

  it('circuit breaker recovers: HALF_OPEN → success → CLOSED', async () => {
    // Trip the breaker
    marginfi.setFailMode(true)
    await router.getBestYields({ asset: 'USDC' })
    await router.getBestYields({ asset: 'USDC' })
    await router.getBestYields({ asset: 'USDC' })

    const breaker = getBreakerFor(router, 'marginfi-lending')!
    expect(breaker.state).toBe(CircuitState.OPEN)

    // Simulate 30s+ elapsed — breaker transitions to HALF_OPEN on next access
    backdateBreaker(breaker)
    expect(breaker.state).toBe(CircuitState.HALF_OPEN)

    // Backend is healthy again — the probe call in getBestYields succeeds
    marginfi.setFailMode(false)
    const ranked = await router.getBestYields({ asset: 'USDC' })

    // Breaker should have closed on the successful probe
    expect(breaker.state).toBe(CircuitState.CLOSED)
    // marginfi back in results
    expect(ranked.map(r => r.backend)).toContain('marginfi-lending')
  })

  it('circuit breaker stays OPEN when HALF_OPEN probe fails again', async () => {
    // Trip the breaker (3 failures)
    marginfi.setFailMode(true)
    await router.getBestYields({ asset: 'USDC' })
    await router.getBestYields({ asset: 'USDC' })
    await router.getBestYields({ asset: 'USDC' })

    const breaker = getBreakerFor(router, 'marginfi-lending')!

    // Simulate timeout elapsed → HALF_OPEN
    backdateBreaker(breaker)
    expect(breaker.state).toBe(CircuitState.HALF_OPEN)

    // The probe fails again — stays offline (backend still failing)
    await router.getBestYields({ asset: 'USDC' })

    // After a failed HALF_OPEN probe, the breaker goes back to OPEN
    // (onFailure is called, failureCount increments, threshold re-hit immediately)
    expect(breaker.state).toBe(CircuitState.OPEN)
  })

  it('anomalous rate (500% APY) does not crash the router', async () => {
    lulo.setYield(5.0)   // 500% APY — absurd but should not throw

    let ranked: Awaited<ReturnType<typeof router.getBestYields>>
    await expect(
      router.getBestYields({ asset: 'USDC' }).then(r => { ranked = r; return r }),
    ).resolves.toBeDefined()

    // lulo must still be ranked first (highest risk-adjusted score by far)
    expect(ranked![0].backend).toBe('lulo-lending')
    expect(ranked![0].annualizedApy).toBe(5.0)
  })

  it('backend oscillation is dampened by circuit breaker', async () => {
    // Phase 1: fail twice (below threshold — breaker CLOSED but wounded)
    marginfi.setFailMode(true)
    await router.getBestYields({ asset: 'USDC' })
    await router.getBestYields({ asset: 'USDC' })

    const breaker = getBreakerFor(router, 'marginfi-lending')!
    expect(breaker.state).toBe(CircuitState.CLOSED)

    // Phase 2: recover — resets failure count to 0
    marginfi.setFailMode(false)
    await router.getBestYields({ asset: 'USDC' })
    expect(breaker.state).toBe(CircuitState.CLOSED)

    // Phase 3: fail again — needs 3 more failures to trip (count reset)
    marginfi.setFailMode(true)
    await router.getBestYields({ asset: 'USDC' })
    await router.getBestYields({ asset: 'USDC' })
    expect(breaker.state).toBe(CircuitState.CLOSED)

    // Trip on the 3rd failure in this phase
    await router.getBestYields({ asset: 'USDC' })
    expect(breaker.state).toBe(CircuitState.OPEN)

    // While OPEN the backend is excluded even if it would otherwise succeed
    marginfi.setFailMode(false)
    const ranked = await router.getBestYields({ asset: 'USDC' })
    expect(ranked.map(r => r.backend)).not.toContain('marginfi-lending')
    expect(breaker.state).toBe(CircuitState.OPEN)
  })
})
