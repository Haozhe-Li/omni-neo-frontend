'use client'

import { useMemo } from 'react'
import { Sparkles, Trophy } from 'lucide-react'
import {
    OMNI_QUALITY_FLOOR,
    type LeaderboardRowWithIndex,
    fmtScore,
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
 */
export function OmniIndexHero({ rows, selected, onSelectModel }: OmniIndexHeroProps) {
    const ranked = useMemo(() => {
        return rows
            .filter((r) => selected.has(r.model_label) && r.omni_index !== null)
            .sort((a, b) => (b.omni_index ?? 0) - (a.omni_index ?? 0))
            .slice(0, 8)
    }, [rows, selected])

    const leader = ranked[0] ?? null
    const maxIndex = leader?.omni_index ?? 1
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
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <div className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--accent)]">
                            <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
                            Omni Index
                        </div>
                        <p className="mt-1 text-[12px] text-[var(--muted-foreground)] max-w-md">
                            Our composite ranking — quality first, with speed and cost as a
                            tiebreaker. Being fast or cheap can only move a model&apos;s score by up
                            to {Math.round((1 - OMNI_QUALITY_FLOOR) * 100)}%; it can never out-rank a
                            model that is meaningfully more accurate.
                        </p>
                        {unpriced > 0 && (
                            <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
                                {unpriced} selected model{unpriced > 1 ? 's' : ''} missing a price and left
                                out of this ranking, not scored as free.
                            </p>
                        )}
                    </div>

                    {leader && (
                        <div className="text-right shrink-0">
                            <div className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
                                Leader
                            </div>
                            <div className="text-[28px] font-semibold tabular-nums leading-none text-[var(--accent)]">
                                {fmtScore(leader.omni_index)}
                            </div>
                            <div className="mt-1 text-[12px] font-medium text-[var(--foreground)]">
                                {leader.model_label}
                            </div>
                        </div>
                    )}
                </div>

                {ranked.length > 0 && (
                    <div className="mt-4 space-y-1.5">
                        {ranked.map((row, i) => (
                            <button
                                key={row.run_id}
                                onClick={() => onSelectModel(row.model_label)}
                                className="group flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-[var(--accent)]/8"
                            >
                                <span className="w-4 shrink-0 text-[11px] tabular-nums text-[var(--muted-foreground)]">
                                    {i === 0 ? (
                                        <Trophy className="h-3.5 w-3.5 text-[var(--accent)]" strokeWidth={1.75} />
                                    ) : (
                                        i + 1
                                    )}
                                </span>
                                <span
                                    className="h-1.5 w-1.5 rounded-full shrink-0"
                                    style={{ backgroundColor: providerColor(row.provider) }}
                                />
                                <span className="w-40 shrink-0 truncate text-[12px] text-[var(--foreground)]">
                                    {row.model_label}
                                </span>
                                <span className="hidden sm:inline w-14 shrink-0 text-[10px] text-[var(--muted-foreground)]">
                                    {providerLabel(row.provider)}
                                </span>
                                <div className="flex-1 h-1.5 rounded-full bg-[var(--muted)] overflow-hidden">
                                    <div
                                        className={cn(
                                            'h-full rounded-full transition-all',
                                            i === 0 ? 'bg-[var(--accent)]' : 'bg-[var(--accent)]/50'
                                        )}
                                        style={{
                                            width: `${Math.max(4, Math.round(((row.omni_index ?? 0) / (maxIndex || 1)) * 100))}%`,
                                        }}
                                    />
                                </div>
                                <span className="w-12 shrink-0 text-right text-[12px] tabular-nums font-medium text-[var(--foreground)]">
                                    {fmtScore(row.omni_index)}
                                </span>
                            </button>
                        ))}
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
