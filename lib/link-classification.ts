import type { Credibility } from '@/lib/credibility'

const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
const CLASSIFY_TIMEOUT_MS = 3000

const verdictCache = new Map<string, Credibility>()
const inFlight = new Map<string, Promise<Credibility>>()

/** A raw link's credibility, if `classifyUrl` already resolved it this session. */
export function cachedClassification(url: string): Credibility | undefined {
  return verdictCache.get(url)
}

/**
 * Resolves a raw link's credibility via `POST /classify_url` — for links
 * with no citation, so no title/content/query ever reached the backend's
 * `classify_sources`. Memoized per URL for the session (a repeated domain
 * in one answer fires one request), and never throws: a timeout, network
 * failure, or non-OK response resolves to an "unverified" `Credibility`
 * instead, deliberately NOT cached, so a later click retries.
 */
export async function classifyUrl(
  url: string,
  fetchWithAuth: (url: string, init?: RequestInit) => Promise<Response>,
): Promise<Credibility> {
  const cached = verdictCache.get(url)
  if (cached) return cached
  const pending = inFlight.get(url)
  if (pending) return pending

  const promise = (async (): Promise<Credibility> => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), CLASSIFY_TIMEOUT_MS)
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/classify_url`, {
        method: 'POST',
        body: JSON.stringify({ url }),
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(`classify_url ${res.status}`)
      const data = (await res.json()) as Credibility
      verdictCache.set(url, data)
      return data
    } catch {
      return { label: 'unknown', reason: "We couldn't verify this link right now." }
    } finally {
      clearTimeout(timer)
    }
  })()

  inFlight.set(url, promise)
  try {
    return await promise
  } finally {
    inFlight.delete(url)
  }
}
