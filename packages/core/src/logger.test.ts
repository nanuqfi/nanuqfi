import { describe, it, expect, vi, afterEach } from 'vitest'
import { consoleLogger, noopLogger } from './logger'

describe('consoleLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('outputs valid JSON with level, msg, and ts', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

    consoleLogger.info('hello world', { backend: 'kamino' })

    expect(spy).toHaveBeenCalledTimes(1)
    const parsed = JSON.parse(spy.mock.calls[0]![0] as string)
    expect(parsed.level).toBe('info')
    expect(parsed.msg).toBe('hello world')
    expect(parsed.backend).toBe('kamino')
    expect(typeof parsed.ts).toBe('number')
  })

  it('logs all levels', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

    consoleLogger.info('i')
    consoleLogger.warn('w')
    consoleLogger.error('e')
    consoleLogger.debug('d')

    expect(spy).toHaveBeenCalledTimes(4)
    const levels = spy.mock.calls.map(c => JSON.parse(c[0] as string).level)
    expect(levels).toEqual(['info', 'warn', 'error', 'debug'])
  })

  it('works without context', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

    consoleLogger.warn('no ctx')

    const parsed = JSON.parse(spy.mock.calls[0]![0] as string)
    expect(parsed.msg).toBe('no ctx')
    expect(parsed.level).toBe('warn')
  })
})

describe('noopLogger', () => {
  it('does not throw on any level', () => {
    expect(() => noopLogger.info('a')).not.toThrow()
    expect(() => noopLogger.warn('b', { x: 1 })).not.toThrow()
    expect(() => noopLogger.error('c')).not.toThrow()
    expect(() => noopLogger.debug('d')).not.toThrow()
  })

  it('does not call console.log', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

    noopLogger.info('silent')
    noopLogger.warn('silent')
    noopLogger.error('silent')
    noopLogger.debug('silent')

    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
