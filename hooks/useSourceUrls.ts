import { useState, useCallback } from 'react'
import { resolveFirstPartyTitle } from '@/lib/first-party-title'

export interface SourceUrlEntry {
    id: string
    url: string
    isFirstParty: boolean
    /** Real page title, resolved async for first-party entries. Undefined while resolving/unresolved. */
    title?: string
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

// Auto-detect sweetener: pull explicit-scheme URLs out of pasted/typed text
// so they can be queued into source_url without the user going through the
// "Add URL" popover. Scheme-required deliberately — matching bare-domain
// tokens like "e.g." or "v3.5" against ordinary prose is a false-positive
// magnet, so this only fires on `http(s)://...`, same as normalizeUrl's own
// scheme check but stricter (no bare-domain fallback here).
const URL_TOKEN_RE = /\bhttps?:\/\/[^\s<>"')\]]+/gi

/** Every explicit-scheme URL found anywhere in `text` — for paste, where the whole clipboard is available at once. */
export function extractUrls(text: string): string[] {
    return text.match(URL_TOKEN_RE) ?? []
}

/**
 * The URL the user just finished typing, if any — call this from `onChange`
 * on every keystroke. Only fires the instant a trailing whitespace/newline is
 * typed (the token is "done"), and only if that whole token is a URL, so
 * `https://exam` mid-type is never treated as one.
 */
export function lastCompletedUrlToken(text: string): string | null {
    if (!/[ \t\n]$/.test(text)) return null
    const tokens = text.slice(0, -1).split(/\s+/)
    const last = tokens[tokens.length - 1]
    if (last && /^https?:\/\/\S+$/i.test(last)) return last
    return null
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

        // Resolve first-party titles independently of the state update above
        // — the updater isn't guaranteed to have run by the time this line
        // executes, so this can't depend on which entries it actually kept.
        // resolveFirstPartyTitle is cached/de-duped and the patch below is a
        // harmless no-op for any URL that didn't end up in the list (cap
        // reached, duplicate, invalid), so resolving unconditionally is fine.
        for (const raw of raws) {
            const url = normalizeUrl(raw)
            if (!url || !isFirstPartyUrl(url)) continue
            resolveFirstPartyTitle(url).then((title) => {
                if (!title) return
                setSourceUrls((prev) => prev.map((e) => (e.url === url ? { ...e, title } : e)))
            })
        }
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
