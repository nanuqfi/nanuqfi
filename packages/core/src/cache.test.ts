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
})
