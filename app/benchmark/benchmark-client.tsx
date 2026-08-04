'use client'

import { useEffect, useMemo, useState } from 'react'
import { BarChart3, Grid3x3, Radar, ListChecks, RefreshCw, Info } from 'lucide-react'
import { useEvalFetch, useEvalQuery } from '@/hooks/useBenchmark'
import { ModelPicker } from '@/components/benchmark/model-picker'
import { QualityScatter } from '@/components/benchmark/quality-scatter'
import { LeaderboardTable, StatTile } from '@/components/benchmark/leaderboard-table'
import { CaseMatrix } from '@/components/benchmark/case-matrix'
import { SuiteCompare } from '@/components/benchmark/suite-compare'
import { FamilyGrid } from '@/components/benchmark/family-grid'
import { RubricPanel } from '@/components/benchmark/rubric-panel'
import { ResultDrawer } from '@/components/benchmark/result-drawer'
import { OmniIndexHero } from '@/components/benchmark/omni-index-hero'
import {
    type CheckFailureRow,
    type EvalCase,
    type EvalRun,
    type FamilyGridRow,
    type LeaderboardRow,
    type LeaderboardRowWithIndex,
    type MatrixResponse,
    compareModels,
    fmtCost,
    fmtDate,
    fmtPct,
    fmtScore,
    omniIndex,
} from '@/lib/benchmark'
import { cn } from '@/lib/utils'

type View = 'overview' | 'matrix' | 'shape' | 'rubric'

const VIEWS: { key: View; label: string; icon: typeof BarChart3 }[] = [
    { key: 'overview', label: 'Overview', icon: BarChart3 },
    { key: 'matrix', label: 'Case matrix', icon: Grid3x3 },
    { key: 'shape', label: 'Compare', icon: Radar },
    { key: 'rubric', label: 'Rubric', icon: ListChecks },
]

