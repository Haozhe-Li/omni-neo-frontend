// Resolves a first-party (omniknows.xyz) URL to its real page title, purely
// on the frontend — no backend round trip needed. `/api/pages/[id]` already
// reads the same Redis record (`publish:{id}`) the backend's
// `first_party_redis_shortcut` reads for citations, and the benchmark
// llms.txt mirror always carries the fixed title the backend falls back to
// as well. Mirrors the backend's path matching (core/tools/web_page_reader.py
// `_PAGE_ID_RE` / `_LLMS_TXT_REDIS_KEY`) so "does this URL resolve" agrees on
// both sides.

const PAGE_ID_RE = /^\/pages\/([0-9a-f]{12})$/
const LLMS_TXT_PATH = '/benchmark/llms.txt'
const LLMS_TXT_TITLE = 'Omni Benchmarks'

const titleCache = new Map<string, string | null>()
const inFlight = new Map<string, Promise<string | null>>()

/** Cache-only lookup — for render-time synchronous reads. Returns undefined if never resolved. */
export function cachedFirstPartyTitle(url: string): string | null | undefined {
    return titleCache.get(url)
}

/** Resolves (and caches) a first-party page's title. Returns null if it can't be resolved. */
export async function resolveFirstPartyTitle(url: string): Promise<string | null> {
    if (titleCache.has(url)) return titleCache.get(url) ?? null
    const pending = inFlight.get(url)
    if (pending) return pending

    const promise = (async () => {
        let path: string
        try {
            path = new URL(url).pathname.replace(/\/+$/, '') || '/'
        } catch {
            titleCache.set(url, null)
            return null
        }

        let title: string | null = null
        if (path === LLMS_TXT_PATH) {
            title = LLMS_TXT_TITLE
        } else {
            const match = path.match(PAGE_ID_RE)
            if (match) {
                try {
                    const res = await fetch(`/api/pages/${match[1]}`)
                    if (res.ok) {
                        const data = await res.json()
                        title = (typeof data?.title === 'string' && data.title) || null
                    }
                } catch {
                    // Network hiccup — leave title null, don't cache the failure
                    // so a later render can retry instead of being stuck.
                    inFlight.delete(url)
                    return null
                }
            }
        }
        titleCache.set(url, title)
        return title
    })()

    inFlight.set(url, promise)
    try {
        return await promise
    } finally {
        inFlight.delete(url)
    }
}
