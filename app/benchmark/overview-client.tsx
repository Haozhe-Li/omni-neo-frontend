'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { GitCompare, Info } from 'lucide-react'
import { useBenchmarkData } from '@/components/benchmark/benchmark-provider'
import { MetricBarCard, ProviderLegend } from '@/components/benchmark/metric-bar-card'
import { TradeoffScatter } from '@/components/benchmark/tradeoff-scatter'
import { BatchFilter, EmptyState, PageHeading } from '@/components/benchmark/page-shell'
import { MetricGridSkeleton, ScatterSkeleton } from '@/components/benchmark/skeletons'
import {
    METRIC_CARDS,
    type EvalRun,
    fmtDate,
    benchRoutes,
} from '@/lib/benchmark'
import { cn } from '@/lib/utils'

/**
 * The overview: one bar chart per metric, then the trade-off scatter.
 *
 * There is no table here by design. A thirteen-row, twelve-column grid of
 * numbers is a data dump that makes the reader do the ranking; thirteen bars
 * sorted best-first answers "who wins this metric" before you have finished
 * reading the title. Anything the table used to carry that a bar cannot —
 * every metric for one model at once — is what the model page is for, one
 * click away on any bar.
 */
export function OverviewClient() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { models, runByModel, loading, refreshing, matrix } = useBenchmarkData()

    // Axis choice lives in the URL so a particular trade-off view is a link
    // someone can send, not a state you have to describe in words.
    const [xMetric, setXMetric] = useState(searchParams.get('x') ?? 'cost_usd_per_case')
    const [yMetric, setYMetric] = useState(searchParams.get('y') ?? 'score')
    const [touchedX, setTouchedX] = useState(Boolean(searchParams.get('x')))

    // Cost is the most useful x axis but is NULL for every model until
    // eval_pricing is populated, which would render the headline chart empty on
    // a fresh install. Fall back to latency, which is always recorded — unless
    // the reader picked an axis themselves.
    useEffect(() => {
        if (touchedX || models.length === 0) return
        setXMetric(models.some((r) => r.cost_usd_per_case !== null) ? 'cost_usd_per_case' : 'latency_ms_p50')
    }, [models, touchedX])

    const setAxis = (which: 'x' | 'y') => (key: string) => {
        if (which === 'x') {
            setTouchedX(true)
            setXMetric(key)
        } else {
            setYMetric(key)
        }
        const next = new URLSearchParams(searchParams.toString())
        next.set(which, key)
        router.replace(`${benchRoutes.overview()}?${next.toString()}`, { scroll: false })
    }

    // Bumped whenever the underlying rows change, so bars replay their grow
    // animation on a manual refresh instead of silently swapping values.
    const dataVersion = useMemo(() => Date.now(), [models])

    const showSkeleton = loading || (refreshing && models.length === 0)

    if (showSkeleton) {
        return (
            <div className="space-y-4">
                <MetricGridSkeleton />
                <ScatterSkeleton />
            </div>
        )
    }

    if (models.length === 0) return <EmptyState />

    // Deliberately parameterless: the compare page restores whatever you had
    // selected last, and naming models here would override that on every visit.
    const compareHref = benchRoutes.compare()

    return (
        <div className={cn('transition-opacity duration-200', refreshing && 'opacity-50')}>
            <PageHeading
                title="Benchmarks"
                description="How each model behaves in Omni's pro mode — skill triggering, output contracts, answer quality, and what it costs to get there."
                aside={<BatchFilter />}
            />

            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <ProviderLegend rows={models} />
                <Link
                    href={compareHref}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/[0.06] px-3 py-1.5 text-[12px] font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/[0.12]"
                >
                    <GitCompare className="h-3.5 w-3.5" strokeWidth={1.75} />
                    Compare models
                </Link>
            </div>

            <p className="mb-4 text-[11px] text-[var(--muted-foreground)]">
                Every bar is a link — tap one to open that model.
            </p>

            <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {METRIC_CARDS.map((card, i) => (
                        <div
                            key={card.key}
                            className={cn('omni-rise min-w-0', card.wide && 'sm:col-span-2 xl:col-span-3')}
                            style={{ ['--rise-delay' as string]: `${Math.min(i * 45, 320)}ms` }}
                        >
                            <MetricBarCard
                                rows={models}
                                metric={card.key}
                                title={card.title}
                                blurb={card.blurb}
                                wide={card.wide}
                                dataVersion={dataVersion}
                                limit={card.wide ? 13 : 10}
                            />
                        </div>
                    ))}
                </div>

                <div className="omni-rise" style={{ ['--rise-delay' as string]: '360ms' }}>
                    <TradeoffScatter
                        rows={models}
                        xMetric={xMetric}
                        yMetric={yMetric}
                        onXMetricChange={setAxis('x')}
                        onYMetricChange={setAxis('y')}
                    />
                </div>

                <RunConditions runs={[...runByModel.values()]} caseCount={matrix?.cases.length ?? null} />
            </div>
        </div>
    )
}

