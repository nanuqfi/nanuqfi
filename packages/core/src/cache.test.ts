import { describe, it, expect, vi, afterEach } from 'vitest'
import { TtlCache } from './cache'

describe('TtlCache', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns undefined for missing keys', () => {
    const cache = new TtlCache<string>(1000)
    expect(cache.get('missing')).toBeUndefined()
  })

  it('stores and retrieves fresh entries', () => {
    const cache = new TtlCache<number>(1000)
    cache.set('rate', 0.05)

    const entry = cache.get('rate')
    expect(entry).toBeDefined()
    expect(entry!.value).toBe(0.05)
    expect(entry!.stale).toBe(false)
  })

  it('marks entries as stale after TTL', () => {
    vi.useFakeTimers()
    const cache = new TtlCache<number>(100, 200)
    cache.set('rate', 0.05)

    vi.advanceTimersByTime(150)
    const entry = cache.get('rate')
    expect(entry).toBeDefined()
    expect(entry!.value).toBe(0.05)
    expect(entry!.stale).toBe(true)
  })

  it('evicts entries after stale window', () => {
    vi.useFakeTimers()
    const cache = new TtlCache<number>(100, 200)
    cache.set('rate', 0.05)

    vi.advanceTimersByTime(250)
    expect(cache.get('rate')).toBeUndefined()
  })

  it('uses TTL as stale window when staleMs not provided', () => {
    vi.useFakeTimers()
    const cache = new TtlCache<number>(100)
    cache.set('rate', 0.05)

    vi.advanceTimersByTime(50)
    expect(cache.get('rate')!.stale).toBe(false)

    vi.advanceTimersByTime(60)
    expect(cache.get('rate')).toBeUndefined()
  })

  it('clears all entries', () => {
    const cache = new TtlCache<string>(1000)
    cache.set('a', 'x')
    cache.set('b', 'y')
    cache.clear()

    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBeUndefined()
  })

  it('overwrites existing entries', () => {
    const cache = new TtlCache<number>(1000)
    cache.set('rate', 0.05)
    cache.set('rate', 0.08)

    expect(cache.get('rate')!.value).toBe(0.08)
  })

  it('evicts oldest entry when maxSize is reached', () => {
    const cache = new TtlCache<number>(10000, undefined, 3)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)

    // Inserting 'd' triggers eviction of 'a' (oldest)
    cache.set('d', 4)

    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')!.value).toBe(2)
    expect(cache.get('c')!.value).toBe(3)
    expect(cache.get('d')!.value).toBe(4)
  })

  it('updating an existing key does not trigger eviction', () => {
    const cache = new TtlCache<number>(10000, undefined, 2)
    cache.set('a', 1)
    cache.set('b', 2)

    // Overwriting 'a' must not evict 'b'
    cache.set('a', 99)

    expect(cache.get('a')!.value).toBe(99)
    expect(cache.get('b')!.value).toBe(2)
  })

  it('default maxSize allows up to 1000 entries without eviction', () => {
    const cache = new TtlCache<number>(10000)
    for (let i = 0; i < 1000; i++) {
      cache.set(`key-${i}`, i)
    }
    // All 1000 should still be present
    expect(cache.get('key-0')!.value).toBe(0)
    expect(cache.get('key-999')!.value).toBe(999)

    // Adding one more should evict key-0
    cache.set('key-1000', 1000)
    expect(cache.get('key-0')).toBeUndefined()
    expect(cache.get('key-1000')!.value).toBe(1000)
  })
})
