'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { GitCompare, Images, Lock, Type, Unlock } from 'lucide-react'
import {
    METRICS,
    RANK_TILES,
    type EvalRun,
    type LeaderboardRowWithIndex,
    type MetricRank,
    fmtCost,
    fmtDate,
    fmtMs,
    fmtPct,
    fmtScore,
    fmtTokens,
    median,
    benchRoutes,
    modelSummary,
    modelTraits,
    omniBreakdown,
    providerColor,
    providerLabel,
    rankOn,
} from '@/lib/benchmark'
import { cn } from '@/lib/utils'

// ── header ──────────────────────────────────────────────────────────────────
export function ModelHeader({ row, run }: { row: LeaderboardRowWithIndex; run: EvalRun | undefined }) {
    const color = providerColor(row.provider)
    const traits = modelTraits(row.model_family, row.model_label)
    return (
        <header className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[var(--muted-foreground)]">
                <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-[var(--foreground)]">{providerLabel(row.provider)}</span>
                </span>
                {row.model_family && (
                    <>
                        <span aria-hidden>·</span>
                        <span>{row.model_family}</span>
                    </>
                )}
                {row.reasoning_effort && (
                    <>
                        <span aria-hidden>·</span>
                        <span>{row.reasoning_effort} reasoning</span>
                    </>
                )}
                <span aria-hidden>·</span>
                <span>last run {fmtDate(row.started_at)}</span>
            </div>

            <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
                <h1 className="min-w-0 text-[24px] font-semibold leading-tight tracking-tight text-[var(--foreground)] sm:text-[30px]">
                    {row.model_label}
                </h1>
                <Link
                    href={benchRoutes.compare([row.model_label])}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/[0.06] px-3 py-1.5 text-[12px] font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/[0.12]"
                >
                    <GitCompare className="h-3.5 w-3.5" strokeWidth={1.75} />
                    Compare
                </Link>
            </div>

            {/* What the model *is*, as opposed to how it scored. Neither of
                these comes out of the eval — see modelTraits. */}
            <div className="mt-2.5 flex flex-wrap gap-1.5">
                <TraitBadge
                    on={traits.multimodal}
                    onLabel="Multimodal"
                    offLabel="Text only"
                    icon={traits.multimodal ? Images : Type}
                />
                <TraitBadge
                    on={traits.openWeights}
                    onLabel="Open weights"
                    offLabel="Proprietary"
                    icon={traits.openWeights ? Unlock : Lock}
                />
            </div>

            {run && (
                <p className="mt-2.5 text-[12px] text-[var(--muted-foreground)]">
                    {run.n_cases ?? row.n_results} cases
                    {run.repeats > 1 && ` × ${run.repeats} repeats`}
                    {run.suites.length > 0 && ` · ${run.suites.join(', ')}`}
                </p>
            )}
        </header>
    )
}

/**
 * One capability chip.
 *
 * Both states are rendered rather than only the positive one: "not multimodal"
 * is as much a fact about a model as "multimodal", and showing the badge only
 * when true would leave the reader unable to tell a text-only model from one
 * whose modality nobody recorded. The off state is muted, not red — text-only
 * is a property, not a fault.
 */
function TraitBadge({
    on,
    onLabel,
    offLabel,
    icon: Icon,
}: {
    on: boolean
    onLabel: string
    offLabel: string
    icon: typeof Images
}) {
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]',
                on
                    ? 'border-[var(--accent)]/30 bg-[var(--accent)]/[0.07] text-[var(--foreground)]'
                    : 'border-[var(--border-subtle)] text-[var(--muted-foreground)]'
            )}
        >
            <Icon className="h-3 w-3 shrink-0" strokeWidth={1.75} />
            {on ? onLabel : offLabel}
        </span>
    )
}

// ── rank tiles ──────────────────────────────────────────────────────────────
/**
 * Five headline numbers, each with the model's rank on that metric.
 *
 * A bare value ("4.2s") is unreadable without the field around it — is that
 * fast? The rank and the meter answer that in the same glance, and the meter
 * is already flipped for lower-is-better metrics by `rankOn`, so a full bar
 * always means "best here" whichever way the metric points.
 */
