/**
 * Injectable TTL cache with stale-while-revalidate support.
 *
 * Two windows:
 *  - ttlMs: entry is "fresh" — served immediately
 *  - staleMs: entry is "stale" — returned on fetch failure (SWR pattern)
 * After staleMs the entry is evicted completely.
 *
 * maxSize (default 1000): when the cache is at capacity, the oldest entry
 * (by insertion/update timestamp) is evicted before the new one is stored.
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

const DEFAULT_MAX_SIZE = 1000

export class TtlCache<T> implements Cache<T> {
  private readonly store = new Map<string, InternalEntry<T>>()
  private readonly ttlMs: number
  private readonly staleMs: number
  private readonly maxSize: number

  constructor(ttlMs: number, staleMs?: number, maxSize?: number) {
    this.ttlMs = ttlMs
    this.staleMs = staleMs ?? ttlMs
    this.maxSize = maxSize ?? DEFAULT_MAX_SIZE
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
    // If we're updating an existing key, no eviction needed — just overwrite.
    // If inserting a new key and at capacity, evict the oldest entry first.
    if (!this.store.has(key) && this.store.size >= this.maxSize) {
      const oldestKey = this.store.keys().next().value
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey)
      }
    }
    this.store.set(key, { value, timestamp: Date.now() })
  }

  clear(): void {
    this.store.clear()
  }
}
