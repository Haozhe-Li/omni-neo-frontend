'use client'

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react'
import { useEvalFetch } from '@/hooks/useBenchmark'
import {
    type EvalRun,
    type LeaderboardRow,
    type LeaderboardRowWithIndex,
    type MatrixResponse,
    compareModels,
    modelTraits,
    omniIndex,
} from '@/lib/benchmark'

/** The trait facets a reader can narrow the roster by. */
export interface ModelFilters {
    multimodal: boolean
    openWeights: boolean
}

/**
 * One fetch of the benchmark data for the whole `/benchmark` route tree.
 *
 * This lives in `app/benchmark/layout.tsx`, which Next.js keeps mounted while
 * you move between the overview, a model page and the compare page — so those
 * navigations are instant and request nothing. That is the entire reason the
 * three views are routes rather than tabs: shareable URLs and a working back
 * button, without paying a reload for either.
 *
 * The heavy per-case matrix is deliberately *not* part of the initial load.
 * Only the model and compare pages need it, it is by far the largest response,
 * and making the overview wait on it would be paying for it on every visit.
 * Those pages call `loadMatrix()` on mount; it fetches at most once.
 */
interface BenchmarkContextValue {
    /** One row per model, newest run wins, `omni_index` merged in. */
    models: LeaderboardRowWithIndex[]
    /** Newest completed run per model — carries suite scores and provenance. */
    runByModel: Map<string, EvalRun>
    /**
     * The roster after the reader's trait filter.
     *
     * Kept separate from `models` rather than replacing it, because the two
     * answer different questions. A ranking shows what the reader asked to see;
     * a model page's "#3 of 18" must stay measured against the whole field, or
     * a rank would silently improve as you hid competitors.
     */
    visibleModels: LeaderboardRowWithIndex[]
    filters: ModelFilters
    setFilters: (filters: ModelFilters) => void

    loading: boolean
    /** True only while a manual refresh is in flight, so views can skeleton. */
    refreshing: boolean
    error: string | null
    /** Set when a refresh was a no-op because the backend was still cooling down. */
    note: string | null
    refresh: () => Promise<void>

    matrix: MatrixResponse | null
    matrixLoading: boolean
    loadMatrix: () => void
}

const BenchmarkContext = createContext<BenchmarkContextValue | null>(null)

export function useBenchmarkData(): BenchmarkContextValue {
    const ctx = useContext(BenchmarkContext)
    if (!ctx) throw new Error('useBenchmarkData must be used inside <BenchmarkProvider>')
    return ctx
}