export function RankTiles({
    row,
    all,
}: {
    row: LeaderboardRowWithIndex
    all: LeaderboardRowWithIndex[]
}) {
    const rows = all as unknown as Record<string, unknown>[]
    return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {RANK_TILES.map((tile, i) => {
                const rank = rankOn(rows, tile.key, row.model_label)
                return (
                    <div
                        key={tile.key}
                        className="omni-rise min-w-0 rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] p-3.5 sm:p-4"
                        style={{ ['--rise-delay' as string]: `${i * 50}ms` }}
                    >
                        <div className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-[11px] font-medium text-[var(--foreground)]">
                                {tile.title}
                            </span>
                            <span className="shrink-0 text-[10px] tabular-nums text-[var(--muted-foreground)]">
                                {rank ? `#${rank.rank} / ${rank.total}` : '—'}
                            </span>
                        </div>

                        <div className="mt-2.5 truncate text-[22px] font-semibold leading-none tabular-nums text-[var(--foreground)] sm:text-[24px]">
                            {rank ? METRICS[tile.key]?.format(rank.value) : 'n/a'}
                        </div>
                        <div className="mt-1 truncate text-[10px] text-[var(--muted-foreground)]">
                            {tile.hint}
                        </div>

                        <PercentileMeter rank={rank} metric={tile.key} />
                    </div>
                )
            })}
        </div>
    )
}

/**
 * How good that number is, as a bar.
 *
 * `rankOn` has already flipped the percentile for lower-is-better metrics, so
 * a full bar always means "best in the field" — the reader never has to
 * remember which direction this particular metric points.
 */
function PercentileMeter({ rank, metric }: { rank: MetricRank | null; metric: string }) {
    if (!rank) {
        return <div className="mt-3 h-1.5 rounded-full bg-[var(--muted)]" />
    }
    return (
        <div className="mt-3">
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--muted)]">
                <div
                    className="omni-bar-h h-full rounded-full bg-[var(--accent)]"
                    style={{
                        ['--bar-size' as string]: `${Math.max(rank.percentile * 100, 3)}%`,
                        ['--bar-delay' as string]: '120ms',
                    }}
                />
            </div>
            <div className="mt-1 truncate text-[10px] text-[var(--muted-foreground)]">
                median {METRICS[metric]?.format(rank.median) ?? '—'}
            </div>
        </div>
    )
}

// ── generated summary ───────────────────────────────────────────────────────
export function ModelSummary({
    row,
    all,
}: {
    row: LeaderboardRowWithIndex
    all: LeaderboardRowWithIndex[]
}) {
    const sentences = useMemo(() => modelSummary(row, all), [row, all])
    return (
        <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] p-4 sm:p-5">
            <h2 className="text-[13px] font-medium text-[var(--foreground)]">Summary</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--muted-foreground)]">
                {sentences.join(' ')}
            </p>
        </section>
    )
}

// ── Omni Index breakdown ────────────────────────────────────────────────────
/**
 * Why this model's composite lands where it does.
 *
 * The index is a product of quality and a capped efficiency multiplier, and a
 * single number invites "where did that come from". Showing the three terms
 * makes the answer readable instead of taken on faith.
 */
export function OmniBreakdownCard({ row }: { row: LeaderboardRowWithIndex }) {
    const parts = omniBreakdown(row)

    if (!parts) {
        return (
            <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] p-4 sm:p-5">
                <h2 className="text-[13px] font-medium text-[var(--foreground)]">Omni Index</h2>
                <p className="mt-2 text-[12px] leading-relaxed text-[var(--muted-foreground)]">
                    Not scored: the index needs quality, latency and price together, and at least one is
                    missing for this model. An unpriced model is left out rather than treated as free.
                </p>
            </section>
        )
    }

    const terms = [
        { label: 'Quality', value: fmtScore(parts.quality), pct: parts.quality * 100 },
        { label: 'Speed score', value: fmtScore(parts.latencyScore, 2), pct: parts.latencyScore * 100 },
        { label: 'Price score', value: fmtScore(parts.priceScore, 2), pct: parts.priceScore * 100 },
    ]

    return (
        <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] p-4 sm:p-5">
            <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-[13px] font-medium text-[var(--foreground)]">Omni Index</h2>
                <span className="text-[20px] font-semibold tabular-nums text-[var(--accent)]">
                    {fmtScore(parts.index)}
                </span>
            </div>

            <div className="mt-3 space-y-2.5">
                {terms.map((t, i) => (
                    <div key={t.label}>
                        <div className="flex items-baseline justify-between gap-2 text-[11px]">
                            <span className="text-[var(--muted-foreground)]">{t.label}</span>
                            <span className="tabular-nums text-[var(--foreground)]">{t.value}</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--muted)]">
                            <div
                                className="omni-bar-h h-full rounded-full"
                                style={{
                                    ['--bar-size' as string]: `${Math.max(t.pct, 2)}%`,
                                    ['--bar-delay' as string]: `${100 + i * 60}ms`,
                                    backgroundColor: 'var(--accent)',
                                    opacity: i === 0 ? 1 : 0.55,
                                }}
                            />
                        </div>
                    </div>
                ))}
            </div>

            <p className="mt-3 border-t border-[var(--border-subtle)] pt-2.5 text-[11px] leading-relaxed text-[var(--muted-foreground)]">
                Quality {fmtScore(parts.quality)} × efficiency {fmtScore(parts.multiplier, 3)} ={' '}
                {fmtScore(parts.index)}. Speed and cost are a capped tiebreaker — together they can move
                the score by at most 10%, so they can never out-rank a meaningfully more accurate model.
            </p>
        </section>
    )
}