export function BenchmarkClient() {
    const [view, setView] = useState<View>('overview')
    const [labelFilter, setLabelFilter] = useState<string>('')
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [touchedSelection, setTouchedSelection] = useState(false)
    const [xMetric, setXMetric] = useState('cost_usd_per_case')
    const [touchedXMetric, setTouchedXMetric] = useState(false)
    const [yMetric, setYMetric] = useState('score')
    const [drawer, setDrawer] = useState<{ caseId: string; model: string; runId: string } | null>(null)
    const [refreshing, setRefreshing] = useState(false)
    const [refreshNote, setRefreshNote] = useState<string | null>(null)
    const { forceRefresh } = useEvalFetch()

    const params = labelFilter ? { label: labelFilter } : undefined

    const leaderboard = useEvalQuery<{ rows: LeaderboardRow[] }>('leaderboard', params, [labelFilter])
    const runs = useEvalQuery<{ runs: EvalRun[] }>('runs', { limit: 200, status: 'done', ...(params ?? {}) }, [labelFilter])
    const matrix = useEvalQuery<MatrixResponse>('matrix', { latest_per_model: true, ...(params ?? {}) }, [labelFilter])
    const family = useEvalQuery<{ rows: FamilyGridRow[] }>('family-grid', undefined, [])
    const failures = useEvalQuery<{ rows: CheckFailureRow[] }>('check-failures', { min_evaluated: 1, limit: 200 }, [])
    const cases = useEvalQuery<{ cases: EvalCase[] }>('cases', undefined, [])

    /**
     * Collapse the leaderboard to one row per model.
     *
     * The view spans every run ever recorded, and runs accumulate — a smoke run
     * and a full matrix run of the same model both persist forever. Without
     * this, one model appears several times with different case coverage and
     * the scatter shows the same name at two different scores.
     */
    const modelRows = useMemo(() => {
        const rows = leaderboard.data?.rows ?? []
        const newest = new Map<string, LeaderboardRow>()
        for (const row of rows) {
            const existing = newest.get(row.model_label)
            if (!existing || new Date(row.started_at) > new Date(existing.started_at)) {
                newest.set(row.model_label, row)
            }
        }
        // omni_index is computed here, once per model, rather than inline per
        // consumer — the scatter, the table and the hero banner all read the
        // same number off the row instead of recomputing it three times.
        return [...newest.values()]
            .sort(compareModels)
            .map((row): LeaderboardRowWithIndex => ({ ...row, omni_index: omniIndex(row) }))
    }, [leaderboard.data])

    // Select everything the first time data lands, then leave the user's
    // choice alone — re-selecting on every refetch would undo their filtering.
    useEffect(() => {
        if (touchedSelection || modelRows.length === 0) return
        setSelected(new Set(modelRows.map((r) => r.model_label)))
    }, [modelRows, touchedSelection])

    // Cost is the most useful x axis, but it is NULL for every model until
    // eval_pricing is populated — which would render the page's headline chart
    // completely empty on first load. Fall back to latency, which is always
    // recorded, unless the user has picked an axis themselves.
    useEffect(() => {
        if (touchedXMetric || modelRows.length === 0) return
        const anyCost = modelRows.some((r) => r.cost_usd_per_case !== null)
        setXMetric(anyCost ? 'cost_usd_per_case' : 'latency_ms_p50')
    }, [modelRows, touchedXMetric])

    const labels = useMemo(() => {
        const set = new Set<string>()
        for (const run of runs.data?.runs ?? []) if (run.label) set.add(run.label)
        return [...set].sort()
    }, [runs.data])

    const runByModel = useMemo(() => {
        const map = new Map<string, EvalRun>()
        for (const run of runs.data?.runs ?? []) {
            const existing = map.get(run.model_label)
            if (!existing || new Date(run.started_at) > new Date(existing.started_at)) {
                map.set(run.model_label, run)
            }
        }
        return map
    }, [runs.data])

    const toggle = (model: string) => {
        setTouchedSelection(true)
        setSelected((prev) => {
            const next = new Set(prev)
            next.has(model) ? next.delete(model) : next.add(model)
            return next
        })
    }

    const setMany = (models: string[]) => {
        setTouchedSelection(true)
        setSelected(new Set(models))
    }

    /**
     * Drop the server cache, then re-fetch past the edge cache.
     *
     * Both steps are needed. Reads are cached for a week in Redis and for 60s
     * at the proxy, so refetching alone would hand back the rows already on
     * screen and the button would look broken — which matters most in exactly
     * the case someone reaches for it: a run just finished and they want to
     * see it.
     */
    const refetchAll = async () => {
        if (refreshing) return
        setRefreshing(true)
        setRefreshNote(null)
        try {
            const { refreshed, retryAfter } = await forceRefresh()
            for (const q of [leaderboard, runs, matrix, family, failures, cases]) {
                q.refetch({ bust: true })
            }
            if (!refreshed) {
                // Not a failure: the cooldown means someone refreshed seconds
                // ago, so what just loaded is already current. Say so rather
                // than showing an error for a button that worked.
                setRefreshNote(`Already refreshed in the last ${retryAfter || 30}s — showing latest`)
            }
        } finally {
            setRefreshing(false)
        }
    }

    const headline = useMemo(() => {
        const visible = modelRows.filter((r) => selected.has(r.model_label))
        const best = visible.reduce<LeaderboardRow | null>(
            (acc, r) => (r.score !== null && (!acc || (acc.score ?? -1) < r.score) ? r : acc),
            null
        )
        const bestOmni = visible.reduce<LeaderboardRowWithIndex | null>(
            (acc, r) => (r.omni_index !== null && (!acc || (acc.omni_index ?? -1) < r.omni_index) ? r : acc),
            null
        )
        const priced = visible.filter((r) => r.cost_usd_per_case !== null)
        const cheapest = priced.reduce<LeaderboardRow | null>(
            (acc, r) => (!acc || (acc.cost_usd_per_case ?? 1e9) > (r.cost_usd_per_case ?? 1e9) ? r : acc),
            null
        )
        const fastest = visible
            .filter((r) => r.ttft_ms_p50 !== null)
            .reduce<LeaderboardRow | null>(
                (acc, r) => (!acc || (acc.ttft_ms_p50 ?? 1e9) > (r.ttft_ms_p50 ?? 1e9) ? r : acc),
                null
            )
        return { best, bestOmni, cheapest, fastest, count: visible.length, priced: priced.length }
    }, [modelRows, selected])

    const loading = leaderboard.loading && !leaderboard.data
    const fatal = leaderboard.error

    return (
        <div className="min-h-screen">
            <div className="max-w-[1400px] mx-auto px-6 pb-16">
                {/* header */}
                <header className="pt-10 pb-6">
                    <div className="flex flex-wrap items-end justify-between gap-4">
                        <div>
                            <h1 className="text-[26px] sm:text-[28px] font-semibold tracking-tight text-[var(--foreground)]">
                                Benchmarks
                            </h1>
                            <p className="mt-1.5 text-sm text-[var(--muted-foreground)] max-w-2xl">
                                How each model behaves in Omni&apos;s pro mode — skill triggering, output
                                contracts, answer quality, and what it costs to get there.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            {labels.length > 0 && (
                                <select
                                    value={labelFilter}
                                    onChange={(e) => setLabelFilter(e.target.value)}
                                    className="text-[12px] rounded-lg border border-[var(--border-subtle)] bg-[var(--card)] px-2.5 py-1.5 text-[var(--foreground)] outline-none focus:border-[var(--accent)] transition-colors cursor-pointer"
                                >
                                    <option value="">All run batches</option>
                                    {labels.map((l) => (
                                        <option key={l} value={l}>
                                            {l}
                                        </option>
                                    ))}
                                </select>
                            )}
                            <button
                                onClick={refetchAll}
                                disabled={refreshing}
                                title="Clear the server cache and reload from the database"
                                className={cn(
                                    'inline-flex items-center gap-1.5 text-[12px] rounded-lg border border-[var(--border-subtle)] bg-[var(--card)] px-2.5 py-1.5 transition-colors',
                                    refreshing
                                        ? 'text-[var(--muted-foreground)] cursor-wait'
                                        : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                                )}
                            >
                                <RefreshCw
                                    className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')}
                                    strokeWidth={1.5}
                                />
                                {refreshing ? 'Refreshing…' : 'Refresh'}
                            </button>
                        </div>
                    </div>
                    {refreshNote && (
                        <p className="mt-2 text-[11px] text-[var(--muted-foreground)] text-right">
                            {refreshNote}
                        </p>
                    )}
                </header>

                {fatal && (
                    <div className="mb-6 rounded-xl border border-[var(--warning)]/30 bg-[var(--warning)]/[0.06] px-4 py-3">
                        <p className="text-[13px] text-[var(--foreground)]">{leaderboard.error}</p>
                        <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                            The backend must be running and the eval tables created (evals/schema_evals.sql).
                        </p>
                    </div>
                )}

                {loading && (
                    <div className="py-20 text-center text-[13px] text-[var(--muted-foreground)]">
                        Loading benchmark data…
                    </div>
                )}

                {!loading && !fatal && modelRows.length === 0 && (
                    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-6 py-14 text-center">
                        <p className="text-[14px] text-[var(--foreground)]">No evaluation runs yet.</p>
                        <p className="mt-1.5 text-[12px] text-[var(--muted-foreground)]">
                            Run <code className="px-1 py-0.5 rounded bg-[var(--muted)]">python -m evals.cli --smoke --models all</code> to populate this page.
                        </p>
                    </div>
                )}

                {!loading && modelRows.length > 0 && (
                    <>
                        <OmniIndexHero
                            rows={modelRows}
                            selected={selected}
                            onSelectModel={toggle}
                        />

                        {/* stat row */}
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
                            <StatTile
                                label="Models"
                                value={String(headline.count)}
                                hint={`${modelRows.length} evaluated in total`}
                            />
                            <StatTile
                                label="Best quality"
                                value={fmtScore(headline.best?.score)}
                                hint={headline.best?.model_label ?? '—'}
                            />
                            <StatTile
                                label="Fastest to first token"
                                value={headline.fastest ? `${Math.round(headline.fastest.ttft_ms_p50 ?? 0)}ms` : '—'}
                                hint={headline.fastest?.model_label ?? '—'}
                            />
                            <StatTile
                                label="Cheapest per case"
                                value={fmtCost(headline.cheapest?.cost_usd_per_case)}
                                hint={
                                    headline.priced === 0
                                        ? 'no prices in eval_pricing'
                                        : headline.cheapest?.model_label ?? '—'
                                }
                            />
                        </div>

                        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[290px_1fr] items-start">
                            {/* sticky control column */}
                            <aside className="lg:sticky lg:top-6 space-y-3">
                                <ModelPicker
                                    rows={modelRows}
                                    selected={selected}
                                    onToggle={toggle}
                                    onSetMany={setMany}
                                />
                                <SelectionSummary
                                    selected={selected}
                                    runByModel={runByModel}
                                />
                            </aside>

                            <main className="min-w-0 space-y-4">
                                <nav className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--muted)] w-full overflow-x-auto sm:w-fit">
                                    {VIEWS.map(({ key, label, icon: Icon }) => (
                                        <button
                                            key={key}
                                            onClick={() => setView(key)}
                                            className={cn(
                                                'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-md text-[12px] transition-colors',
                                                view === key
                                                    ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm'
                                                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                                            )}
                                        >
                                            <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
                                            {label}
                                        </button>
                                    ))}
                                </nav>

                                {view === 'overview' && (
                                    <>
                                        <QualityScatter
                                            rows={modelRows}
                                            selected={selected}
                                            xMetric={xMetric}
                                            yMetric={yMetric}
                                            onXMetricChange={(k) => {
                                                setTouchedXMetric(true)
                                                setXMetric(k)
                                            }}
                                            onYMetricChange={setYMetric}
                                            onSelectModel={toggle}
                                        />
                                        <LeaderboardTable
                                            rows={modelRows}
                                            selected={selected}
                                            onToggle={toggle}
                                        />
                                    </>
                                )}

                                {view === 'matrix' && (
                                    <>
                                        {matrix.loading && !matrix.data && (
                                            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-12 text-center text-[13px] text-[var(--muted-foreground)]">
                                                Loading matrix…
                                            </div>
                                        )}
                                        {matrix.data && (
                                            <CaseMatrix
                                                matrix={matrix.data}
                                                selected={selected}
                                                onOpenCell={(caseId, model, cell) =>
                                                    setDrawer({ caseId, model, runId: cell.run_id })
                                                }
                                            />
                                        )}
                                    </>
                                )}

                                {view === 'shape' && (
                                    <>
                                        <SuiteCompare runs={runs.data?.runs ?? []} selected={selected} />
                                        <FamilyGrid rows={family.data?.rows ?? []} />
                                    </>
                                )}

                                {view === 'rubric' && (
                                    <RubricPanel
                                        failures={failures.data?.rows ?? []}
                                        cases={cases.data?.cases ?? []}
                                    />
                                )}
                            </main>
                        </div>
                    </>
                )}
            </div>

            <ResultDrawer
                open={drawer !== null}
                caseId={drawer?.caseId ?? null}
                modelLabel={drawer?.model ?? null}
                runId={drawer?.runId ?? null}
                onClose={() => setDrawer(null)}
            />
        </div>
    )
}

