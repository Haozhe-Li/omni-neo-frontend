'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Data access for the benchmark page.
 *
 * No auth: the page is public and the eval endpoints are too. Nothing here is
 * user data — every row describes a fixed synthetic test case from
 * evals/cases.yaml being answered by a model.
 */
export function useEvalFetch() {
    const fetchEval = useCallback(
        async <T,>(
            path: string,
            params?: Record<string, string | number | boolean | undefined>
        ): Promise<T> => {
            const qs = new URLSearchParams()
            for (const [k, v] of Object.entries(params ?? {})) {
                if (v !== undefined && v !== '') qs.set(k, String(v))
            }
            const query = qs.toString()
            const res = await fetch(`/api/evals/${path}${query ? `?${query}` : ''}`)
            if (!res.ok) {
                const body = await res.text()
                let message = body
                try {
                    const parsed = JSON.parse(body)
                    message = parsed.detail || parsed.error || body
                } catch {
                    /* keep the raw text */
                }
                throw new Error(message || `Request failed (${res.status})`)
            }
            return res.json() as Promise<T>
        },
        []
    )

    /**
     * Drop the backend's cache, then report whether it actually happened.
     *
     * The reads are cached for a week server-side, so a plain refetch would
     * return the exact rows the page already has. This asks the backend to
     * bump its cache generation first; it rate-limits that to one real
     * invalidation per window and answers `refreshed: false` when someone
     * beat us to it — which still means the data is fresh, so it is not an
     * error.
     */
    const forceRefresh = useCallback(async (): Promise<{ refreshed: boolean; retryAfter: number }> => {
        try {
            const res = await fetch('/api/evals/refresh', { method: 'POST' })
            if (!res.ok) return { refreshed: false, retryAfter: 0 }
            const body = await res.json()
            return { refreshed: Boolean(body.refreshed), retryAfter: Number(body.retry_after) || 0 }
        } catch {
            return { refreshed: false, retryAfter: 0 }
        }
    }, [])

    return { fetchEval, forceRefresh }
}

interface QueryState<T> {
    data: T | null
    loading: boolean
    error: string | null
}

/**
 * Fetch-on-mount with re-fetch when `deps` change.
 *
 * Tracks a request id so a slow earlier request can't overwrite a newer one's
 * result — the filter bar fires a fresh fetch on every model toggle, and
 * out-of-order responses would otherwise flip the page back to stale data.
 */
export function useEvalQuery<T>(
    path: string | null,
    params: Record<string, string | number | boolean | undefined> | undefined,
    deps: unknown[]
): QueryState<T> & { refetch: (opts?: { bust?: boolean }) => void } {
    const { fetchEval } = useEvalFetch()
    const [state, setState] = useState<QueryState<T>>({ data: null, loading: true, error: null })
    const requestId = useRef(0)
    const [nonce, setNonce] = useState(0)
    // Cache-busting token, set only by an explicit forced refresh. The proxy
    // route holds successful reads at the edge for 60s, so dropping the
    // backend cache is not enough on its own — without a changed URL the
    // browser would be handed that edge copy and the refresh would look like
    // it did nothing. Left empty on ordinary refetches so normal navigation
    // still benefits from the edge cache.
    const [bustToken, setBustToken] = useState('')

    useEffect(() => {
        if (!path) {
            setState({ data: null, loading: false, error: null })
            return
        }

        const id = ++requestId.current
        setState((s) => ({ ...s, loading: true, error: null }))

        fetchEval<T>(path, bustToken ? { ...params, _ts: bustToken } : params)
            .then((data) => {
                if (id !== requestId.current) return
                setState({ data, loading: false, error: null })
            })
            .catch((e: Error) => {
                if (id !== requestId.current) return
                setState({ data: null, loading: false, error: e.message })
            })
        // params is intentionally not a dep — callers pass a fresh object every
        // render, so it would loop. `deps` is the explicit dependency list.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [path, nonce, bustToken, ...deps])

    const refetch = useCallback((opts?: { bust?: boolean }) => {
        if (opts?.bust) setBustToken(String(Date.now()))
        setNonce((n) => n + 1)
    }, [])

    return { ...state, refetch }
}
