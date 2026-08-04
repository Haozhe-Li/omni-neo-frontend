'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import {
    METRICS,
    type LeaderboardRowWithIndex,
    metricValue,
    modelSlug,
    omniBreakdown,
    providerColor,
    providerLabel,
} from '@/lib/benchmark'
import { cn } from '@/lib/utils'

interface MetricBarCardProps {
    rows: LeaderboardRowWithIndex[]
    metric: string
    title: string
    blurb: string
    wide?: boolean
    /** Bumped by the provider on refresh so bars re-animate from zero. */
    dataVersion?: number
    /** Collapse to this many bars until the reader asks for the rest. */
    limit?: number
}

/** Bars never render at literally zero width — a real 0 must still be a bar. */
const MIN_BAR = 2.5

/**
 * One metric, every model, as a sorted bar chart.
 *
 * Drawn with DOM nodes rather than a charting library on purpose. The overview
 * shows eight of these at once, and eight canvases is a real cost on a phone —
 * plus each bar here needs to be a link (tap target, focus ring, back button),
 * which a canvas cannot give without reimplementing hit-testing. Charting
 * libraries earn their weight on the scatter and the radar, and those are the
 * two places this page still uses one.
 *
 * Bar *length* is always magnitude and bar *order* is always best-first, even
 * where those disagree: on cost, the leftmost bar is the cheapest model and
 * therefore the shortest. Sorting by goodness while sizing by value is what
 * lets one component serve "higher is better" and "lower is better" metrics
 * without ever drawing a longer bar for a worse number.
 */
