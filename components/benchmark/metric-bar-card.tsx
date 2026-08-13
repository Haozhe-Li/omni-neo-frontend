'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUpRight } from 'lucide-react'
import {
    METRICS,
    type LeaderboardRowWithIndex,
    barPercent,
    barScale,
    benchRoutes,
    metricValue,
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

    const visible = entries.slice(0, limit)
    const hidden = entries.length - visible.length

    /** The baseline is fitted to what is actually drawn, not the full roster. */
    const scale = useMemo(
        () => barScale(visible.flatMap((e) => [e.value, ...(e.track === null ? [] : [e.track])])),
        [visible]
    )

    /**
     * Two destinations from one card: a bar opens that model, anywhere else
     * opens the metric's own page. Bars stop propagation rather than the card
     * checking what was hit, so the more specific target wins by construction.
     */
    const openModel = (label: string) => router.push(benchRoutes.model(label))
    const openMetric = () => router.push(benchRoutes.metric(metric))
    const pct = (v: number) => barPercent(v, scale, MIN_BAR)

    return (
        <section
            onClick={openMetric}
            role="link"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault()
                    openMetric()
                }
            }}
            aria-label={`${title} — see all models`}
            className={cn(
                'group/card flex h-full min-w-0 cursor-pointer flex-col overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] p-4 transition-colors sm:p-5',
                'hover:border-[var(--accent)]/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
                wide && 'sm:col-span-2 xl:col-span-3'
            )}
        >
            <header className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-[var(--foreground)]">
                        <span
                            className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                            style={{ backgroundColor: 'var(--accent)' }}
                        />
                        {title}
                    </h2>
                    <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted-foreground)]">
                        {blurb}
                    </p>
                </div>
                {/* Standing hint that the card itself goes somewhere — without
                    it, the only clickable-looking things here are the bars, and
                    those go somewhere else. */}
                <ArrowUpRight
                    className="h-4 w-4 shrink-0 text-[var(--muted-foreground)] transition-colors group-hover/card:text-[var(--accent)]"
                    strokeWidth={1.5}
                />
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
                        flash of the wrong layout on first paint.

                        `pl-10` reserves room the first column doesn't
                        otherwise have: every rotated label's tail swings
                        down-and-left of its anchor (see the label comment
                        below), borrowing space from the column to its left —
                        the leftmost bar has no such neighbour, so without
                        this its label's first few characters get clipped by
                        the card's `overflow-hidden` instead of just being
                        unreadable. Sized to the longest label actually in the
                        catalog today (`gpt-oss-120b-low-groq`, ~80px wide at
                        its rotated max-width) plus a margin, not to the
                        shorter common case. */}
                    <div className="mt-5 hidden pl-10 sm:block">
                        <div
                            className={cn(
                                'flex items-end gap-1.5',
                                wide ? 'h-[210px]' : 'h-[180px]'
                            )}
                        >
                            {visible.map((entry, i) => {
                                const color = providerColor(entry.row.provider)
                                return (
                                    <button
                                        key={`${dataVersion}-${entry.row.model_label}`}
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            openModel(entry.row.model_label)
                                        }}
                                        title={`${entry.row.model_label} · ${def?.format(entry.value) ?? entry.value}`}
                                        className="group relative flex h-full min-w-0 flex-1 cursor-pointer flex-col items-center justify-end rounded-t outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                                    >
                                        <span className="mb-1 block h-3.5 w-full truncate text-center text-[10px] font-medium leading-none tabular-nums text-[var(--foreground)]">
                                            {def?.format(entry.value)}
                                        </span>

                                        {/* Capped width, centred: a column that fills its
                                            whole slot runs into its neighbours and the row
                                            reads as one mass instead of n bars. */}
                                        <span
                                            className="relative block w-full flex-1"
                                            style={{ maxWidth: 'var(--bench-bar-max)' }}
                                        >
                                            {/* Quality track: only the Omni Index sets
                                                this. The gap between the faint bar and
                                                the solid one IS the speed/cost drag —
                                                a single bar would hide that the index
                                                is a product of two terms. */}
                                            {entry.track !== null && (
                                                <span
                                                    className="omni-bar-v absolute bottom-0 left-0 block w-full rounded-t"
                                                    style={{
                                                        ['--bar-size' as string]: `${pct(entry.track)}%`,
                                                        ['--bar-delay' as string]: `${i * 26}ms`,
                                                        backgroundColor: color,
                                                        opacity: 0.22,
                                                    }}
                                                />
                                            )}
                                            <span
                                                className="omni-bar-v absolute bottom-0 left-0 block w-full rounded-t transition-[filter] duration-200 group-hover:brightness-110 group-active:brightness-95"
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

                        {/* The conventional break mark for a magnified axis, on
                            the chart itself so the caveat survives a screenshot
                            of it — a footnote alone would not. */}
                        {scale.truncated && (
                            <div className="flex items-center gap-2 pt-1">
                                <span className="omni-axis-break h-1.5 flex-1 opacity-70" />
                                <span className="shrink-0 text-[9px] tabular-nums text-[var(--muted-foreground)]">
                                    from {def?.format(scale.floor)}
                                </span>
                            </div>
                        )}

                        {/* Angled labels, anchored under each bar's centre. The
                            row mirrors the bar row so columns line up at any
                            width without hard-coding a bar width.

                            The container height below is not a round number —
                            it's sized to the actual geometry of a rotated
                            label. A -45° label of width W and line-height H,
                            rotated around its own top-right corner, reaches
                            0.707·(W+H) below its anchor. At the label's own
                            max-width (104px) that's ~97px, plus the anchor's
                            14px drop from the row's top edge; the height here
                            gives that a real margin instead of the label tip
                            landing right at (or past) the card's edge. Get
                            this wrong and it doesn't fail the same way for
                            every card — cards with names close to the
                            truncation width clip further than cards with
                            short names, so the deck reads as "inconsistently
                            sized" when the actual bug is one row overflowing
                            by a different amount than its neighbours. */}
                        <div className="flex gap-1.5 pt-1.5" style={{ height: 116 }}>
                            {visible.map((entry) => (
                                <div key={entry.row.model_label} className="relative min-w-0 flex-1">
                                    <span
                                        className="absolute right-1/2 top-0 h-1.5 w-1.5 translate-x-1/2 rounded-full"
                                        style={{ backgroundColor: providerColor(entry.row.provider) }}
                                    />
                                    <span
                                        className="absolute right-1/2 top-3.5 block max-w-[104px] origin-top-right -rotate-45 truncate text-[10px] leading-none text-[var(--muted-foreground)]"
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
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            openModel(entry.row.model_label)
                                        }}
                                        className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left outline-none transition-colors active:bg-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                                    >
                                        <span
                                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                                            style={{ backgroundColor: color }}
                                        />
                                        <span className="w-[34%] shrink-0 truncate text-[11px] text-[var(--foreground)]">
                                            {entry.row.model_label}
                                        </span>
                                        <span
                                            className={cn(
                                                'relative h-3.5 min-w-0 flex-1 rounded-sm',
                                                // The track makes the fitted baseline
                                                // visible on mobile, where there is no
                                                // room for a break mark: a bar that
                                                // starts short of the rail is obviously
                                                // not starting at zero.
                                                scale.truncated && 'bg-[var(--muted)]'
                                            )}
                                        >
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
                        {/* Was an in-place expand. The metric's own page shows the
                            same full list with the definition and the other
                            metrics beside it, so expanding here would only be a
                            worse version of somewhere the card already goes. */}
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--accent)]">
                            {hidden > 0 ? `All ${entries.length} models` : 'About this metric'}
                            <ArrowUpRight className="h-3 w-3" strokeWidth={1.75} />
                        </span>

                        <span className="text-[10px] text-[var(--muted-foreground)]">
                            {/* Say it in words as well as with the break mark. A
                                magnified axis is legitimate; a silent one is not. */}
                            {scale.truncated && (
                                <>
                                    Axis starts at {def?.format(scale.floor)} — these models are
                                    close, so bar length shows the gap, not the value.
                                </>
                            )}
                            {scale.truncated && missing.length > 0 && ' · '}
                            {missing.length > 0 && (
                                <>
                                    {/* Never draw a missing price as a $0 bar — the backend
                                        writes NULL, not zero, precisely so an unpriced model
                                        can't win every cost comparison it appears in. */}
                                    {missing.length} model{missing.length > 1 ? 's' : ''} without a
                                    value omitted, not counted as zero
                                </>
                            )}
                        </span>
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
