'use client'

import { useEffect, useMemo, useState } from 'react'
import { useBenchmarkData } from '@/components/benchmark/benchmark-provider'
import { ResultDrawer } from '@/components/benchmark/result-drawer'
import { SkeletonBlock } from '@/components/benchmark/skeletons'
import {
    type MatrixCell,
    fmtMs,
    fmtScore,
    scoreTint,
    shortCaseId,
    suiteOf,
} from '@/lib/benchmark'
import { cn } from '@/lib/utils'

/**
 * How this model did on each individual case, grouped by suite.
 *
 * This is what is left of the old case matrix, and deliberately less: the
 * matrix asked the reader to scan a 13 × N grid of tinted cells to answer a
 * question about one model. Sliced to a single model, the same data is a row
 * of bars you can read in one pass — and the cases worth opening (the failures)
 * sort themselves to the eye instead of hiding in a column.
 *
 * Every bar opens the existing result drawer: checks, the answer, the report
 * and the tool trace for that one case.
 */
export function ModelCases({ modelLabel }: { modelLabel: string }) {
    const { matrix, matrixLoading, loadMatrix } = useBenchmarkData()
    const [drawer, setDrawer] = useState<{ caseId: string; runId: string } | null>(null)

    // The matrix is the largest response the API serves and only these deeper
    // pages need it, so the provider holds it back until something asks.
    useEffect(() => loadMatrix(), [loadMatrix])

    const suites = useMemo(() => {
        if (!matrix) return []
        const bySuite = new Map<string, { caseId: string; cell: MatrixCell }[]>()

        for (const c of matrix.cases) {
            const cell = matrix.cells[c.case_id]?.[modelLabel]
            if (!cell) continue
            const suite = c.suite || suiteOf(c.case_id)
            if (!bySuite.has(suite)) bySuite.set(suite, [])
            bySuite.get(suite)!.push({ caseId: c.case_id, cell })
        }

        return [...bySuite.entries()]
            .map(([suite, cases]) => ({
                suite,
                // Worst first: the failures are the reason anyone opens this.
                cases: cases.sort((a, b) => (a.cell.score_mean ?? 0) - (b.cell.score_mean ?? 0)),
            }))
            .sort((a, b) => a.suite.localeCompare(b.suite))
    }, [matrix, modelLabel])

    const total = suites.reduce((n, s) => n + s.cases.length, 0)

    return (
        <section className="min-w-0 rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] p-4 sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[13px] font-medium text-[var(--foreground)]">Case by case</h2>
                {total > 0 && (
                    <span className="text-[11px] text-[var(--muted-foreground)]">
                        {total} cases · weakest first · tap for the full result
                    </span>
                )}
            </div>

            {matrixLoading && !matrix && (
                <div className="mt-4 space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i}>
                            <SkeletonBlock className="h-3 w-24" />
                            <div className="mt-2 flex gap-1">
                                {Array.from({ length: 10 }).map((_, j) => (
                                    <SkeletonBlock key={j} className="h-12 flex-1" />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {!matrixLoading && total === 0 && (
                <p className="mt-3 text-[12px] text-[var(--muted-foreground)]">
                    No per-case results recorded for this model in the current batch.
                </p>
            )}

            <div className="mt-4 space-y-5">
                {suites.map((group) => (
                    <div key={group.suite} className="min-w-0">
                        <div className="mb-2 flex items-baseline gap-2">
                            <h3 className="text-[12px] font-medium text-[var(--foreground)]">
                                {group.suite}
                            </h3>
                            <span className="text-[10px] text-[var(--muted-foreground)]">
                                {group.cases.length} cases
                            </span>
                        </div>

                        <div className="flex flex-wrap gap-1">
                            {group.cases.map((c) => {
                                const score = c.cell.score_mean
                                const failed = score !== null && score < 0.5
                                return (
                                    <button
                                        key={c.caseId}
                                        onClick={() => setDrawer({ caseId: c.caseId, runId: c.cell.run_id })}
                                        title={
                                            `${shortCaseId(c.caseId)} · score ${fmtScore(score)}` +
                                            (c.cell.latency_ms_p50 ? ` · ${fmtMs(c.cell.latency_ms_p50)}` : '') +
                                            (c.cell.n_errors ? ` · ${c.cell.n_errors} errors` : '')
                                        }
                                        className={cn(
                                            'group relative flex h-14 w-[calc(20%-0.2rem)] min-w-0 flex-col justify-end overflow-hidden rounded-md border p-1 text-left outline-none transition-colors',
                                            'sm:w-[64px]',
                                            failed
                                                ? 'border-[var(--warning)]/40'
                                                : 'border-[var(--border-subtle)]',
                                            'hover:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]'
                                        )}
                                        style={{ backgroundColor: scoreTint(score) }}
                                    >
                                        <span className="truncate text-[9px] leading-tight text-[var(--foreground)] opacity-70">
                                            {shortCaseId(c.caseId)}
                                        </span>
                                        <span className="text-[11px] font-semibold leading-none tabular-nums text-[var(--foreground)]">
                                            {score === null ? '—' : score.toFixed(2)}
                                        </span>
                                        {c.cell.n_errors > 0 && (
                                            <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[var(--warning)]" />
                                        )}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                ))}
            </div>

            <ResultDrawer
                open={drawer !== null}
                caseId={drawer?.caseId ?? null}
                modelLabel={modelLabel}
                runId={drawer?.runId ?? null}
                onClose={() => setDrawer(null)}
            />
        </section>
    )
}