/**
 * Provenance for the whole page.
 *
 * A score only means something alongside the conditions that produced it, and
 * two of these change the number materially: `tool_cache` off means search luck
 * moves the result, and a different `prompt_sha` means the models were not
 * given the same instructions. Surfacing them stops a cross-batch comparison
 * being read as a model difference.
 */
function RunConditions({ runs, caseCount }: { runs: EvalRun[]; caseCount: number | null }) {
    if (runs.length === 0) return null

    const promptShas = new Set(runs.map((r) => r.prompt_sha ?? '—'))
    const cacheModes = new Set(runs.map((r) => r.tool_cache))
    const judges = new Set(runs.map((r) => r.judge_model ?? 'none'))
    const latest = runs.reduce((a, b) => (new Date(a.started_at) > new Date(b.started_at) ? a : b))

    const warnPrompt = promptShas.size > 1
    const warnCache = cacheModes.size > 1

    return (
        <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3.5 sm:px-5">
            <div className="flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 text-[var(--muted-foreground)]" strokeWidth={1.5} />
                <h2 className="text-[13px] font-medium text-[var(--foreground)]">Run conditions</h2>
            </div>
            <dl className="mt-2.5 grid grid-cols-2 gap-x-6 gap-y-2 text-[11px] sm:grid-cols-4">
                <Fact k="latest run" v={fmtDate(latest.started_at)} />
                <Fact k="judge" v={[...judges].join(', ').replace('openai:', '')} />
                <Fact
                    k="tool cache"
                    v={warnCache ? 'mixed' : cacheModes.has(true) ? 'on' : 'off'}
                    warn={warnCache}
                />
                <Fact
                    k="prompt"
                    v={warnPrompt ? `${promptShas.size} versions` : [...promptShas][0]?.slice(0, 7) ?? '—'}
                    warn={warnPrompt}
                />
                {caseCount !== null && <Fact k="cases" v={String(caseCount)} />}
            </dl>
            {warnPrompt && (
                <p className="mt-2 text-[10px] leading-relaxed text-[var(--warning)]">
                    These runs used different system prompts — differences here aren&apos;t purely the
                    models.
                </p>
            )}
            {warnCache && (
                <p className="mt-1 text-[10px] leading-relaxed text-[var(--warning)]">
                    Mixed tool-cache settings: uncached runs saw different search results, so part of any
                    gap is search luck.
                </p>
            )}
        </section>
    )
}

function Fact({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
    return (
        <div className="min-w-0">
            <dt className="text-[var(--muted-foreground)]">{k}</dt>
            <dd
                className={cn(
                    'truncate tabular-nums',
                    warn ? 'text-[var(--warning)]' : 'text-[var(--foreground)]'
                )}
            >
                {v}
            </dd>
        </div>
    )
}
