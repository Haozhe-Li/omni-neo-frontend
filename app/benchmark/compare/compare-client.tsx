'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useBenchmarkData } from '@/components/benchmark/benchmark-provider'
import { ComparePicker, MAX_COMPARE } from '@/components/benchmark/compare-picker'
import { CompareBars, CompareCases, CompareRadar, HeadToHead } from '@/components/benchmark/compare-charts'
import { TradeoffScatter } from '@/components/benchmark/tradeoff-scatter'
import { ComparePageSkeleton } from '@/components/benchmark/skeletons'
import { EmptyState } from '@/components/benchmark/page-shell'
import { findBySlug, modelSlug, seriesColor } from '@/lib/benchmark'

/**
 * Up to four models, head to head.
 *
 * The selection lives entirely in the URL (`?models=a,b,c`), so a comparison is
 * something you can send someone rather than a set of clicks you have to
 * describe. Arriving from a model page seeds it with that model already picked.
 */
export function CompareClient() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { models, runByModel, loading, refreshing } = useBenchmarkData()

    const [xMetric, setXMetric] = useState('cost_usd_per_case')
    const [yMetric, setYMetric] = useState('score')

    // URL slugs -> the labels the data actually uses, dropping anything that
    // isn't in the current batch so a stale link degrades instead of breaking.
    const selected = useMemo(() => {
        const raw = (searchParams.get('models') ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        const resolved: string[] = []
        for (const slug of raw) {
            const row = findBySlug(models, slug)
            if (row && !resolved.includes(row.model_label)) resolved.push(row.model_label)
        }
        return resolved.slice(0, MAX_COMPARE)
    }, [searchParams, models])

    const setSelected = useCallback(
        (labels: string[]) => {
            const next = new URLSearchParams(searchParams.toString())
            if (labels.length === 0) next.delete('models')
            else next.set('models', labels.map(modelSlug).join(','))
            const qs = next.toString()
            router.replace(`/benchmark/compare${qs ? `?${qs}` : ''}`, { scroll: false })
        },
        [router, searchParams]
    )

    // Nothing chosen (a bare /benchmark/compare) is a dead page — seed it with
    // the top three by Omni Index so it opens with something worth looking at.
    useEffect(() => {
        if (loading || models.length === 0 || searchParams.get('models')) return
        const top = [...models]
            .filter((m) => m.omni_index !== null)
            .sort((a, b) => (b.omni_index ?? 0) - (a.omni_index ?? 0))
            .slice(0, 3)
        setSelected((top.length > 0 ? top : models.slice(0, 3)).map((m) => m.model_label))
    }, [loading, models, searchParams, setSelected])

    const rows = useMemo(
        () =>
            selected
                .map((label) => models.find((m) => m.model_label === label))
                .filter((r): r is (typeof models)[number] => Boolean(r)),
        [selected, models]
    )

    // Stable per-selection colours: index in the *selection*, not the roster,
    // so the first chip is always the first series colour. Provider colours
    // can't do this job — two variants of one family would be identical.
    const colorOf = useCallback(
        (label: string) => seriesColor(Math.max(selected.indexOf(label), 0)),
        [selected]
    )

    const runs = useMemo(
        () => rows.map((r) => runByModel.get(r.model_label)).filter((r): r is NonNullable<typeof r> => Boolean(r)),
        [rows, runByModel]
    )

    const highlight = useMemo(() => new Set(selected), [selected])

    if (loading) return <ComparePageSkeleton />
    if (models.length === 0) return <EmptyState />

    return (
        <div className={cnOpacity(refreshing)}>
            <h1 className="text-[22px] font-semibold tracking-tight text-[var(--foreground)] sm:text-[26px]">
                Compare models
            </h1>
            <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-[var(--muted-foreground)]">
                Up to four at a time — enough to see a real difference, few enough that the shapes stay
                readable.
            </p>

            <div className="mt-5">
                <ComparePicker rows={models} selected={selected} onChange={setSelected} colorOf={colorOf} />
            </div>

            {rows.length === 0 ? (
                <p className="mt-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] px-5 py-10 text-center text-[13px] text-[var(--muted-foreground)]">
                    Pick a model to start comparing.
                </p>
            ) : (
                <div className="mt-4 space-y-4">
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <div className="omni-rise min-w-0" style={{ ['--rise-delay' as string]: '40ms' }}>
                            <CompareRadar runs={runs} colorOf={colorOf} order={selected} />
                        </div>
                        <div className="omni-rise min-w-0" style={{ ['--rise-delay' as string]: '90ms' }}>
                            <CompareBars rows={rows} colorOf={colorOf} />
                        </div>
                    </div>

                    {rows.length > 1 && (
                        <div className="omni-rise" style={{ ['--rise-delay' as string]: '140ms' }}>
                            <HeadToHead rows={rows} colorOf={colorOf} />
                        </div>
                    )}

                    <div className="omni-rise" style={{ ['--rise-delay' as string]: '190ms' }}>
                        <CompareCases rows={rows} colorOf={colorOf} />
                    </div>

                    <div className="omni-rise" style={{ ['--rise-delay' as string]: '240ms' }}>
                        <TradeoffScatter
                            rows={models}
                            xMetric={xMetric}
                            yMetric={yMetric}
                            onXMetricChange={setXMetric}
                            onYMetricChange={setYMetric}
                            highlight={highlight}
                            height={340}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}

function cnOpacity(refreshing: boolean): string {
    return `transition-opacity duration-200 ${refreshing ? 'opacity-50' : ''}`
}