export function MetricBarCard({
    rows,
    metric,
    title,
    blurb,
    wide = false,
    dataVersion = 0,
    limit = 10,
}: MetricBarCardProps) {
    const router = useRouter()
    const [expanded, setExpanded] = useState(false)
    const def = METRICS[metric]

    const { entries, missing } = useMemo(() => {
        const scored: { row: LeaderboardRowWithIndex; value: number; track: number | null }[] = []
        const absent: string[] = []

        for (const row of rows) {
            const value = metricValue(row as unknown as Record<string, unknown>, metric)
            if (value === null) {
                absent.push(row.model_label)
                continue
            }
            // Only the Omni Index carries a second bar: the raw quality behind
            // the composite. See the two-tone note in the render below.
            const track = metric === 'omni_index' ? omniBreakdown(row)?.quality ?? null : null
            scored.push({ row, value, track })
        }

        scored.sort((a, b) => (def?.higherIsBetter ? b.value - a.value : a.value - b.value))
        return { entries: scored, missing: absent }
    }, [rows, metric, def])

    const scaleMax = useMemo(
        () => Math.max(...entries.map((e) => Math.max(e.value, e.track ?? 0)), Number.EPSILON),
        [entries]
    )

    const visible = expanded ? entries : entries.slice(0, limit)
    const hidden = entries.length - visible.length

    const open = (label: string) => router.push(`/benchmark/model/${modelSlug(label)}`)
    const pct = (v: number) => Math.max((v / scaleMax) * 100, MIN_BAR)

    return (
        <section
            className={cn(
                'flex min-w-0 flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] p-4 sm:p-5',
                wide && 'sm:col-span-2 xl:col-span-3'
            )}
        >
            <header className="min-w-0">
                <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-[var(--foreground)]">
                    <span
                        className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                        style={{ backgroundColor: 'var(--accent)' }}
                    />
                    {title}
                </h2>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted-foreground)]">{blurb}</p>
            </header>

            {entries.length === 0 ? (
                <p className="mt-6 text-[12px] text-[var(--muted-foreground)]">
                    No model has {def?.label.toLowerCase() ?? metric} recorded.
                </p>
            ) : (
                <>
                    {/* ── vertical bars (sm and up) ───────────────────────────
                        Both orientations are rendered and toggled with CSS
                        rather than a width hook: no hydration mismatch, no
                        flash of the wrong layout on first paint. */}
                    <div className="mt-5 hidden sm:block">
                        <div
                            className={cn(
                                'flex items-end gap-1 sm:gap-1.5',
                                wide ? 'h-[210px]' : 'h-[180px]'
                            )}
                        >
                            {visible.map((entry, i) => {
                                const color = providerColor(entry.row.provider)
                                return (
                                    <button
                                        key={`${dataVersion}-${entry.row.model_label}`}
                                        onClick={() => open(entry.row.model_label)}
                                        title={`${entry.row.model_label} · ${def?.format(entry.value) ?? entry.value}`}
                                        className="group relative flex h-full min-w-0 flex-1 cursor-pointer flex-col justify-end rounded-t-md outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                                    >
                                        <span className="mb-1 block h-3.5 truncate text-center text-[10px] font-medium leading-none tabular-nums text-[var(--foreground)]">
                                            {def?.format(entry.value)}
                                        </span>

                                        {/* flex-1 under a fixed-height column gives this
                                            box a definite height, which is what lets the
                                            bars below size themselves as a percentage. */}
                                        <span className="relative block w-full flex-1">
                                            {/* Quality track: only the Omni Index sets
                                                this. The gap between the faint bar and
                                                the solid one IS the speed/cost drag —
                                                a single bar would hide that the index
                                                is a product of two terms. */}
                                            {entry.track !== null && (
                                                <span
                                                    className="omni-bar-v absolute bottom-0 left-0 block w-full rounded-t-md"
                                                    style={{
                                                        ['--bar-size' as string]: `${pct(entry.track)}%`,
                                                        ['--bar-delay' as string]: `${i * 26}ms`,
                                                        backgroundColor: color,
                                                        opacity: 0.22,
                                                    }}
                                                />
                                            )}
                                            <span
                                                className="omni-bar-v absolute bottom-0 left-0 block w-full rounded-t-md transition-[filter] duration-200 group-hover:brightness-110 group-active:brightness-95"
                                                style={{
                                                    ['--bar-size' as string]: `${pct(entry.value)}%`,
                                                    ['--bar-delay' as string]: `${i * 26}ms`,
                                                    backgroundColor: color,
                                                }}
                                            />
                                        </span>
                                    </button>
                                )
                            })}
                        </div>

                        {/* Angled labels, anchored under each bar's centre. The
                            row is a mirror of the bar row so columns line up at
                            any width without hard-coding a bar width. */}
                        <div className="flex gap-1 pt-1.5 sm:gap-1.5" style={{ height: 78 }}>
                            {visible.map((entry) => (
                                <div key={entry.row.model_label} className="relative min-w-0 flex-1">
                                    <span
                                        className="absolute right-1/2 top-0 h-1.5 w-1.5 translate-x-1/2 rounded-full"
                                        style={{ backgroundColor: providerColor(entry.row.provider) }}
                                    />
                                    <span
                                        className="absolute right-1/2 top-3.5 block max-w-[110px] origin-top-right -rotate-45 truncate text-[10px] leading-none text-[var(--muted-foreground)]"
                                        title={entry.row.model_label}
                                    >
                                        {entry.row.model_label}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* ── horizontal bars (below sm) ──────────────────────────
                        13 rotated labels in 320px is unreadable, so the phone
                        gets the layout that actually fits: name left, bar and
                        value right, full-width tap target. */}
                    <ul className="mt-4 space-y-1.5 sm:hidden">
                        {visible.map((entry, i) => {
                            const color = providerColor(entry.row.provider)
                            return (
                                <li key={`${dataVersion}-${entry.row.model_label}`}>
                                    <button
                                        onClick={() => open(entry.row.model_label)}
                                        className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left outline-none transition-colors active:bg-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                                    >
                                        <span
                                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                                            style={{ backgroundColor: color }}
                                        />
                                        <span className="w-[34%] shrink-0 truncate text-[11px] text-[var(--foreground)]">
                                            {entry.row.model_label}
                                        </span>
                                        <span className="relative h-3.5 min-w-0 flex-1">
                                            {entry.track !== null && (
                                                <span
                                                    className="omni-bar-h absolute inset-y-0 left-0 rounded-sm"
                                                    style={{
                                                        ['--bar-size' as string]: `${pct(entry.track)}%`,
                                                        ['--bar-delay' as string]: `${i * 22}ms`,
                                                        backgroundColor: color,
                                                        opacity: 0.22,
                                                    }}
                                                />
                                            )}
                                            <span
                                                className="omni-bar-h absolute inset-y-0 left-0 rounded-sm"
                                                style={{
                                                    ['--bar-size' as string]: `${pct(entry.value)}%`,
                                                    ['--bar-delay' as string]: `${i * 22}ms`,
                                                    backgroundColor: color,
                                                }}
                                            />
                                        </span>
                                        <span className="w-14 shrink-0 text-right text-[11px] font-medium tabular-nums text-[var(--foreground)]">
                                            {def?.format(entry.value)}
                                        </span>
                                    </button>
                                </li>
                            )
                        })}
                    </ul>

                    <footer className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-[var(--border-subtle)] pt-2.5">
                        {hidden > 0 || expanded ? (
                            <button
                                onClick={() => setExpanded((v) => !v)}
                                className="inline-flex items-center gap-1 text-[11px] text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
                            >
                                <ChevronDown
                                    className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')}
                                    strokeWidth={1.5}
                                />
                                {expanded ? 'Show top 10' : `Show all ${entries.length}`}
                            </button>
                        ) : (
                            <span />
                        )}

                        {missing.length > 0 && (
                            <span className="text-[10px] text-[var(--muted-foreground)]">
                                {missing.length} model{missing.length > 1 ? 's' : ''} without a value{' '}
                                {/* Never draw a missing price as a $0 bar — the backend
                                    writes NULL, not zero, precisely so an unpriced model
                                    can't win every cost comparison it appears in. */}
                                omitted, not counted as zero
                            </span>
                        )}
                    </footer>
                </>
            )}
        </section>
    )
}

/** Provider legend, shared by the overview and the compare page. */
export function ProviderLegend({ rows }: { rows: LeaderboardRowWithIndex[] }) {
    const providers = useMemo(() => {
        const set = new Set<string>()
        for (const r of rows) set.add(r.provider ?? 'unknown')
        return [...set].sort()
    }, [rows])

    return (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {providers.map((p) => (
                <span key={p} className="inline-flex items-center gap-1.5 text-[11px] text-[var(--muted-foreground)]">
                    <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: providerColor(p === 'unknown' ? null : p) }}
                    />
                    {providerLabel(p === 'unknown' ? null : p)}
                </span>
            ))}
        </div>
    )
}
