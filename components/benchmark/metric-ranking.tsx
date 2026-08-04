'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import {
    METRICS,
    type LeaderboardRowWithIndex,
    type MetricCardDef,
    barPercent,
    barScale,
    benchRoutes,
    median,
    metricValue,
    providerColor,
    providerLabel,
} from '@/lib/benchmark'
import { cn } from '@/lib/utils'

/**
 * Every model on one metric, ranked.
 *
 * Horizontal rows rather than the overview's columns. The overview shows a top
 * ten in a card a third of the page wide, where columns fit; this shows the
 * whole roster, and at eighteen entries a column chart has to rotate its labels
 * to 45 degrees and still collides. Rows read left to right at any count, keep
 * the model name as ordinary horizontal text, and drop onto a phone unchanged.
 */
export function MetricRanking({
    card,
    rows,
}: {
    card: MetricCardDef
    rows: LeaderboardRowWithIndex[]
}) {
    const def = METRICS[card.key]

    const { ranked, missing } = useMemo(() => {
        const scored: { row: LeaderboardRowWithIndex; value: number }[] = []
        const absent: LeaderboardRowWithIndex[] = []

        for (const row of rows) {
            const value = metricValue(row as unknown as Record<string, unknown>, card.key)
            if (value === null) absent.push(row)
            else scored.push({ row, value })
        }
        scored.sort((a, b) => (def?.higherIsBetter ? b.value - a.value : a.value - b.value))
        return { ranked: scored, missing: absent }
    }, [rows, card.key, def])

    const scale = useMemo(() => barScale(ranked.map((r) => r.value)), [ranked])

    if (ranked.length === 0) {
        return (
            <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] px-5 py-12 text-center">
                <p className="text-[13px] text-[var(--foreground)]">
                    No model has {card.title.toLowerCase()} recorded.
                </p>
            </section>
        )
    }

    return (
        <section className="min-w-0 overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)]">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border-subtle)] px-4 py-3 sm:px-5">
                <h2 className="text-[13px] font-medium text-[var(--foreground)]">
                    All {ranked.length} models by {card.title.toLowerCase()}
                </h2>
                {scale.truncated && (
                    <span className="text-[10px] text-[var(--muted-foreground)]">
                        {/* Same rule as the overview: a magnified axis is
                            legitimate, a silent one is not. */}
                        bars start at {def?.format(scale.floor)} — these models are close
                    </span>
                )}
            </div>

            <ol className="divide-y divide-[var(--border-subtle)]">
                {ranked.map(({ row, value }, i) => (
                    <li key={row.model_label}>
                        <Link
                            href={benchRoutes.model(row.model_label)}
                            className="group flex items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-[var(--muted)]/50 sm:gap-3 sm:px-5"
                        >
                            <span className="w-6 shrink-0 text-right text-[11px] tabular-nums text-[var(--muted-foreground)]">
                                {i + 1}
                            </span>

                            <span className="flex w-[38%] min-w-0 shrink-0 items-center gap-2 sm:w-[24%]">
                                <span
                                    className="h-2 w-2 shrink-0 rounded-full"
                                    style={{ backgroundColor: providerColor(row.provider) }}
                                />
                                <span className="min-w-0">
                                    <span className="block truncate text-[12px] text-[var(--foreground)] sm:text-[13px]">
                                        {row.model_label}
                                    </span>
                                    <span className="block truncate text-[10px] text-[var(--muted-foreground)]">
                                        {providerLabel(row.provider)}
                                        {row.reasoning_effort ? ` · ${row.reasoning_effort}` : ''}
                                    </span>
                                </span>
                            </span>

                            <span
                                className={cn(
                                    'relative hidden h-4 min-w-0 flex-1 rounded-sm sm:block',
                                    // A track only when the baseline is fitted: it makes a
                                    // bar that does not start at zero visibly not start at
                                    // zero, which is the whole caveat in one shape.
                                    scale.truncated && 'bg-[var(--muted)]'
                                )}
                            >
                                <span
                                    className="omni-bar-h absolute inset-y-0 left-0 rounded-sm"
                                    style={{
                                        ['--bar-size' as string]: `${barPercent(value, scale)}%`,
                                        ['--bar-delay' as string]: `${Math.min(i * 18, 400)}ms`,
                                        backgroundColor: providerColor(row.provider),
                                    }}
                                />
                            </span>

                            {/* Context values: the two or three numbers that explain
                                the ranking, not every column the row carries. */}
                            <span className="hidden shrink-0 gap-4 lg:flex">
                                {card.context.map((key) => (
                                    <span key={key} className="w-20 text-right">
                                        <span className="block text-[9px] uppercase tracking-wide text-[var(--muted-foreground)]">
                                            {METRICS[key]?.label ?? key}
                                        </span>
                                        <span className="block text-[11px] tabular-nums text-[var(--foreground)]">
                                            {METRICS[key]?.format(
                                                metricValue(row as unknown as Record<string, unknown>, key)
                                            ) ?? '—'}
                                        </span>
                                    </span>
                                ))}
                            </span>

                            <span className="ml-auto w-16 shrink-0 text-right text-[13px] font-semibold tabular-nums text-[var(--foreground)] sm:w-20">
                                {def?.format(value)}
                            </span>

                            <ChevronRight
                                className="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)] opacity-0 transition-opacity group-hover:opacity-100"
                                strokeWidth={1.5}
                            />
                        </Link>
                    </li>
                ))}
            </ol>

            {missing.length > 0 && (
                <div className="border-t border-[var(--border-subtle)] px-4 py-3 sm:px-5">
                    <p className="text-[11px] leading-relaxed text-[var(--muted-foreground)]">
                        {/* Absent, not last: the backend writes NULL rather than zero so
                            an unmeasured model can't win the ranking by default. */}
                        Not ranked — no {card.title.toLowerCase()} recorded:{' '}
                        {missing.map((m, i) => (
                            <span key={m.model_label}>
                                {i > 0 && ', '}
                                <Link
                                    href={benchRoutes.model(m.model_label)}
                                    className="text-[var(--foreground)] hover:underline"
                                >
                                    {m.model_label}
                                </Link>
                            </span>
                        ))}
                        . These are left out rather than counted as zero.
                    </p>
                </div>
            )}
        </section>
    )
}

