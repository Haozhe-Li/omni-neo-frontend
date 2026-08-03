'use client'

import { useMemo, useState } from 'react'
import { METRICS, type MatrixResponse, type MatrixCell, fmtScore, providerColor, scoreTint, scoreTextColor, shortCaseId } from '@/lib/benchmark'
import { cn } from '@/lib/utils'

interface CaseMatrixProps {
    matrix: MatrixResponse
    selected: Set<string>
    onOpenCell: (caseId: string, modelLabel: string, cell: MatrixCell) => void
}

const CELL_METRICS = ['score_mean', 'pass_rate', 'latency_ms_p50', 'ttft_ms_p50', 'cost_usd_mean'] as const

const CELL_METRIC_DEFS: Record<string, { label: string; format: (v: number | null | undefined) => string; higherIsBetter: boolean }> = {
    score_mean: { label: 'Score', format: (v) => fmtScore(v, 2), higherIsBetter: true },
    pass_rate: { label: 'Pass rate', format: (v) => METRICS.pass_rate.format(v), higherIsBetter: true },
    latency_ms_p50: { label: 'Latency', format: METRICS.latency_ms_p50.format, higherIsBetter: false },
    ttft_ms_p50: { label: 'TTFT', format: METRICS.ttft_ms_p50.format, higherIsBetter: false },
    cost_usd_mean: { label: 'Cost', format: METRICS.cost_usd_per_case.format, higherIsBetter: false },
}

/**
 * Case x model heatmap, built as a CSS grid rather than a chart.
 *
 * Every cell is a real button: clicking one opens that execution's answer,
 * report, trace and rubric checklist. A canvas heatmap would render the same
 * colours but make drill-down a hit-testing exercise, and drill-down is the
 * point — an aggregate score tells you something regressed, the cell tells you
 * what the model actually did.
 */
