/**
 * Safe environment variable access without @types/node dependency.
 *
 * Works in Node.js, Bun, Deno, and browsers (returns undefined in browser).
 * Avoids TypeScript errors when process.env isn't declared.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const proc = (globalThis as any).process as { env: Record<string, string | undefined> } | undefined

export function getEnv(key: string): string | undefined {
  return proc?.env[key]
}
