/**
 * Structured JSON logging interface.
 *
 * Provides a minimal, zero-dependency logger contract that backends
 * and the router can use for observability. Two implementations:
 * - consoleLogger: outputs JSON lines to stdout
 * - noopLogger: swallows all output (useful in tests)
 */

export interface Logger {
  info(msg: string, ctx?: Record<string, unknown>): void
  warn(msg: string, ctx?: Record<string, unknown>): void
  error(msg: string, ctx?: Record<string, unknown>): void
  debug(msg: string, ctx?: Record<string, unknown>): void
}

function logLine(level: string, msg: string, ctx?: Record<string, unknown>): void {
  console.log(JSON.stringify({ level, msg, ...ctx, ts: Date.now() }))
}

export const consoleLogger: Logger = {
  info: (msg, ctx) => logLine('info', msg, ctx),
  warn: (msg, ctx) => logLine('warn', msg, ctx),
  error: (msg, ctx) => logLine('error', msg, ctx),
  debug: (msg, ctx) => logLine('debug', msg, ctx),
}

export const noopLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}
