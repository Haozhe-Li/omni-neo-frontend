'use client'

import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, AlertTriangle, Trophy } from 'lucide-react'
import {
    METRICS,
    type LeaderboardRowWithIndex,
    fmtPct,
    fmtScore,
    providerColor,
    providerLabel,
} from '@/lib/benchmark'
import { cn } from '@/lib/utils'

const COLUMNS: { key: string; label: string; align?: 'right'; highlight?: boolean }[] = [
    { key: 'omni_index', label: 'Omni Index', align: 'right', highlight: true },
    { key: 'score', label: 'Score', align: 'right' },
    { key: 'pass_rate', label: 'Pass rate', align: 'right' },
    { key: 'error_rate', label: 'Errors', align: 'right' },
    { key: 'ttft_ms_p50', label: 'TTFT', align: 'right' },
    { key: 'ttft_answer_ms_p50', label: 'TTF answer', align: 'right' },
    { key: 'latency_ms_p50', label: 'Latency p50', align: 'right' },
    { key: 'turns_mean', label: 'Turns', align: 'right' },
    { key: 'reasoning_tokens_mean', label: 'Reasoning tok', align: 'right' },
    { key: 'cost_usd_per_case', label: 'Cost/case', align: 'right' },
]

interface LeaderboardTableProps {
    rows: LeaderboardRowWithIndex[]
    selected: Set<string>
    onToggle: (model: string) => void
}

/**
 * The numbers behind the scatter, sortable on every column.
 *
 * Error rate sits immediately beside score on purpose. The latency and cost
 * columns are computed over successful results only — one 300s timeout would
 * otherwise poison every percentile — so a model that crashed on two thirds of
 * its cases can look both fast and accurate here. Those two numbers are only
 * meaningful next to each other, and rows with a non-trivial error rate are
 * flagged rather than left for the reader to notice.
 *
 * Sorted by Omni Index by default — quality, latency and price folded into
 * one number (see `omniIndex` in lib/benchmark.ts) — since that composite is
 * this table's reason for existing, not an afterthought column bolted onto a
 * quality ranking.
 */
