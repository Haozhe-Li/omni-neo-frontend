'use client'

import { useMemo, useState } from 'react'
import { EChartsChart } from '@/components/echarts-chart'
import {
    type FamilyGridRow,
    fmtCost,
    fmtMs,
    fmtScore,
    fmtTokens,
    providerColor,
    providerLabel,
    scoreTint,
    scoreTextColor,
} from '@/lib/benchmark'
import { cn } from '@/lib/utils'

const EFFORT_ORDER = ['low', 'medium', 'high']

interface FamilyGridProps {
    rows: FamilyGridRow[]
}

/**
 * The provider × reasoning-effort grid.
 *
 * gpt-oss-120b is evaluated as a fully crossed 2×3 (Cerebras and Groq, each at
 * low/medium/high), which lets the two factors be told apart:
 *
 * - Reading **along a row** shows what extra reasoning effort actually bought,
 *   which the effort curve below pairs against reasoning-token spend.
 * - Reading **down a column** isolates the provider. Same weights, same effort,
 *   so quality should land in the same place and only latency and price should
 *   move — which makes this column a built-in control on the harness itself.
 *   A large quality gap down a column is evidence of a serving or harness
 *   problem, not of model ability.
 */
export function FamilyGrid({ rows }: FamilyGridProps) {
    const families = useMemo(() => {
        const set = new Set(rows.map((r) => r.model_family))
        return [...set].sort((a, b) => {
            const ca = rows.filter((r) => r.model_family === a).length
            const cb = rows.filter((r) => r.model_family === b).length
            return cb - ca || a.localeCompare(b)
        })
    }, [rows])

    const [family, setFamily] = useState<string | null>(null)
    const active = family ?? families[0] ?? null
    const familyRows = useMemo(
        () => rows.filter((r) => r.model_family === active),
        [rows, active]
    )

    const providers = useMemo(
        () => [...new Set(familyRows.map((r) => r.provider))].sort(),
        [familyRows]
    )
    const efforts = useMemo(() => {
        const present = [...new Set(familyRows.map((r) => r.reasoning_effort ?? 'default'))]
        return present.sort((a, b) => {
            const ia = EFFORT_ORDER.indexOf(a)
            const ib = EFFORT_ORDER.indexOf(b)
            return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
        })
    }, [familyRows])

    const cellAt = (provider: string, effort: string) =>
        familyRows.find(
            (r) => r.provider === provider && (r.reasoning_effort ?? 'default') === effort
        )

    /** Reasoning tokens against score — what an extra unit of thinking bought. */
    const effortCurve = useMemo(() => {
        if (familyRows.length < 2) return null
        const byProvider = new Map<string, FamilyGridRow[]>()
        for (const row of familyRows) {
            if (!byProvider.has(row.provider)) byProvider.set(row.provider, [])
            byProvider.get(row.provider)!.push(row)
        }
        const series = [...byProvider.entries()].map(([provider, rs]) => {
            const sorted = [...rs].sort(
                (a, b) =>
                    EFFORT_ORDER.indexOf(a.reasoning_effort ?? '') -
                    EFFORT_ORDER.indexOf(b.reasoning_effort ?? '')
            )
            return {
                name: providerLabel(provider),
                type: 'line',
                symbolSize: 8,
                lineStyle: { width: 1.8, color: providerColor(provider) },
                itemStyle: { color: providerColor(provider) },
                data: sorted
                    .filter((r) => r.reasoning_tokens_mean !== null && r.score !== null)
                    .map((r) => ({
                        value: [r.reasoning_tokens_mean, r.score],
                        effort: r.reasoning_effort,
                    })),
            }
        })
        if (series.every((s) => s.data.length < 2)) return null

        return {
                // ECharts' built-in dark theme paints an opaque near-black canvas,
                // which shows up as a hole inside the card. Let the card show through.
                backgroundColor: 'transparent',
            grid: { left: 52, right: 20, top: 20, bottom: 52 },
            tooltip: {
                trigger: 'item',
                borderWidth: 0,
                padding: [8, 12],
                backgroundColor: 'rgba(26,26,26,0.94)',
                textStyle: { color: '#fff', fontSize: 12 },
                formatter: (p: any) =>
                    `<b>${p.seriesName}</b> · ${p.data.effort}<br/>reasoning: ${fmtTokens(p.data.value[0])}<br/>score: ${fmtScore(p.data.value[1])}`,
            },
            xAxis: {
                type: 'value',
                name: 'reasoning tokens (mean)',
                nameLocation: 'middle',
                nameGap: 30,
                nameTextStyle: { fontSize: 10, color: '#6b6b6b' },
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: { fontSize: 10, color: '#6b6b6b', formatter: (v: number) => fmtTokens(v) },
                splitLine: { lineStyle: { color: 'rgba(128,128,128,0.12)' } },
            },
            yAxis: {
                type: 'value',
                name: 'score',
                nameLocation: 'middle',
                nameGap: 36,
                nameTextStyle: { fontSize: 10, color: '#6b6b6b' },
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: { fontSize: 10, color: '#6b6b6b' },
                splitLine: { lineStyle: { color: 'rgba(128,128,128,0.12)' } },
            },
            legend: {
                bottom: 0,
                itemWidth: 8,
                itemHeight: 8,
                icon: 'circle',
                textStyle: { fontSize: 11, color: '#6b6b6b' },
            },
            series,
        }
    }, [familyRows])

    if (families.length === 0) {
        return (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-10 text-center text-[13px] text-[var(--muted-foreground)]">
                No family grid data yet — this needs at least one model with a reasoning-effort variant.
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border-subtle)]">
                    <div>
                        <h3 className="text-[13px] font-medium text-[var(--foreground)]">
                            Provider × reasoning effort
                        </h3>
                        <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5">
                            Across a row: what more effort bought. Down a column: what the provider changed
                            at identical effort — quality should barely move.
                        </p>
                    </div>
                    {families.length > 1 && (
                        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--muted)]">
                            {families.map((f) => (
                                <button
                                    key={f}
                                    onClick={() => setFamily(f)}
                                    className={cn(
                                        'px-2.5 py-1 rounded-md text-[11px] transition-colors',
                                        active === f
                                            ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm'
                                            : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                                    )}
                                >
                                    {f}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="overflow-x-auto custom-scrollbar p-4">
                    <table className="w-full text-[12px] border-separate border-spacing-1">
                        <thead>
                            <tr>
                                <th className="w-24" />
                                {efforts.map((e) => (
                                    <th
                                        key={e}
                                        className="text-[11px] font-medium uppercase tracking-wider text-[var(--muted-foreground)] pb-1"
                                    >
                                        {e}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {providers.map((provider) => (
                                <tr key={provider}>
                                    <td className="pr-2">
                                        <div className="flex items-center gap-1.5">
                                            <span
                                                className="h-2 w-2 rounded-full shrink-0"
                                                style={{ backgroundColor: providerColor(provider) }}
                                            />
                                            <span className="text-[11px] text-[var(--muted-foreground)]">
                                                {providerLabel(provider)}
                                            </span>
                                        </div>
                                    </td>
                                    {efforts.map((effort) => {
                                        const cell = cellAt(provider, effort)
                                        return (
                                            <td key={effort}>
                                                {cell ? (
                                                    <div
                                                        className="rounded-lg px-2.5 py-2 border border-[var(--border-subtle)]"
                                                        style={{ backgroundColor: scoreTint(cell.score) }}
                                                    >
                                                        <div
                                                            className="text-[16px] font-semibold tabular-nums leading-none"
                                                            style={{ color: scoreTextColor(cell.score) }}
                                                        >
                                                            {fmtScore(cell.score, 3)}
                                                        </div>
                                                        <dl className="mt-1.5 space-y-0.5 text-[10px] text-[var(--muted-foreground)]">
                                                            <MiniRow k="ttft" v={fmtMs(cell.ttft_ms_p50)} />
                                                            <MiniRow k="latency" v={fmtMs(cell.latency_ms_p50)} />
                                                            <MiniRow k="think" v={fmtTokens(cell.reasoning_tokens_mean)} />
                                                            <MiniRow k="cost" v={fmtCost(cell.cost_usd_per_case)} />
                                                        </dl>
                                                    </div>
                                                ) : (
                                                    <div className="rounded-lg px-2.5 py-2 border border-dashed border-[var(--border-subtle)] text-center text-[10px] text-[var(--muted-foreground)]">
                                                        not run
                                                    </div>
                                                )}
                                            </td>
                                        )
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {effortCurve && (
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] overflow-hidden">
                    <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
                        <h3 className="text-[13px] font-medium text-[var(--foreground)]">Effort curve</h3>
                        <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5">
                            Score against reasoning tokens spent. Two lines with the same shape means the
                            effect is the model&apos;s, not one provider&apos;s.
                        </p>
                    </div>
                    <EChartsChart option={effortCurve} className="h-[300px] w-full" />
                </div>
            )}
        </div>
    )
}

function MiniRow({ k, v }: { k: string; v: string }) {
    return (
        <div className="flex items-baseline justify-between gap-2">
            <dt>{k}</dt>
            <dd className="tabular-nums text-[var(--foreground)]/70">{v}</dd>
        </div>
    )
}
