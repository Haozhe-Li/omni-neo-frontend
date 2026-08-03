'use client'

import { useMemo, useState } from 'react'
import { ChevronRight, Filter } from 'lucide-react'
import { type CheckFailureRow, type EvalCase, fmtPct } from '@/lib/benchmark'
import { cn } from '@/lib/utils'

interface RubricPanelProps {
    failures: CheckFailureRow[]
    cases: EvalCase[]
}

/**
 * Two views of the rubric: what fails most often, and what each case expects.
 *
 * The failure list is the "what to fix next" queue. It aggregates across every
 * run ever recorded, so a filter on sample size matters — a rule evaluated
 * twice and failed twice reads as 100% and tells you nothing.
 */
export function RubricPanel({ failures, cases }: RubricPanelProps) {
    const [minEvaluated, setMinEvaluated] = useState(4)
    const [kind, setKind] = useState<'all' | 'deterministic' | 'judge'>('all')

    /**
     * Merge rows that describe the same rubric.
     *
     * `v_eval_check_failures` groups by `(key, label, kind)`, and `label`
     * embeds the check's arguments — so `charts_valid` arrives once per
     * argument combination used across the suite (`min_series=1` and not), and
     * `word_count` once per threshold. That splits one rubric's statistics
     * into several partial rows, none of which answers "how often does this
     * check fail", and produced duplicate React keys on top.
     *
     * `key` is the stable identity here: `config.py` already folds the
     * discriminating argument into it for the checks where it matters
     * (`skill_loaded:charting`, `tool_called:google_search`), so collapsing on
     * it merges thresholds without merging genuinely different checks.
     */
    const filtered = useMemo(() => {
        const merged = new Map<string, CheckFailureRow>()
        for (const row of failures) {
            if (kind !== 'all' && row.kind !== kind) continue
            const existing = merged.get(row.key)
            if (!existing) {
                merged.set(row.key, { ...row })
                continue
            }
            existing.n_evaluated += row.n_evaluated
            existing.n_failed += row.n_failed
            existing.failure_rate = existing.n_evaluated
                ? existing.n_failed / existing.n_evaluated
                : 0
        }
        // Filter on the merged totals, not the fragments: a rubric evaluated
        // 3 times under one threshold and 5 under another has 8 samples, and
        // filtering first would have hidden it.
        return [...merged.values()]
            .filter((f) => f.n_evaluated >= minEvaluated)
            .sort((a, b) => (b.failure_rate ?? 0) - (a.failure_rate ?? 0) || b.n_failed - a.n_failed)
    }, [failures, minEvaluated, kind])

    return (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_1fr]">
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border-subtle)]">
                    <div>
                        <h3 className="text-[13px] font-medium text-[var(--foreground)]">Rubric failure rate</h3>
                        <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5">
                            Across every recorded run — the fix-next queue.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--muted)]">
                            {(['all', 'deterministic', 'judge'] as const).map((k) => (
                                <button
                                    key={k}
                                    onClick={() => setKind(k)}
                                    className={cn(
                                        'px-2 py-1 rounded-md text-[11px] transition-colors',
                                        kind === k
                                            ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm'
                                            : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                                    )}
                                >
                                    {k === 'deterministic' ? 'det' : k}
                                </button>
                            ))}
                        </div>
                        <label className="flex items-center gap-1.5" title="Minimum evaluations before a rule is listed">
                            <Filter className="h-3 w-3 text-[var(--muted-foreground)]" strokeWidth={1.5} />
                            <input
                                type="number"
                                min={1}
                                value={minEvaluated}
                                onChange={(e) => setMinEvaluated(Math.max(1, Number(e.target.value) || 1))}
                                className="w-12 text-[11px] rounded-md border border-[var(--border-subtle)] bg-[var(--background)] px-1.5 py-1 text-[var(--foreground)] outline-none focus:border-[var(--accent)] transition-colors"
                            />
                        </label>
                    </div>
                </div>
                <div className="max-h-[520px] overflow-y-auto custom-scrollbar">
                    {filtered.map((row) => (
                        <div
                            key={row.key}
                            className="px-4 py-2.5 border-b border-[var(--border-subtle)] last:border-0"
                        >
                            <div className="flex items-center gap-2">
                                <span className="text-[12px] text-[var(--foreground)] break-all flex-1 min-w-0">
                                    {row.key}
                                </span>
                                <span
                                    className={cn(
                                        'text-[10px] px-1.5 py-0.5 rounded shrink-0',
                                        row.kind === 'judge'
                                            ? 'bg-[var(--accent)]/12 text-[var(--accent)]'
                                            : 'bg-[var(--muted)] text-[var(--muted-foreground)]'
                                    )}
                                >
                                    {row.kind === 'deterministic' ? 'det' : 'judge'}
                                </span>
                                <span className="text-[12px] tabular-nums text-[var(--foreground)] shrink-0 w-12 text-right">
                                    {fmtPct(row.failure_rate)}
                                </span>
                            </div>
                            <div className="mt-1.5 flex items-center gap-2">
                                <div className="flex-1 h-1 rounded-full bg-[var(--muted)] overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all"
                                        style={{
                                            width: `${Math.round((row.failure_rate ?? 0) * 100)}%`,
                                            backgroundColor:
                                                (row.failure_rate ?? 0) > 0.5
                                                    ? 'var(--warning)'
                                                    : 'var(--accent)',
                                        }}
                                    />
                                </div>
                                <span className="text-[10px] tabular-nums text-[var(--muted-foreground)] shrink-0">
                                    {row.n_failed}/{row.n_evaluated}
                                </span>
                            </div>
                        </div>
                    ))}
                    {filtered.length === 0 && (
                        <p className="px-4 py-10 text-center text-[13px] text-[var(--muted-foreground)]">
                            Nothing above the sample-size threshold yet.
                        </p>
                    )}
                </div>
            </div>

            <CaseRegistry cases={cases} />
        </div>
    )
}

