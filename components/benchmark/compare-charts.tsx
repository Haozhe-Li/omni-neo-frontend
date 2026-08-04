'use client'

import { useEffect, useMemo, useState } from 'react'
import { EChartsChart, useChartTheme } from '@/components/echarts-chart'
import { useBenchmarkData } from '@/components/benchmark/benchmark-provider'
import { SkeletonBlock } from '@/components/benchmark/skeletons'
import {
    METRICS,
    METRIC_CARDS,
    type EvalRun,
    type LeaderboardRowWithIndex,
    fmtScore,
    metricValue,
    shortCaseId,
} from '@/lib/benchmark'
import { cn } from '@/lib/utils'

interface CompareProps {
    rows: LeaderboardRowWithIndex[]
    colorOf: (label: string) => string
}

// ── suite radar ─────────────────────────────────────────────────────────────
/**
 * Capability shape across suites.
 *
 * A radar answers a question bars cannot: is this model broadly good, or good
 * at one thing? Overlapping polygons stay readable to about four series, which
 * is exactly why the picker caps at four.
 */
export function CompareRadar({
    runs,
    colorOf,
    order,
}: {
    runs: EvalRun[]
    colorOf: (label: string) => string
    order: string[]
}) {
    const theme = useChartTheme()

    const option = useMemo(() => {
        const suiteSet = new Set<string>()
        for (const run of runs) Object.keys(run.suite_scores ?? {}).forEach((s) => suiteSet.add(s))
        const suites = [...suiteSet].sort()
        if (suites.length < 3 || runs.length === 0) return null

        return {
            backgroundColor: 'transparent',
            tooltip: {
                borderWidth: 0,
                padding: [8, 12],
                confine: true,
                backgroundColor: 'rgba(26,26,26,0.94)',
                textStyle: { color: '#fff', fontSize: 12 },
            },
            legend: {
                type: 'scroll',
                bottom: 0,
                itemWidth: 8,
                itemHeight: 8,
                icon: 'circle',
                textStyle: { fontSize: 11, color: theme.axis },
            },
            radar: {
                indicator: suites.map((s) => ({ name: s, max: 1 })),
                radius: '62%',
                center: ['50%', '46%'],
                axisName: { fontSize: 10, color: theme.axis },
                splitLine: { lineStyle: { color: theme.grid } },
                splitArea: { show: false },
                axisLine: { lineStyle: { color: theme.grid } },
            },
            series: [
                {
                    type: 'radar',
                    symbolSize: 4,
                    data: order
                        .map((label) => runs.find((r) => r.model_label === label))
                        .filter((r): r is EvalRun => Boolean(r))
                        .map((run) => ({
                            name: run.model_label,
                            value: suites.map((s) => run.suite_scores?.[s] ?? 0),
                            lineStyle: { color: colorOf(run.model_label), width: 2 },
                            itemStyle: { color: colorOf(run.model_label) },
                            areaStyle: { color: colorOf(run.model_label), opacity: 0.1 },
                        })),
                },
            ],
        }
    }, [runs, colorOf, order, theme])

    return (
        <section className="min-w-0 rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] p-4 sm:p-5">
            <h2 className="text-[13px] font-medium text-[var(--foreground)]">Capability shape</h2>
            <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                Score per suite, 0 to 1 — a lopsided polygon is a specialist.
            </p>
            {option ? (
                <EChartsChart option={option} style={{ height: 320 }} />
            ) : (
                <p className="mt-4 text-[12px] text-[var(--muted-foreground)]">
                    Needs at least three suites with scores to draw a shape.
                </p>
            )}
        </section>
    )
}

// ── grouped metric bars ─────────────────────────────────────────────────────
/**
 * Every headline metric, four models side by side.
 *
 * Bars are drawn relative to the best value in each group rather than on a
 * shared scale — the metrics have incompatible units, and the only comparison
 * that means anything within a row is against the other three models.
 */
