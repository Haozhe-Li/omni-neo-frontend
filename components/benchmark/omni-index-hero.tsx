'use client'

import { useMemo } from 'react'
import { Sparkles, Trophy } from 'lucide-react'
import {
    OMNI_QUALITY_FLOOR,
    type LeaderboardRowWithIndex,
    fmtCost,
    fmtMs,
    fmtScore,
    omniBreakdown,
    providerColor,
    providerLabel,
} from '@/lib/benchmark'
import { cn } from '@/lib/utils'

interface OmniIndexHeroProps {
    rows: LeaderboardRowWithIndex[]
    selected: Set<string>
    onSelectModel: (model: string) => void
}

/**
 * The page's headline banner — Omni's own composite ranking, not a metric
 * borrowed from the raw leaderboard table below it.
 *
 * Deliberately louder than every other card on this page (accent border +
 * tinted background, biggest number on screen): everything else here is a
 * standard eval-dashboard metric any benchmark site has, but folding quality,
 * latency and cost into one weighted number — quality-first, cost weighted
 * above latency — is Omni's own call on how to pick a model, so it gets the
 * one spot on the page that reads as "ours" rather than "a chart".
 *
 * Each row is a two-tone bar rather than a single fill, because the index is a
 * product of two terms and a single bar hides that: the faint track is raw
 * quality, the solid fill is what survives the speed/cost multiplier, so the
 * visible gap between them IS the efficiency drag. That turns "why is this
 * model below that one" into something readable off the chart instead of
 * something you take on faith from a composite number.
 */
