import { useState, useCallback } from 'react'

export interface SourceUrlEntry {
    id: string
    url: string
    isFirstParty: boolean
}

// Mirrors QueryRequest.source_url's cap (core/utils/data_model.py) so the
// picker can never build a request the backend would reject.
export const MAX_SOURCE_URLS = 5

// Cosmetic only — picks which chip style to render (see the "Following up
// on this page" pill in the URL picker). The backend independently decides
// the fetch pipeline per URL via first_party_redis_shortcut
// (core/tools/web_page_reader.py); this just needs to agree with it on what
// counts as "Omni's own domain," not duplicate its logic.
const FIRST_PARTY_HOST = 'omniknows.xyz'

export function isFirstPartyUrl(url: string): boolean {
    try {
        const host = new URL(url).hostname.toLowerCase()
        return host === FIRST_PARTY_HOST || host.endsWith(`.${FIRST_PARTY_HOST}`)
    } catch {
        return false
    }
}

// Bare "example.com" is a common paste — give it a scheme so `new URL`
// doesn't reject it outright. Returns null for anything still unparseable,
// so callers can skip it rather than add a broken entry.
export function normalizeUrl(raw: string): string | null {
    const trimmed = raw.trim()
    if (!trimmed) return null
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    try {
        return new URL(withScheme).toString()
    } catch {
        return null
    }
}

function makeEntry(url: string): SourceUrlEntry {
    return {
        id: `src-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        url,
        isFirstParty: isFirstPartyUrl(url),
    }
}

export function useSourceUrls() {
    const [sourceUrls, setSourceUrls] = useState<SourceUrlEntry[]>([])

    // Merges `raws` into the current list — dedup by normalized URL, capped
    // at MAX_SOURCE_URLS. Invalid/duplicate/over-cap entries are silently
    // dropped; the picker UI validates and shows the cap itself before ever
    // calling this, so there's nothing meaningful to report back here.
    const addUrls = useCallback((raws: string[]) => {
        setSourceUrls((prev) => {
            const seen = new Set(prev.map((e) => e.url))
            const next = [...prev]
            for (const raw of raws) {
                if (next.length >= MAX_SOURCE_URLS) break
                const url = normalizeUrl(raw)
                if (!url || seen.has(url)) continue
                seen.add(url)
                next.push(makeEntry(url))
            }
            return next
        })
    }, [])

    const addUrl = useCallback((raw: string) => addUrls([raw]), [addUrls])

    const removeUrl = useCallback((id: string) => {
        setSourceUrls((prev) => prev.filter((e) => e.id !== id))
    }, [])

    const clearUrls = useCallback(() => {
        setSourceUrls([])
    }, [])

    return { sourceUrls, addUrl, addUrls, removeUrl, clearUrls, setSourceUrls }
}
