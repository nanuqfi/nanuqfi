export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

interface CircuitBreakerConfig {
  failureThreshold: number
  resetTimeoutMs: number
}

export class CircuitBreaker {
  private _state = CircuitState.CLOSED
  private failureCount = 0
  private lastFailureTime = 0
  private readonly config: CircuitBreakerConfig

  constructor(config: CircuitBreakerConfig) {
    this.config = config
  }

  get state(): CircuitState {
    if (
      this._state === CircuitState.OPEN &&
      Date.now() - this.lastFailureTime >= this.config.resetTimeoutMs
    ) {
      this._state = CircuitState.HALF_OPEN
    }
    return this._state
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      throw new Error('Circuit is OPEN')
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  private onSuccess(): void {
    this.failureCount = 0
    this._state = CircuitState.CLOSED
  }

  private onFailure(): void {
    this.failureCount++
    this.lastFailureTime = Date.now()
    if (this.failureCount >= this.config.failureThreshold) {
      this._state = CircuitState.OPEN
    }
  }
}
