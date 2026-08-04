'use client'

import Link from 'next/link'
import { GitCompare } from 'lucide-react'
import { useBenchmarkData } from '@/components/benchmark/benchmark-provider'
import { MetricDistribution, MetricRanking } from '@/components/benchmark/metric-ranking'
import { MetricExplainer, MetricSwitcher } from '@/components/benchmark/metric-switcher'
import { BatchFilter, EmptyState, PageHeading } from '@/components/benchmark/page-shell'
import { MetricPageSkeleton } from '@/components/benchmark/skeletons'
import { METRICS, benchRoutes, metricCardBySlug } from '@/lib/benchmark'
import { cn } from '@/lib/utils'

/**
 * One metric, the whole roster, and what the metric actually means.
 *
 * The overview's cards are a top ten each — enough to see who is winning, not
 * enough to look something up, and with no room to explain what the number is.
 * This is where a metric gets its own address: the full ranking, the shape of
 * the field, and the definition that the overview can only gesture at.
 */
export function MetricClient({ slug }: { slug: string }) {
    const { models, loading, refreshing } = useBenchmarkData()
    const card = metricCardBySlug(slug)

    if (!card) {
        return (
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] px-6 py-14 text-center">
                <p className="text-[14px] text-[var(--foreground)]">No such metric.</p>
                <Link
                    href={benchRoutes.overview()}
                    className="mt-4 inline-block text-[12px] text-[var(--accent)] hover:underline"
                >
                    Back to all models
                </Link>
            </div>
        )
    }

    if (loading) return <MetricPageSkeleton />
    if (models.length === 0) return <EmptyState />

    const def = METRICS[card.key]

    return (
        <div className={cn('transition-opacity duration-200', refreshing && 'opacity-50')}>
            <PageHeading
                title={card.title}
                description={card.doc.what}
                aside={<BatchFilter />}
            />

            <div className="mb-5">
                <MetricSwitcher active={card.key} />
            </div>

            <div className="space-y-4">
                <div className="omni-rise" style={{ ['--rise-delay' as string]: '0ms' }}>
                    <MetricDistribution card={card} rows={models} />
                </div>

                <div className="omni-rise" style={{ ['--rise-delay' as string]: '60ms' }}>
                    <MetricRanking card={card} rows={models} />
                </div>

                <div className="omni-rise" style={{ ['--rise-delay' as string]: '120ms' }}>
                    <MetricExplainer card={card} />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <p className="text-[11px] text-[var(--muted-foreground)]">
                        {def?.higherIsBetter
                            ? 'Ranked highest first.'
                            : 'Ranked lowest first — lower is better here.'}{' '}
                        Every row opens that model.
                    </p>
                    <Link
                        href={benchRoutes.compare()}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/[0.06] px-3 py-1.5 text-[12px] font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/[0.12]"
                    >
                        <GitCompare className="h-3.5 w-3.5" strokeWidth={1.75} />
                        Compare models
                    </Link>
                </div>
            </div>
        </div>
    )
}