// ── suite scores ────────────────────────────────────────────────────────────
export function ModelSuites({
    run,
    allRuns,
}: {
    run: EvalRun | undefined
    allRuns: EvalRun[]
}) {
    const suites = useMemo(() => {
        const mine = run?.suite_scores
        if (!mine) return []
        return Object.entries(mine)
            .map(([suite, score]) => ({
                suite,
                score,
                median:
                    median(
                        allRuns
                            .map((r) => r.suite_scores?.[suite])
                            .filter((v): v is number => typeof v === 'number')
                    ) ?? null,
            }))
            .sort((a, b) => b.score - a.score)
    }, [run, allRuns])

    if (suites.length === 0) {
        return (
            <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] p-4 sm:p-5">
                <h2 className="text-[13px] font-medium text-[var(--foreground)]">Per-suite scores</h2>
                <p className="mt-2 text-[12px] text-[var(--muted-foreground)]">
                    This run recorded no per-suite breakdown.
                </p>
            </section>
        )
    }

    return (
        <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] p-4 sm:p-5">
            <h2 className="text-[13px] font-medium text-[var(--foreground)]">Per-suite scores</h2>
            <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                The tick marks where every model&apos;s median lands, so a strong suite reads as strong
                against the field rather than against itself.
            </p>

            <ul className="mt-4 space-y-3">
                {suites.map((s, i) => (
                    <li key={s.suite}>
                        <div className="flex items-baseline justify-between gap-2 text-[11px]">
                            <span className="truncate text-[var(--foreground)]">{s.suite}</span>
                            <span className="shrink-0 tabular-nums text-[var(--muted-foreground)]">
                                {fmtScore(s.score)}
                                {s.median !== null && ` · median ${fmtScore(s.median)}`}
                            </span>
                        </div>
                        <div className="relative mt-1.5 h-2.5 overflow-hidden rounded-full bg-[var(--muted)]">
                            <div
                                className="omni-bar-h h-full rounded-full bg-[var(--accent)]"
                                style={{
                                    ['--bar-size' as string]: `${Math.max(s.score * 100, 2)}%`,
                                    ['--bar-delay' as string]: `${i * 45}ms`,
                                }}
                            />
                            {s.median !== null && (
                                <span
                                    className="absolute inset-y-0 w-px bg-[var(--foreground)] opacity-45"
                                    style={{ left: `${Math.min(Math.max(s.median * 100, 0), 100)}%` }}
                                    title={`median ${fmtScore(s.median)}`}
                                />
                            )}
                        </div>
                    </li>
                ))}
            </ul>
        </section>
    )
}