/**
 * Provenance for whatever is currently selected.
 *
 * A score is only meaningful alongside the conditions that produced it, and
 * two of these change the number materially: `tool_cache` off means search luck
 * moves the result, and a different `prompt_sha` means the models were not
 * given the same instructions. Surfacing them here stops a cross-batch
 * comparison being read as a model difference.
 */
function SelectionSummary({
    selected,
    runByModel,
}: {
    selected: Set<string>
    runByModel: Map<string, EvalRun>
}) {
    const runs = [...selected].map((m) => runByModel.get(m)).filter((r): r is EvalRun => Boolean(r))
    if (runs.length === 0) return null

    const promptShas = new Set(runs.map((r) => r.prompt_sha ?? '—'))
    const cacheModes = new Set(runs.map((r) => r.tool_cache))
    const judges = new Set(runs.map((r) => r.judge_model ?? 'none'))
    const latest = runs.reduce((a, b) => (new Date(a.started_at) > new Date(b.started_at) ? a : b))

    return (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3 space-y-2">
            <div className="flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 text-[var(--muted-foreground)]" strokeWidth={1.5} />
                <span className="text-[12px] font-medium text-[var(--foreground)]">Run conditions</span>
            </div>
            <dl className="space-y-1 text-[11px]">
                <Row k="latest run" v={fmtDate(latest.started_at)} />
                <Row k="judge" v={[...judges].join(', ').replace('openai:', '')} />
                <Row
                    k="tool cache"
                    v={cacheModes.size > 1 ? 'mixed' : cacheModes.has(true) ? 'on' : 'off'}
                    warn={cacheModes.size > 1}
                />
                <Row
                    k="prompt"
                    v={promptShas.size > 1 ? `${promptShas.size} versions` : [...promptShas][0]?.slice(0, 7) ?? '—'}
                    warn={promptShas.size > 1}
                />
            </dl>
            {promptShas.size > 1 && (
                <p className="text-[10px] leading-relaxed text-[var(--warning)]">
                    These runs used different system prompts — differences here aren&apos;t purely the models.
                </p>
            )}
            {cacheModes.size > 1 && (
                <p className="text-[10px] leading-relaxed text-[var(--warning)]">
                    Mixed tool-cache settings: uncached runs saw different search results, so part of any
                    gap is search luck.
                </p>
            )}
        </div>
    )
}

function Row({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
    return (
        <div className="flex items-baseline justify-between gap-2">
            <dt className="text-[var(--muted-foreground)]">{k}</dt>
            <dd
                className={cn(
                    'tabular-nums truncate min-w-0',
                    warn ? 'text-[var(--warning)]' : 'text-[var(--foreground)]'
                )}
            >
                {v}
            </dd>
        </div>
    )
}

export { fmtPct }