export function LeaderboardTable({ rows, selected, onToggle }: LeaderboardTableProps) {
    const [sortKey, setSortKey] = useState('omni_index')
    const [sortDesc, setSortDesc] = useState(true)

    const visible = useMemo(() => rows.filter((r) => selected.has(r.model_label)), [rows, selected])

    // The Omni Index leader, independent of whatever column the table is
    // currently sorted by — the trophy should stay on the same row whether
    // someone re-sorts by cost or by TTFT to explore the table.
    const topOmniLabel = useMemo(() => {
        let top: LeaderboardRowWithIndex | null = null
        for (const r of visible) {
            if (r.omni_index !== null && (!top || (top.omni_index ?? -1) < r.omni_index)) top = r
        }
        return top?.model_label ?? null
    }, [visible])

    const sorted = useMemo(() => {
        return [...visible].sort((a, b) => {
            const av = (a as unknown as Record<string, number | null>)[sortKey]
            const bv = (b as unknown as Record<string, number | null>)[sortKey]
            // Nulls always sink, regardless of direction: an unmeasured model
            // should never top the table just because the column is empty.
            if (av === null || av === undefined) return 1
            if (bv === null || bv === undefined) return -1
            return sortDesc ? bv - av : av - bv
        })
    }, [visible, sortKey, sortDesc])

    const toggleSort = (key: string) => {
        if (key === sortKey) {
            setSortDesc((d) => !d)
        } else {
            setSortKey(key)
            setSortDesc(METRICS[key]?.higherIsBetter ?? true)
        }
    }

    return (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
                <h3 className="text-[13px] font-medium text-[var(--foreground)]">Leaderboard</h3>
                <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5">
                    Sorted by <span className="text-[var(--accent)] font-medium">Omni Index</span> — quality, latency
                    and cost in one number. Latency and cost cover successful runs only — read them next to the error
                    column.
                </p>
            </div>
            <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-[12px]">
                    <thead>
                        <tr className="border-b border-[var(--border-subtle)]">
                            <th className="text-left font-medium text-[var(--muted-foreground)] px-4 py-2 sticky left-0 bg-[var(--card)] z-10">
                                Model
                            </th>
                            {COLUMNS.map((col) => (
                                <th
                                    key={col.key}
                                    onClick={() => toggleSort(col.key)}
                                    className={cn(
                                        'text-right font-medium px-3 py-2 cursor-pointer transition-colors whitespace-nowrap select-none',
                                        col.highlight
                                            ? 'text-[var(--accent)] hover:text-[var(--accent)]'
                                            : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                                    )}
                                >
                                    <span className="inline-flex items-center gap-1">
                                        {col.label}
                                        {sortKey === col.key &&
                                            (sortDesc ? (
                                                <ArrowDown className="h-3 w-3" strokeWidth={1.5} />
                                            ) : (
                                                <ArrowUp className="h-3 w-3" strokeWidth={1.5} />
                                            ))}
                                    </span>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map((row) => {
                            const flagged = (row.error_rate ?? 0) >= 0.1
                            return (
                                <tr
                                    key={row.run_id}
                                    onClick={() => onToggle(row.model_label)}
                                    className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--secondary)]/50 transition-colors cursor-pointer"
                                >
                                    <td className="px-4 py-2 sticky left-0 bg-[var(--card)]">
                                        <div className="flex items-center gap-2">
                                            <span
                                                className="h-2 w-2 rounded-full shrink-0"
                                                style={{ backgroundColor: providerColor(row.provider) }}
                                            />
                                            <span className="text-[var(--foreground)] whitespace-nowrap">
                                                {row.model_label}
                                            </span>
                                            <span className="text-[10px] text-[var(--muted-foreground)] whitespace-nowrap">
                                                {providerLabel(row.provider)}
                                            </span>
                                        </div>
                                    </td>
                                    {COLUMNS.map((col) => {
                                        const value = (row as unknown as Record<string, number | null>)[col.key]
                                        const def = METRICS[col.key]
                                        const isError = col.key === 'error_rate'
                                        const isLeader = col.highlight && row.model_label === topOmniLabel
                                        return (
                                            <td
                                                key={col.key}
                                                className={cn(
                                                    'px-3 py-2 text-right tabular-nums whitespace-nowrap',
                                                    isError && flagged
                                                        ? 'text-[var(--warning)] font-medium'
                                                        : 'text-[var(--foreground)]'
                                                )}
                                            >
                                                {col.highlight ? (
                                                    <span
                                                        className={cn(
                                                            'inline-flex items-center gap-1 justify-end rounded-full px-2 py-0.5 font-semibold',
                                                            'bg-[var(--accent)]/12 text-[var(--accent)]'
                                                        )}
                                                    >
                                                        {isLeader && (
                                                            <Trophy className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                                                        )}
                                                        {def ? def.format(value) : (value ?? '—')}
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 justify-end">
                                                        {isError && flagged && (
                                                            <AlertTriangle className="h-3 w-3" strokeWidth={1.5} />
                                                        )}
                                                        {def ? def.format(value) : (value ?? '—')}
                                                    </span>
                                                )}
                                            </td>
                                        )
                                    })}
                                </tr>
                            )
                        })}
                        {sorted.length === 0 && (
                            <tr>
                                <td
                                    colSpan={COLUMNS.length + 1}
                                    className="px-4 py-8 text-center text-[var(--muted-foreground)]"
                                >
                                    Select at least one model.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

/** Compact stat used in the page header. */
export function StatTile({
    label,
    value,
    hint,
}: {
    label: string
    value: string
    hint?: string
}) {
    return (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3.5 transition-colors hover:border-[var(--accent)]/30">
            <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
                {label}
            </div>
            <div className="mt-1.5 text-[24px] font-semibold tabular-nums leading-none tracking-tight text-[var(--foreground)]">
                {value}
            </div>
            {hint && (
                <div className="mt-1.5 truncate text-[11px] text-[var(--muted-foreground)]" title={hint}>
                    {hint}
                </div>
            )}
        </div>
    )
}

export { fmtScore, fmtPct }
