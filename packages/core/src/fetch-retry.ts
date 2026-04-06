/**
 * Retry, timeout, and exponential backoff for external HTTP calls.
 *
 * Retries on 5xx and 429 (rate limit). Throws immediately on 4xx (client errors).
 * Aborts individual attempts after `timeout` ms via AbortController.
 */

export interface RetryOptions {
  retries?: number
  baseDelay?: number
  timeout?: number
}

export async function fetchWithRetry(
  url: string,
  opts?: RequestInit & RetryOptions
): Promise<Response> {
  const { retries = 3, baseDelay = 1000, timeout = 10_000, ...fetchOpts } = opts ?? {}

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)

    try {
      const res = await fetch(url, { ...fetchOpts, signal: controller.signal })
      clearTimeout(timer)
      if (res.ok) return res
      if (res.status < 500 && res.status !== 429) throw new Error(`HTTP ${res.status}`)
    } catch (err) {
      clearTimeout(timer)
      if (attempt === retries) throw err
    }

    if (attempt < retries) {
      await new Promise(r => setTimeout(r, baseDelay * 2 ** attempt))
    }
  }

  throw new Error('fetchWithRetry: all retries exhausted')
}
