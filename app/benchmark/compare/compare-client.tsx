'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useBenchmarkData } from '@/components/benchmark/benchmark-provider'
import { ComparePicker, MAX_COMPARE } from '@/components/benchmark/compare-picker'
import { CompareBars, CompareCases, CompareRadar, HeadToHead } from '@/components/benchmark/compare-charts'
import { TradeoffScatter } from '@/components/benchmark/tradeoff-scatter'
import { ComparePageSkeleton } from '@/components/benchmark/skeletons'
import { EmptyState, PageHeading } from '@/components/benchmark/page-shell'
import { BENCH_BASE, findBySlug, modelSlug, seriesColor } from '@/lib/benchmark'

/** Where the reader's own selection is remembered between visits. */
const STORAGE_KEY = 'omni-bench:compare:v1'

/**
 * The saved selection, or null when nothing was ever saved.
 *
 * `null` and `[]` mean different things and the difference is the whole point:
 * an empty array is the record of someone who cleared the page deliberately and
 * must survive a reload, while null is a first-time visitor who should be given
 * something to look at.
 */
function readSaved(): string[] | null {
    if (typeof window === 'undefined') return null
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (raw === null) return null
        const parsed: unknown = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : null
    } catch {
        // Unparseable, or storage is unavailable (private mode, blocked
        // cookies). Not worth failing the page over — fall back to seeding.
        return null
    }
}

function writeSaved(slugs: string[]) {
    if (typeof window === 'undefined') return
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(slugs))
    } catch {
        /* storage unavailable or full — the URL still holds the selection */
    }
}

/**
 * Up to four models, head to head.
 *
 * The selection lives in the URL (`?models=a,b,c`), so a comparison is
 * something you can send someone rather than a set of clicks you have to
 * describe, and it is mirrored to localStorage so your own selection is still
 * there next visit. Arriving from a model page seeds it with that model.
 *
 * An empty selection is a real state, not an error: `?models=` (the key
 * present, the value empty) is how "cleared on purpose" is told apart from
 * "arrived with no parameters at all". Only the second one gets seeded — which
 * is what stops clearing the last chip from immediately refilling the page.
 */
export function CompareClient() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { models, runByModel, loading, refreshing } = useBenchmarkData()

    const [xMetric, setXMetric] = useState('cost_usd_per_case')
    const [yMetric, setYMetric] = useState('score')

    // Whether the URL states a selection at all. `has` rather than a truthiness
    // check on the value: `?models=` is present and empty, and must not be
    // mistaken for absent.
    const explicit = searchParams.has('models')

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
            const slugs = labels.map(modelSlug)
            writeSaved(slugs)
            const next = new URLSearchParams(searchParams.toString())
            // Always write the key, even for an empty selection.
            next.set('models', slugs.join(','))
            router.replace(`${BENCH_BASE}/compare?${next.toString()}`, { scroll: false })
        },
        [router, searchParams]
    )

    // Restore or seed, once. A ref rather than a dependency check because this
    // must not re-run when `models` changes — switching run batches rebuilds
    // that array, and re-seeding there would overwrite the reader's selection
    // (including an intentionally empty one) behind their back.
    const settled = useRef(false)
    useEffect(() => {
        if (settled.current || explicit || loading || models.length === 0) return
        settled.current = true

        const saved = readSaved()
        if (saved !== null) {
            const labels = saved
                .map((slug) => findBySlug(models, slug)?.model_label)
                .filter((l): l is string => Boolean(l))
            setSelected(labels)
            return
        }

        // First visit: a bare /benchmark/compare with nothing chosen is a dead
        // page, so open with the top three by Omni Index.
        const top = [...models]
            .filter((m) => m.omni_index !== null)
            .sort((a, b) => (b.omni_index ?? 0) - (a.omni_index ?? 0))
            .slice(0, 3)
        setSelected((top.length > 0 ? top : models.slice(0, 3)).map((m) => m.model_label))
    }, [explicit, loading, models, setSelected])

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
            <PageHeading
                title="Compare models"
                description="Up to four at a time — enough to see a real difference, few enough that the shapes stay readable."
            />

            <ComparePicker rows={models} selected={selected} onChange={setSelected} colorOf={colorOf} />

            {rows.length === 0 ? (
                // An empty board is a state the reader chose, so it reads as
                // waiting rather than broken — and nothing here refills it.
                <div className="mt-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] px-5 py-12 text-center">
                    <p className="text-[13px] text-[var(--foreground)]">Nothing selected.</p>
                    <p className="mx-auto mt-1.5 max-w-sm text-[12px] leading-relaxed text-[var(--muted-foreground)]">
                        Use <span className="text-[var(--foreground)]">Add model</span> above to pick up
                        to {MAX_COMPARE}. Your selection is remembered on this device.
                    </p>
                </div>
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