export function OmniIndexHero({ rows, selected, onSelectModel }: OmniIndexHeroProps) {
    const ranked = useMemo(() => {
        return rows
            .filter((r) => selected.has(r.model_label) && r.omni_index !== null)
            .map((r) => ({ row: r, parts: omniBreakdown(r) }))
            .filter((r): r is { row: LeaderboardRowWithIndex; parts: NonNullable<ReturnType<typeof omniBreakdown>> } =>
                r.parts !== null
            )
            .sort((a, b) => b.parts.index - a.parts.index)
            .slice(0, 10)
    }, [rows, selected])

    const leader = ranked[0] ?? null
    // Bars are scaled against the largest quality on screen, not the largest
    // index: the quality track is the longer of the two, so scaling by index
    // would push every track past 100% and clip the drag this chart exists to
    // show.
    const scaleMax = useMemo(
        () => Math.max(...ranked.map((r) => r.parts.quality), 0.0001),
        [ranked]
    )
    const unpriced = rows.filter((r) => selected.has(r.model_label) && r.omni_index === null).length

    return (
        <div className="relative mb-6 overflow-hidden rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/[0.05]">
            <div
                className="pointer-events-none absolute inset-0 opacity-60"
                style={{
                    background:
                        'radial-gradient(600px 260px at 15% 0%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 70%)',
                }}
            />
            <div className="relative px-5 py-4 sm:px-6 sm:py-5">
                <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
                    <div>
                        <div className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--accent)]">
                            <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
                            Omni Index
                        </div>
                        <p className="mt-1 text-[12px] leading-relaxed text-[var(--muted-foreground)] max-w-lg">
                            Our composite ranking — quality first, with speed and cost as a
                            tiebreaker. Being fast or cheap can only move a model&apos;s score by up
                            to {Math.round((1 - OMNI_QUALITY_FLOOR) * 100)}%; it can never out-rank a
                            model that is meaningfully more accurate.
                        </p>
                    </div>

                    {leader && (
                        <div className="shrink-0">
                            <div className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
                                Leader
                            </div>
                            <div className="mt-0.5 text-[34px] font-semibold tabular-nums leading-none text-[var(--accent)]">
                                {fmtScore(leader.parts.index)}
                            </div>
                            <div className="mt-1.5 flex items-center gap-1.5">
                                <span
                                    className="h-1.5 w-1.5 rounded-full"
                                    style={{ backgroundColor: providerColor(leader.row.provider) }}
                                />
                                <span className="text-[12px] font-medium text-[var(--foreground)]">
                                    {leader.row.model_label}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {ranked.length > 0 && (
                    <div className="mt-5 space-y-px">
                        {ranked.map(({ row, parts }, i) => {
                            const color = providerColor(row.provider)
                            const trackPct = (parts.quality / scaleMax) * 100
                            const fillPct = (parts.index / scaleMax) * 100
                            return (
                                <button
                                    key={row.run_id}
                                    onClick={() => onSelectModel(row.model_label)}
                                    title={
                                        `quality ${fmtScore(parts.quality)}` +
                                        ` · ${fmtMs(row.latency_ms_p50)} · ${fmtCost(row.cost_usd_per_case)}/case` +
                                        ` → index ${fmtScore(parts.index)}`
                                    }
                                    className="group flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-[var(--accent)]/8 sm:gap-3"
                                >
                                    <span className="flex w-4 shrink-0 justify-center text-[11px] tabular-nums text-[var(--muted-foreground)]">
                                        {i === 0 ? (
                                            <Trophy
                                                className="h-3.5 w-3.5 text-[var(--accent)]"
                                                strokeWidth={1.75}
                                            />
                                        ) : (
                                            i + 1
                                        )}
                                    </span>

                                    <span className="flex min-w-0 flex-1 items-center gap-2 sm:w-52 sm:flex-none">
                                        <span
                                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                                            style={{ backgroundColor: color }}
                                        />
                                        <span className="truncate text-[12px] text-[var(--foreground)]">
                                            {row.model_label}
                                        </span>
                                        <span className="hidden shrink-0 text-[10px] text-[var(--muted-foreground)] lg:inline">
                                            {providerLabel(row.provider)}
                                        </span>
                                    </span>

                                    {/* Bar: faint track = raw quality, solid = index after the
                                        efficiency multiplier. Hidden on the narrowest screens,
                                        where there is no width left to read a length difference. */}
                                    <span className="relative hidden h-2.5 flex-1 sm:block">
                                        <span
                                            className="absolute inset-y-0 left-0 rounded-full transition-all"
                                            style={{
                                                width: `${trackPct}%`,
                                                backgroundColor: color,
                                                opacity: 0.22,
                                            }}
                                        />
                                        <span
                                            className={cn(
                                                'absolute inset-y-0 left-0 rounded-full transition-all',
                                                i === 0 && 'shadow-sm'
                                            )}
                                            style={{
                                                width: `${fillPct}%`,
                                                backgroundColor: color,
                                                opacity: i === 0 ? 1 : 0.78,
                                            }}
                                        />
                                    </span>

                                    <span className="w-12 shrink-0 text-right text-[13px] font-semibold tabular-nums text-[var(--foreground)]">
                                        {fmtScore(parts.index)}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                )}

                {ranked.length > 0 && (
                    <div
                        className={cn(
                            'mt-3 flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--accent)]/15 pt-2.5 text-[10px] text-[var(--muted-foreground)]',
                            // Both swatches are sm+ only, so with nothing else to
                            // say this row would render as a bare rule on mobile.
                            unpriced > 0 ? 'flex' : 'hidden sm:flex'
                        )}
                    >
                        {/* Only meaningful next to the bars, which are sm+ only. */}
                        <span className="hidden items-center gap-1.5 sm:inline-flex">
                            <span className="h-2 w-3 rounded-full bg-[var(--accent)]" />
                            Omni Index
                        </span>
                        <span className="hidden items-center gap-1.5 sm:inline-flex">
                            <span className="h-2 w-3 rounded-full bg-[var(--accent)]/25" />
                            quality before the speed &amp; cost drag
                        </span>
                        {unpriced > 0 && (
                            <span>
                                {unpriced} unpriced model{unpriced > 1 ? 's' : ''} left out — not
                                scored as free.
                            </span>
                        )}
                    </div>
                )}

                {ranked.length === 0 && (
                    <p className="mt-4 text-[12px] text-[var(--muted-foreground)]">
                        No priced models in the current selection — pick a batch with eval_pricing filled
                        in to see the Omni Index.
                    </p>
                )}
            </div>
        </div>
    )
}
