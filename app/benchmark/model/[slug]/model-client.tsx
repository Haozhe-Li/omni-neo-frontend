'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useBenchmarkData } from '@/components/benchmark/benchmark-provider'
import {
    ModelHeader,
    ModelNeighbours,
    ModelSpecs,
    ModelSuites,
    ModelSummary,
    OmniBreakdownCard,
    RankTiles,
} from '@/components/benchmark/model-detail'
import { ModelCases } from '@/components/benchmark/model-cases'
import { TradeoffScatter } from '@/components/benchmark/tradeoff-scatter'
import { ModelPageSkeleton } from '@/components/benchmark/skeletons'
import { findBySlug } from '@/lib/benchmark'

/**
 * Everything recorded about one model, on its own URL.
 *
 * The route exists so a bar on the overview can be a link — you can send
 * someone "here is how this model does", and the back button works. Data comes
 * from the layout's provider, so arriving here from the overview renders
 * instantly and only a cold, direct visit sees the skeleton.
 */
export function ModelClient({ slug }: { slug: string }) {
    const { models, runByModel, loading } = useBenchmarkData()
    const row = useMemo(() => findBySlug(models, slug), [models, slug])
    const run = row ? runByModel.get(row.model_label) : undefined
    const allRuns = useMemo(() => [...runByModel.values()], [runByModel])

    // The tab title is set from the client because the roster is only known
    // after the data loads — a server-rendered title would have to re-fetch
    // the leaderboard just to name the page.
    useEffect(() => {
        if (row) document.title = `${row.model_label} | Benchmarks | Omni Knows`
    }, [row])

    const [xMetric, setXMetric] = useState('cost_usd_per_case')
    const [yMetric, setYMetric] = useState('score')

    if (loading) return <ModelPageSkeleton />

    if (!row) {
        return (
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] px-6 py-14 text-center">
                <p className="text-[14px] text-[var(--foreground)]">No model matches this link.</p>
                <p className="mt-1.5 text-[12px] text-[var(--muted-foreground)]">
                    It may not have been evaluated in the selected run batch.
                </p>
                <Link
                    href="/benchmark"
                    className="mt-4 inline-block text-[12px] text-[var(--accent)] hover:underline"
                >
                    Back to all models
                </Link>
            </div>
        )
    }

    const highlight = new Set([row.model_label])

    return (
        <div className="space-y-5">
            <ModelHeader row={row} run={run} />
            <RankTiles row={row} all={models} />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="omni-rise min-w-0 space-y-4" style={{ ['--rise-delay' as string]: '120ms' }}>
                    <ModelSummary row={row} all={models} />
                    <OmniBreakdownCard row={row} />
                </div>
                <div className="omni-rise min-w-0 space-y-4" style={{ ['--rise-delay' as string]: '180ms' }}>
                    <ModelSuites run={run} allRuns={allRuns} />
                </div>
            </div>

            <div className="omni-rise" style={{ ['--rise-delay' as string]: '220ms' }}>
                <ModelCases modelLabel={row.model_label} />
            </div>

            <div className="omni-rise" style={{ ['--rise-delay' as string]: '260ms' }}>
                <ModelSpecs row={row} run={run} />
            </div>

            {/* Same trade-off chart as the overview, with everything else faded:
                the point here is not the field, it is where this one model sits
                in it. */}
            <div className="omni-rise" style={{ ['--rise-delay' as string]: '300ms' }}>
                <TradeoffScatter
                    rows={models}
                    xMetric={xMetric}
                    yMetric={yMetric}
                    onXMetricChange={setXMetric}
                    onYMetricChange={setYMetric}
                    highlight={highlight}
                    height={320}
                />
            </div>

            <ModelNeighbours row={row} all={models} />
        </div>
    )
}