export function BenchmarkProvider({ children }: { children: ReactNode }) {
    const { fetchEval, forceRefresh } = useEvalFetch()

    const [filters, setFilters] = useState<ModelFilters>({ multimodal: false, openWeights: false })
    const [leaderboard, setLeaderboard] = useState<LeaderboardRow[] | null>(null)
    const [runs, setRuns] = useState<EvalRun[]>([])
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [note, setNote] = useState<string | null>(null)

    const [matrix, setMatrix] = useState<MatrixResponse | null>(null)
    const [matrixLoading, setMatrixLoading] = useState(false)
    const [matrixWanted, setMatrixWanted] = useState(false)

    // Bumped by refresh(); appended to the URL so the 60s edge cache in the
    // proxy route can't hand back the rows already on screen (see the route's
    // Cache-Control note) and make the button look broken.
    const [bust, setBust] = useState('')

    const load = useCallback(async () => {
        const cacheBust = bust ? { _ts: bust } : {}
        const [board, runList] = await Promise.all([
            fetchEval<{ rows: LeaderboardRow[] }>('leaderboard', cacheBust),
            fetchEval<{ runs: EvalRun[] }>('runs', { limit: 200, status: 'done', ...cacheBust }),
        ])
        setLeaderboard(board.rows)
        setRuns(runList.runs)
    }, [fetchEval, bust])

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(null)
        load()
            .catch((e: Error) => {
                if (!cancelled) setError(e.message)
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [load])

    // Matrix: fetched the first time a page asks for it, then re-fetched when
    // the batch filter or a refresh changes what "current" means.
    useEffect(() => {
        if (!matrixWanted) return
        let cancelled = false
        setMatrixLoading(true)
        fetchEval<MatrixResponse>('matrix', {
            latest_per_model: true,
            ...(bust ? { _ts: bust } : {}),
        })
            .then((data) => {
                if (!cancelled) setMatrix(data)
            })
            .catch(() => {
                // Non-fatal: the per-case sections degrade to an empty state
                // rather than taking the whole page down with them.
                if (!cancelled) setMatrix(null)
            })
            .finally(() => {
                if (!cancelled) setMatrixLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [matrixWanted, fetchEval, bust])

    const loadMatrix = useCallback(() => setMatrixWanted(true), [])

    /**
     * Drop the server cache, then reload past the edge cache.
     *
     * Both steps are needed: reads are cached for a week in Redis and 60s at
     * the proxy, so refetching alone hands back what is already on screen —
     * which matters most in exactly the case someone reaches for this button,
     * right after a run finished.
     */
    const refresh = useCallback(async () => {
        setRefreshing(true)
        setNote(null)
        try {
            const { refreshed, retryAfter } = await forceRefresh()
            if (!refreshed) {
                // Not a failure: the cooldown means someone refreshed seconds
                // ago, so what loads now is already current. Say that instead
                // of showing an error for a button that worked.
                setNote(`Already refreshed in the last ${retryAfter || 30}s — showing latest`)
            }
            setBust(String(Date.now()))
        } finally {
            setRefreshing(false)
        }
    }, [forceRefresh])

    /**
     * Collapse the leaderboard to one row per model.
     *
     * The view spans every run ever recorded, and runs accumulate — a smoke run
     * and a full matrix run of the same model both persist forever. Without
     * this, one model appears several times with different case coverage and
     * the same name lands at two different scores in one chart.
     */
    const models = useMemo(() => {
        const newest = new Map<string, LeaderboardRow>()
        for (const row of leaderboard ?? []) {
            const existing = newest.get(row.model_label)
            if (!existing || new Date(row.started_at) > new Date(existing.started_at)) {
                newest.set(row.model_label, row)
            }
        }
        // omni_index is computed once per model here rather than inline per
        // consumer, so every chart reads the same number off the row.
        return [...newest.values()]
            .sort(compareModels)
            .map((row): LeaderboardRowWithIndex => ({ ...row, omni_index: omniIndex(row) }))
    }, [leaderboard])

    const runByModel = useMemo(() => {
        const map = new Map<string, EvalRun>()
        for (const run of runs) {
            const existing = map.get(run.model_label)
            if (!existing || new Date(run.started_at) > new Date(existing.started_at)) {
                map.set(run.model_label, run)
            }
        }
        return map
    }, [runs])

    // Applied here rather than in each page so the choice survives navigation
    // between the overview, a metric page and back.
    const visibleModels = useMemo(() => {
        if (!filters.multimodal && !filters.openWeights) return models
        return models.filter((row) => {
            const traits = modelTraits(row.model_family, row.model_label)
            // Both ticked means both must hold — the ordinary reading of two
            // filters, and the only one that makes ticking the second do
            // anything.
            if (filters.multimodal && !traits.multimodal) return false
            if (filters.openWeights && !traits.openWeights) return false
            return true
        })
    }, [models, filters])

    const value = useMemo(
        (): BenchmarkContextValue => ({
            models,
            runByModel,
            visibleModels,
            filters,
            setFilters,
            // `leaderboard === null` rather than the loading flag: a manual
            // refresh refetches with rows already on screen, and blanking the
            // page to a skeleton for that would be a worse read than leaving
            // the old rows up for the moment it takes.
            loading: loading && leaderboard === null,
            refreshing,
            error,
            note,
            refresh,
            matrix,
            matrixLoading,
            loadMatrix,
        }),
        [
            models,
            runByModel,
            visibleModels,
            filters,
            loading,
            leaderboard,
            refreshing,
            error,
            note,
            refresh,
            matrix,
            matrixLoading,
            loadMatrix,
        ]
    )

    return <BenchmarkContext.Provider value={value}>{children}</BenchmarkContext.Provider>
}
