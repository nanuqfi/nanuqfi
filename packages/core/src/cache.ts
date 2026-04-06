/**
 * Injectable TTL cache with stale-while-revalidate support.
 *
 * Two windows:
 *  - ttlMs: entry is "fresh" — served immediately
 *  - staleMs: entry is "stale" — returned on fetch failure (SWR pattern)
 * After staleMs the entry is evicted completely.
 */

export interface CacheEntry<T> {
  value: T
  stale: boolean
}

export interface Cache<T> {
  get(key: string): CacheEntry<T> | undefined
  set(key: string, value: T): void
  clear(): void
}

interface InternalEntry<T> {
  value: T
  timestamp: number
}

export class TtlCache<T> implements Cache<T> {
  private readonly store = new Map<string, InternalEntry<T>>()
  private readonly ttlMs: number
  private readonly staleMs: number

  constructor(ttlMs: number, staleMs?: number) {
    this.ttlMs = ttlMs
    this.staleMs = staleMs ?? ttlMs
  }

  get(key: string): CacheEntry<T> | undefined {
    const entry = this.store.get(key)
    if (!entry) return undefined
    const age = Date.now() - entry.timestamp
    if (age > this.staleMs) {
      this.store.delete(key)
      return undefined
    }
    return { value: entry.value, stale: age > this.ttlMs }
  }

  set(key: string, value: T): void {
    this.store.set(key, { value, timestamp: Date.now() })
  }

  clear(): void {
    this.store.clear()
  }
}