function CaseRegistry({ cases }: { cases: EvalCase[] }) {
    const [expanded, setExpanded] = useState<string | null>(null)

    const bySuite = useMemo(() => {
        const groups = new Map<string, EvalCase[]>()
        for (const c of cases) {
            if (!groups.has(c.suite)) groups.set(c.suite, [])
            groups.get(c.suite)!.push(c)
        }
        return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    }, [cases])

    return (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
                <h3 className="text-[13px] font-medium text-[var(--foreground)]">Test cases</h3>
                <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5">
                    The prompt and the exact rubric each one is graded on.
                </p>
            </div>
            <div className="max-h-[520px] overflow-y-auto custom-scrollbar">
                {bySuite.map(([suite, group]) => (
                    <div key={suite}>
                        <div className="px-4 py-1.5 bg-[var(--secondary)]/40 text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] sticky top-0 z-10">
                            {suite}
                        </div>
                        {group.map((c) => {
                            const open = expanded === c.case_id
                            const hard = c.rubric?.filter((r) => r.weight >= 2).length ?? 0
                            return (
                                <div key={c.case_id} className="border-b border-[var(--border-subtle)] last:border-0">
                                    <button
                                        onClick={() => setExpanded(open ? null : c.case_id)}
                                        className="w-full px-4 py-2.5 flex items-start gap-2 text-left hover:bg-[var(--secondary)]/50 transition-colors"
                                    >
                                        <ChevronRight
                                            className={cn(
                                                'h-3.5 w-3.5 mt-0.5 shrink-0 text-[var(--muted-foreground)] transition-transform',
                                                open && 'rotate-90'
                                            )}
                                            strokeWidth={1.5}
                                        />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-[12px] text-[var(--foreground)]">{c.title}</span>
                                                {c.is_negative && (
                                                    <span className="text-[9px] px-1.5 py-px rounded bg-[var(--muted)] text-[var(--muted-foreground)] uppercase tracking-wide">
                                                        negative
                                                    </span>
                                                )}
                                                <span className="text-[9px] px-1.5 py-px rounded bg-[var(--muted)] text-[var(--muted-foreground)] uppercase">
                                                    {c.lang}
                                                </span>
                                            </div>
                                            <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)] truncate">
                                                {c.turns?.[0]}
                                            </p>
                                        </div>
                                        <span className="text-[10px] text-[var(--muted-foreground)] shrink-0 tabular-nums">
                                            {c.rubric?.length ?? 0} rules · {hard} hard
                                        </span>
                                    </button>
                                    {open && (
                                        <div className="px-4 pb-3 pl-9 space-y-2.5">
                                            {c.turns?.map((t, i) => (
                                                <div key={i} className="rounded-lg bg-[var(--secondary)]/50 px-2.5 py-2">
                                                    <div className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] mb-0.5">
                                                        Turn {i}
                                                    </div>
                                                    <p className="text-[11px] text-[var(--foreground)] whitespace-pre-wrap">
                                                        {t}
                                                    </p>
                                                </div>
                                            ))}
                                            <div className="space-y-1">
                                                {c.rubric?.map((r, i) => (
                                                    <div key={`${r.key}-${i}`} className="flex items-start gap-2">
                                                        <span
                                                            className={cn(
                                                                'mt-1 h-1.5 w-1.5 rounded-full shrink-0',
                                                                r.layer === 'judge'
                                                                    ? 'bg-[var(--accent)]'
                                                                    : 'bg-[var(--muted-foreground)]'
                                                            )}
                                                        />
                                                        <div className="min-w-0 flex-1">
                                                            <span className="text-[11px] text-[var(--foreground)] break-all">
                                                                {r.key}
                                                            </span>
                                                            {r.args && Object.keys(r.args).length > 0 && (
                                                                <span className="ml-1.5 text-[10px] text-[var(--muted-foreground)] font-mono">
                                                                    {Object.entries(r.args)
                                                                        .map(([k, v]) => `${k}=${v}`)
                                                                        .join(' ')}
                                                                </span>
                                                            )}
                                                            {r.prompt && (
                                                                <p className="text-[10px] text-[var(--muted-foreground)] mt-0.5 leading-relaxed">
                                                                    {r.prompt}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <span className="text-[10px] text-[var(--muted-foreground)] shrink-0 tabular-nums">
                                                            w{r.weight}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                ))}
                {cases.length === 0 && (
                    <p className="px-4 py-10 text-center text-[13px] text-[var(--muted-foreground)]">
                        No cases registered yet.
                    </p>
                )}
            </div>
        </div>
    )
}