export function CaseMatrix({ matrix, selected, onOpenCell }: CaseMatrixProps) {
    const [metric, setMetric] = useState<string>('score_mean')
    const [hover, setHover] = useState<{ caseId: string; model: string } | null>(null)

    const models = useMemo(
        () => matrix.models.filter((m) => selected.has(m)),
        [matrix.models, selected]
    )

    const runByModel = useMemo(() => {
        const map = new Map<string, MatrixResponse['runs'][number]>()
        for (const run of matrix.runs) map.set(run.model_label, run)
        return map
    }, [matrix.runs])

    const def = CELL_METRIC_DEFS[metric]

    /**
     * For "lower is better" metrics the raw value can't drive the colour ramp
     * directly — 23 seconds would paint darker than 2 seconds and read as
     * "good". Normalise against the observed range per metric and invert when
     * needed, so a dark cell always means better on whatever is selected.
     */
    const normalize = useMemo(() => {
        if (metric === 'score_mean' || metric === 'pass_rate') {
            return (v: number | null) => v
        }
        const values: number[] = []
        for (const row of Object.values(matrix.cells)) {
            for (const [model, cell] of Object.entries(row)) {
                if (!selected.has(model)) continue
                const v = (cell as unknown as Record<string, number | null>)[metric]
                if (typeof v === 'number') values.push(v)
            }
        }
        if (values.length === 0) return () => null
        const min = Math.min(...values)
        const max = Math.max(...values)
        const span = max - min
        return (v: number | null) => {
            if (v === null || span === 0) return v === null ? null : 0.5
            const t = (v - min) / span
            return def.higherIsBetter ? t : 1 - t
        }
    }, [matrix.cells, metric, selected, def])

    const bySuite = useMemo(() => {
        const groups = new Map<string, { case_id: string; suite: string }[]>()
        for (const c of matrix.cases) {
            if (!groups.has(c.suite)) groups.set(c.suite, [])
            groups.get(c.suite)!.push(c)
        }
        return [...groups.entries()]
    }, [matrix.cases])

    if (models.length === 0) {
        return (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-10 text-center text-[13px] text-[var(--muted-foreground)]">
                Select at least one model to see the matrix.
            </div>
        )
    }

    return (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border-subtle)]">
                <div>
                    <h3 className="text-[13px] font-medium text-[var(--foreground)]">Case × model</h3>
                    <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5">
                        Click any cell to open what the model actually produced.
                    </p>
                </div>
                <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--muted)]">
                    {CELL_METRICS.map((m) => (
                        <button
                            key={m}
                            onClick={() => setMetric(m)}
                            className={cn(
                                'px-2.5 py-1 rounded-md text-[11px] transition-colors',
                                metric === m
                                    ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm'
                                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                            )}
                        >
                            {CELL_METRIC_DEFS[m].label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="overflow-x-auto custom-scrollbar">
                <div className="min-w-max">
                    {/* header row */}
                    <div className="flex sticky top-0 z-10 bg-[var(--card)] border-b border-[var(--border-subtle)]">
                        <div className="w-[230px] shrink-0 px-4 py-2 sticky left-0 bg-[var(--card)] z-10" />
                        {models.map((model) => {
                            const run = runByModel.get(model)
                            return (
                                <div
                                    key={model}
                                    className="w-[86px] shrink-0 px-1 py-2 text-center"
                                    title={model}
                                >
                                    <div className="flex flex-col items-center gap-1">
                                        <span
                                            className="h-1.5 w-1.5 rounded-full"
                                            style={{ backgroundColor: providerColor(run?.provider) }}
                                        />
                                        <span className="text-[10px] leading-tight text-[var(--muted-foreground)] break-all line-clamp-2">
                                            {model.replace('gpt-oss-120b', 'oss120b').replace('gemini-flash-lite-latest', 'flash-lite')}
                                        </span>
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {bySuite.map(([suite, cases]) => (
                        <div key={suite}>
                            <div className="flex items-center sticky left-0 bg-[var(--secondary)]/40 border-b border-[var(--border-subtle)]">
                                <span className="px-4 py-1.5 text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
                                    {suite}
                                </span>
                            </div>
                            {cases.map((c) => (
                                <div key={c.case_id} className="flex border-b border-[var(--border-subtle)] last:border-0">
                                    <div
                                        className={cn(
                                            'w-[230px] shrink-0 px-4 py-1.5 sticky left-0 bg-[var(--card)] z-10 truncate text-[12px]',
                                            hover?.caseId === c.case_id
                                                ? 'text-[var(--foreground)]'
                                                : 'text-[var(--muted-foreground)]'
                                        )}
                                        title={c.case_id}
                                    >
                                        {shortCaseId(c.case_id)}
                                    </div>
                                    {models.map((model) => {
                                        const cell = matrix.cells[c.case_id]?.[model]
                                        const raw = cell
                                            ? ((cell as unknown as Record<string, number | null>)[metric] ?? null)
                                            : null
                                        const tint = normalize(raw)
                                        const isHover = hover?.caseId === c.case_id && hover?.model === model
                                        return (
                                            <button
                                                key={model}
                                                disabled={!cell}
                                                onClick={() => cell && onOpenCell(c.case_id, model, cell)}
                                                onMouseEnter={() => setHover({ caseId: c.case_id, model })}
                                                onMouseLeave={() => setHover(null)}
                                                className={cn(
                                                    'w-[86px] shrink-0 h-8 my-0.5 mx-px rounded-md text-[11px] tabular-nums transition-all',
                                                    cell ? 'cursor-pointer' : 'cursor-default',
                                                    isHover && 'ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--card)]'
                                                )}
                                                style={{
                                                    backgroundColor: cell ? scoreTint(tint) : 'transparent',
                                                    color: cell ? scoreTextColor(tint) : 'var(--muted-foreground)',
                                                }}
                                                title={
                                                    cell
                                                        ? `${c.case_id} · ${model}\n${def.label}: ${def.format(raw)}` +
                                                          (cell.score_stdev ? `\nstdev over ${cell.n_repeats} repeats: ${cell.score_stdev.toFixed(3)}` : '') +
                                                          (cell.n_errors ? `\n${cell.n_errors} error(s)` : '')
                                                        : 'not run'
                                                }
                                            >
                                                {cell ? def.format(raw) : '·'}
                                            </button>
                                        )
                                    })}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex items-center gap-3 px-4 py-2.5 border-t border-[var(--border-subtle)]">
                <span className="text-[10px] text-[var(--muted-foreground)]">worse</span>
                <div className="flex-1 h-1.5 rounded-full max-w-[180px]"
                    style={{ background: `linear-gradient(90deg, ${scoreTint(0)}, ${scoreTint(0.5)}, ${scoreTint(1)})` }}
                />
                <span className="text-[10px] text-[var(--muted-foreground)]">better</span>
                <span className="ml-auto text-[10px] text-[var(--muted-foreground)]">
                    Empty cell = case not run for that model
                </span>
            </div>
        </div>
    )
}