/**
 * The shape of the field, above the ranking.
 *
 * A ranked list answers "who is ahead" but not "by enough to matter". These
 * four numbers do — and they are what makes a fitted baseline legible rather
 * than alarming, since the spread is stated in the same breath.
 */
export function MetricDistribution({
    card,
    rows,
}: {
    card: MetricCardDef
    rows: LeaderboardRowWithIndex[]
}) {
    const def = METRICS[card.key]

    const stats = useMemo(() => {
        const values = rows
            .map((r) => metricValue(r as unknown as Record<string, unknown>, card.key))
            .filter((v): v is number => v !== null)
        if (values.length === 0) return null

        const hi = Math.max(...values)
        const lo = Math.min(...values)
        return {
            best: def?.higherIsBetter ? hi : lo,
            worst: def?.higherIsBetter ? lo : hi,
            mid: median(values),
            spread: hi === 0 ? null : (hi - lo) / hi,
            n: values.length,
        }
    }, [rows, card.key, def])

    if (!stats) return null

    return (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
                { k: 'Best', v: def?.format(stats.best) },
                { k: 'Median', v: def?.format(stats.mid) },
                { k: 'Worst', v: def?.format(stats.worst) },
                {
                    k: 'Spread',
                    v: stats.spread === null ? '—' : `${Math.round(stats.spread * 100)}%`,
                    hint:
                        stats.spread !== null && stats.spread < 0.4
                            ? 'models are close here'
                            : 'a wide field',
                },
            ].map((s) => (
                <div
                    key={s.k}
                    className="min-w-0 rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-3.5 py-3"
                >
                    <dt className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
                        {s.k}
                    </dt>
                    <dd className="mt-1 truncate text-[17px] font-semibold tabular-nums text-[var(--foreground)]">
                        {s.v}
                    </dd>
                    {s.hint && (
                        <dd className="mt-0.5 truncate text-[10px] text-[var(--muted-foreground)]">
                            {s.hint}
                        </dd>
                    )}
                </div>
            ))}
        </dl>
    )
}