// ── raw specifications ──────────────────────────────────────────────────────
export function ModelSpecs({
    row,
    run,
}: {
    row: LeaderboardRowWithIndex
    run: EvalRun | undefined
}) {
    const specs: { k: string; v: string; warn?: boolean }[] = [
        { k: 'Quality score', v: fmtScore(row.score) },
        { k: 'Hard-check pass rate', v: fmtPct(row.pass_rate) },
        { k: 'Error rate', v: fmtPct(row.error_rate), warn: (row.error_rate ?? 0) > 0.02 },
        { k: 'Latency p50', v: fmtMs(row.latency_ms_p50) },
        { k: 'Latency p95', v: fmtMs(row.latency_ms_p95) },
        { k: 'TTFT (first chunk)', v: fmtMs(row.ttft_ms_p50) },
        { k: 'TTFT (answer prose)', v: fmtMs(row.ttft_answer_ms_p50) },
        { k: 'LLM turns', v: row.turns_mean === null ? '—' : row.turns_mean.toFixed(1) },
        { k: 'Input tokens', v: fmtTokens(row.input_tokens_mean) },
        { k: 'Output tokens', v: fmtTokens(row.output_tokens_mean) },
        { k: 'Reasoning tokens', v: fmtTokens(row.reasoning_tokens_mean) },
        { k: 'Cost per case', v: fmtCost(row.cost_usd_per_case) },
        { k: 'Cost, all cases', v: fmtCost(row.cost_usd_total) },
        { k: 'Results recorded', v: String(row.n_results) },
    ]

    if (run) {
        specs.push(
            { k: 'Judge', v: (run.judge_model ?? 'none').replace('openai:', '') },
            { k: 'Tool cache', v: run.tool_cache ? 'on' : 'off', warn: !run.tool_cache },
            { k: 'Prompt', v: run.prompt_sha?.slice(0, 7) ?? '—' },
            { k: 'Skills', v: run.skills_sha?.slice(0, 7) ?? '—' },
            { k: 'Run mode', v: run.mode },
            { k: 'Batch', v: run.label ?? '—' }
        )
    }

    return (
        <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] p-4 sm:p-5">
            <h2 className="text-[13px] font-medium text-[var(--foreground)]">Everything recorded</h2>
            <dl className="mt-3 grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                {specs.map((s) => (
                    <div
                        key={s.k}
                        className="flex items-baseline justify-between gap-3 border-b border-[var(--border-subtle)] py-1.5 text-[12px] last:border-0"
                    >
                        <dt className="shrink-0 text-[var(--muted-foreground)]">{s.k}</dt>
                        <dd
                            className={cn(
                                'truncate tabular-nums',
                                s.warn ? 'text-[var(--warning)]' : 'text-[var(--foreground)]'
                            )}
                        >
                            {s.v}
                        </dd>
                    </div>
                ))}
            </dl>
            {run && !run.tool_cache && (
                <p className="mt-3 text-[10px] leading-relaxed text-[var(--warning)]">
                    Tool cache was off for this run, so it saw different search results than a cached run
                    — part of any gap against those models is search luck, not the model.
                </p>
            )}
        </section>
    )
}

// ── neighbours ──────────────────────────────────────────────────────────────
/** Jump to the models ranked either side of this one on the Omni Index. */
export function ModelNeighbours({
    row,
    all,
}: {
    row: LeaderboardRowWithIndex
    all: LeaderboardRowWithIndex[]
}) {
    const { prev, next } = useMemo(() => {
        const ranked = all
            .filter((r) => r.omni_index !== null)
            .sort((a, b) => (b.omni_index ?? 0) - (a.omni_index ?? 0))
        const i = ranked.findIndex((r) => r.model_label === row.model_label)
        if (i === -1) return { prev: null, next: null }
        return { prev: ranked[i - 1] ?? null, next: ranked[i + 1] ?? null }
    }, [row, all])

    if (!prev && !next) return null

    return (
        <nav className="flex flex-wrap gap-3">
            {prev && <NeighbourLink row={prev} caption="Ranked above" />}
            {next && <NeighbourLink row={next} caption="Ranked below" />}
        </nav>
    )
}

function NeighbourLink({ row, caption }: { row: LeaderboardRowWithIndex; caption: string }) {
    return (
        <Link
            href={benchRoutes.model(row.model_label)}
            className="min-w-0 flex-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3 transition-colors hover:border-[var(--accent)]/40"
        >
            <div className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
                {caption}
            </div>
            <div className="mt-1 flex items-center gap-2">
                <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: providerColor(row.provider) }}
                />
                <span className="truncate text-[13px] text-[var(--foreground)]">{row.model_label}</span>
                <span className="ml-auto shrink-0 text-[12px] tabular-nums text-[var(--muted-foreground)]">
                    {fmtScore(row.omni_index)}
                </span>
            </div>
        </Link>
    )
}
