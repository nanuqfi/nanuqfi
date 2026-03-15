import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CircuitBreaker, CircuitState } from './circuit-breaker'

describe('CircuitBreaker', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('starts in CLOSED state', () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 10_000 })
    expect(cb.state).toBe(CircuitState.CLOSED)
  })

  it('opens after failure threshold', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 10_000 })
    const failing = () => Promise.reject(new Error('fail'))

    await expect(cb.execute(failing)).rejects.toThrow('fail')
    expect(cb.state).toBe(CircuitState.CLOSED)

    await expect(cb.execute(failing)).rejects.toThrow('fail')
    expect(cb.state).toBe(CircuitState.OPEN)
  })

  it('rejects immediately when OPEN', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 10_000 })
    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow()

    await expect(cb.execute(() => Promise.resolve('ok'))).rejects.toThrow('Circuit is OPEN')
  })

  it('transitions to HALF_OPEN after reset timeout', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 5_000 })
    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow()
    expect(cb.state).toBe(CircuitState.OPEN)

    vi.advanceTimersByTime(5_001)
    expect(cb.state).toBe(CircuitState.HALF_OPEN)
  })

  it('closes on success in HALF_OPEN state', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 5_000 })
    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow()

    vi.advanceTimersByTime(5_001)
    const result = await cb.execute(() => Promise.resolve('recovered'))
    expect(result).toBe('recovered')
    expect(cb.state).toBe(CircuitState.CLOSED)
  })

  it('resets failure count on success', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 10_000 })
    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow()
    await cb.execute(() => Promise.resolve('ok'))
    expect(cb.state).toBe(CircuitState.CLOSED)
  })
})