export function CompareBars({ rows, colorOf }: CompareProps) {
    return (
        <section className="min-w-0 rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] p-4 sm:p-5">
            <h2 className="text-[13px] font-medium text-[var(--foreground)]">Metric by metric</h2>
            <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                Longest bar is the best value in each row, whichever direction the metric points.
            </p>

            <div className="mt-4 space-y-4">
                {METRIC_CARDS.map((card) => {
                    const def = METRICS[card.key]
                    const values = rows.map((row) => ({
                        label: row.model_label,
                        value: metricValue(row as unknown as Record<string, unknown>, card.key),
                    }))
                    const present = values.filter((v): v is { label: string; value: number } => v.value !== null)
                    if (present.length === 0) return null

                    // "Goodness" normalised to the best in the row: for a
                    // lower-is-better metric the cheapest model gets the full
                    // bar, so a longer bar is always better on every row.
                    const best = def?.higherIsBetter
                        ? Math.max(...present.map((v) => v.value))
                        : Math.min(...present.map((v) => v.value))
                    const share = (v: number) =>
                        def?.higherIsBetter
                            ? best === 0
                                ? 100
                                : (v / best) * 100
                            : v === 0
                                ? 100
                                : (best / v) * 100

                    const winner = present.reduce((a, b) =>
                        def?.higherIsBetter ? (b.value > a.value ? b : a) : b.value < a.value ? b : a
                    )

                    return (
                        <div key={card.key} className="min-w-0">
                            <div className="flex items-baseline justify-between gap-2">
                                <h3 className="text-[12px] font-medium text-[var(--foreground)]">
                                    {card.title}
                                </h3>
                                <span className="truncate text-[10px] text-[var(--muted-foreground)]">
                                    best: {winner.label}
                                </span>
                            </div>

                            <ul className="mt-1.5 space-y-1">
                                {values.map((v, i) => (
                                    <li key={v.label} className="flex items-center gap-2">
                                        <span className="w-[30%] shrink-0 truncate text-[11px] text-[var(--muted-foreground)] sm:w-[24%]">
                                            {v.label}
                                        </span>
                                        <span className="relative h-3 min-w-0 flex-1 rounded-sm bg-[var(--muted)]">
                                            {v.value !== null && (
                                                <span
                                                    className="omni-bar-h absolute inset-y-0 left-0 rounded-sm"
                                                    style={{
                                                        ['--bar-size' as string]: `${Math.max(Math.min(share(v.value), 100), 2)}%`,
                                                        ['--bar-delay' as string]: `${i * 30}ms`,
                                                        backgroundColor: colorOf(v.label),
                                                    }}
                                                />
                                            )}
                                        </span>
                                        <span
                                            className={cn(
                                                'w-16 shrink-0 text-right text-[11px] tabular-nums',
                                                v.label === winner.label
                                                    ? 'font-semibold text-[var(--foreground)]'
                                                    : 'text-[var(--muted-foreground)]'
                                            )}
                                        >
                                            {v.value === null ? 'n/a' : def?.format(v.value)}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )
                })}
            </div>
        </section>
    )
}

// ── head to head ────────────────────────────────────────────────────────────
/**
 * Everything else measured against the first selected model.
 *
 * Percentages are signed by *goodness*, not by arithmetic: −38% on latency
 * means "38% faster", and it points the same way as +38% on quality. Showing
 * the raw arithmetic sign here would make half the rows read backwards.
 */
export function HeadToHead({ rows, colorOf }: CompareProps) {
    if (rows.length < 2) return null
    const base = rows[0]
    const others = rows.slice(1)

    return (
        <section className="min-w-0 rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] p-4 sm:p-5">
            <h2 className="text-[13px] font-medium text-[var(--foreground)]">
                Against <span className="text-[var(--accent)]">{base.model_label}</span>
            </h2>
            <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                Right of the line is better than the baseline, left is worse.
            </p>

            <div className="mt-4 space-y-4">
                {METRIC_CARDS.map((card) => {
                    const def = METRICS[card.key]
                    const baseValue = metricValue(base as unknown as Record<string, unknown>, card.key)
                    if (baseValue === null || baseValue === 0) return null

                    const deltas = others
                        .map((row) => {
                            const v = metricValue(row as unknown as Record<string, unknown>, card.key)
                            if (v === null) return null
                            const raw = (v - baseValue) / Math.abs(baseValue)
                            // Flip so "positive" always means better.
                            return { label: row.model_label, pct: def?.higherIsBetter ? raw : -raw, value: v }
                        })
                        .filter((d): d is { label: string; pct: number; value: number } => d !== null)
                    if (deltas.length === 0) return null

                    const span = Math.max(...deltas.map((d) => Math.abs(d.pct)), 0.1)

                    return (
                        <div key={card.key} className="min-w-0">
                            <div className="flex items-baseline justify-between gap-2 text-[11px]">
                                <h3 className="font-medium text-[var(--foreground)]">{card.title}</h3>
                                <span className="tabular-nums text-[var(--muted-foreground)]">
                                    baseline {def?.format(baseValue)}
                                </span>
                            </div>

                            <ul className="mt-1.5 space-y-1">
                                {deltas.map((d, i) => {
                                    const width = (Math.abs(d.pct) / span) * 50
                                    const better = d.pct >= 0
                                    return (
                                        <li key={d.label} className="flex items-center gap-2">
                                            <span className="w-[30%] shrink-0 truncate text-[11px] text-[var(--muted-foreground)] sm:w-[24%]">
                                                {d.label}
                                            </span>
                                            <span className="relative h-3 min-w-0 flex-1">
                                                <span className="absolute inset-y-0 left-1/2 w-px bg-[var(--border)]" />
                                                <span
                                                    className="omni-bar-h absolute inset-y-0 rounded-sm"
                                                    style={{
                                                        ['--bar-size' as string]: `${Math.max(width, 1)}%`,
                                                        ['--bar-delay' as string]: `${i * 30}ms`,
                                                        [better ? 'left' : 'right']: '50%',
                                                        backgroundColor: colorOf(d.label),
                                                        opacity: better ? 1 : 0.45,
                                                    }}
                                                />
                                            </span>
                                            <span
                                                className={cn(
                                                    'w-16 shrink-0 text-right text-[11px] tabular-nums',
                                                    better ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)]'
                                                )}
                                            >
                                                {better ? '+' : '−'}
                                                {Math.abs(d.pct * 100).toFixed(0)}%
                                            </span>
                                        </li>
                                    )
                                })}
                            </ul>
                        </div>
                    )
                })}
            </div>
        </section>
    )
}

// ── per-case wins ───────────────────────────────────────────────────────────
/**
 * Which model wins which case, over the cases they all ran.
 *
 * An aggregate score hides that two models with the same average can be strong
 * on completely different things. Restricting to the shared case set is what
 * makes this fair — a model that simply ran fewer cases must not appear to win
 * the ones it skipped.
 */
export function CompareCases({ rows, colorOf }: CompareProps) {
    const { matrix, matrixLoading, loadMatrix } = useBenchmarkData()
    const [showAll, setShowAll] = useState(false)

    useEffect(() => loadMatrix(), [loadMatrix])

    const labels = useMemo(() => rows.map((r) => r.model_label), [rows])

    const cases = useMemo(() => {
        if (!matrix) return []
        const out: { caseId: string; scores: { label: string; score: number }[]; spread: number }[] = []

        for (const c of matrix.cases) {
            const scores = labels
                .map((label) => ({ label, score: matrix.cells[c.case_id]?.[label]?.score_mean ?? null }))
                .filter((s): s is { label: string; score: number } => s.score !== null)
            // Only cases every selected model actually ran.
            if (scores.length !== labels.length || labels.length === 0) continue
            const values = scores.map((s) => s.score)
            out.push({ caseId: c.case_id, scores, spread: Math.max(...values) - Math.min(...values) })
        }

        // Biggest disagreement first — a case everyone aced says nothing.
        return out.sort((a, b) => b.spread - a.spread)
    }, [matrix, labels])

    const wins = useMemo(() => {
        const tally = new Map<string, number>(labels.map((l) => [l, 0]))
        for (const c of cases) {
            const best = Math.max(...c.scores.map((s) => s.score))
            const leaders = c.scores.filter((s) => s.score === best)
            // A tie is not a win for anyone — otherwise every case where all
            // four scored 1.0 would inflate whoever happens to sort first.
            if (leaders.length === 1) tally.set(leaders[0].label, (tally.get(leaders[0].label) ?? 0) + 1)
        }
        return tally
    }, [cases, labels])

    const visible = showAll ? cases : cases.slice(0, 12)

    return (
        <section className="min-w-0 rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] p-4 sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[13px] font-medium text-[var(--foreground)]">Where they disagree</h2>
                <span className="text-[11px] text-[var(--muted-foreground)]">
                    {cases.length} shared cases · widest gap first
                </span>
            </div>

            {matrixLoading && !matrix && (
                <div className="mt-4 space-y-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <SkeletonBlock key={i} className="h-8 w-full" />
                    ))}
                </div>
            )}

            {!matrixLoading && cases.length === 0 && (
                <p className="mt-3 text-[12px] text-[var(--muted-foreground)]">
                    These models have no cases in common in the current batch.
                </p>
            )}

            {cases.length > 0 && (
                <>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                        {labels.map((label) => (
                            <span key={label} className="inline-flex items-center gap-1.5 text-[11px]">
                                <span
                                    className="h-2 w-2 rounded-full"
                                    style={{ backgroundColor: colorOf(label) }}
                                />
                                <span className="text-[var(--muted-foreground)]">{label}</span>
                                <span className="tabular-nums text-[var(--foreground)]">
                                    {wins.get(label) ?? 0} wins
                                </span>
                            </span>
                        ))}
                    </div>

                    <ul className="mt-4 space-y-2">
                        {visible.map((c) => {
                            const best = Math.max(...c.scores.map((s) => s.score))
                            return (
                                <li key={c.caseId} className="min-w-0">
                                    <div className="flex items-baseline justify-between gap-2">
                                        <span className="truncate text-[11px] text-[var(--foreground)]">
                                            {shortCaseId(c.caseId)}
                                        </span>
                                        <span className="shrink-0 text-[10px] tabular-nums text-[var(--muted-foreground)]">
                                            gap {fmtScore(c.spread, 2)}
                                        </span>
                                    </div>
                                    <div className="mt-1 flex gap-1">
                                        {c.scores.map((s, i) => (
                                            <span
                                                key={s.label}
                                                title={`${s.label}: ${fmtScore(s.score)}`}
                                                className="relative h-2.5 min-w-0 flex-1 overflow-hidden rounded-sm bg-[var(--muted)]"
                                            >
                                                <span
                                                    className="omni-bar-h absolute inset-y-0 left-0 rounded-sm"
                                                    style={{
                                                        ['--bar-size' as string]: `${Math.max(s.score * 100, 2)}%`,
                                                        ['--bar-delay' as string]: `${i * 20}ms`,
                                                        backgroundColor: colorOf(s.label),
                                                        opacity: s.score === best ? 1 : 0.5,
                                                    }}
                                                />
                                            </span>
                                        ))}
                                    </div>
                                </li>
                            )
                        })}
                    </ul>

                    {cases.length > 12 && (
                        <button
                            onClick={() => setShowAll((v) => !v)}
                            className="mt-3 text-[11px] text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
                        >
                            {showAll ? 'Show the 12 widest' : `Show all ${cases.length} cases`}
                        </button>
                    )}
                </>
            )}
        </section>
    )
}
