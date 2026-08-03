'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, Check, AlertCircle, Wrench, FileText, ListChecks, MessageSquare, BookOpen } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useEvalFetch } from '@/hooks/useBenchmark'
import {
    type EvalCheck,
    type EvalResultDetail,
    type EvalResultSummary,
    type TraceStep,
    fmtCost,
    fmtMs,
    fmtScore,
    fmtTokens,
} from '@/lib/benchmark'
import { cn } from '@/lib/utils'

interface ResultDrawerProps {
    open: boolean
    caseId: string | null
    modelLabel: string | null
    runId: string | null
    onClose: () => void
}

type Tab = 'checks' | 'answer' | 'report' | 'trace'

/**
 * What one model actually did on one case.
 *
 * The list endpoint deliberately omits `trace`, `final_texts` and `report_md`
 * (they run to hundreds of kilobytes per row), so this fetches the run's
 * results to find the right id and then pulls that one result in full. Two
 * requests, only on open.
 */
export function ResultDrawer({ open, caseId, modelLabel, runId, onClose }: ResultDrawerProps) {
    const { fetchEval } = useEvalFetch()
    const [tab, setTab] = useState<Tab>('checks')
    const [detail, setDetail] = useState<EvalResultDetail | null>(null)
    const [checks, setChecks] = useState<EvalCheck[]>([])
    const [repeats, setRepeats] = useState<EvalResultSummary[]>([])
    const [activeRepeat, setActiveRepeat] = useState(0)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!open || !caseId || !runId) return
        let cancelled = false
        setLoading(true)
        setError(null)
        setDetail(null)
        setChecks([])
        setTab('checks')

        fetchEval<{ results: EvalResultSummary[] }>(`runs/${runId}/results`, { case_id: caseId })
            .then(async ({ results }) => {
                if (cancelled) return
                setRepeats(results)
                if (results.length === 0) {
                    setError('No execution recorded for this cell.')
                    setLoading(false)
                    return
                }
                setActiveRepeat(0)
                const full = await fetchEval<{ result: EvalResultDetail; checks: EvalCheck[] }>(
                    `results/${results[0].result_id}`
                )
                if (cancelled) return
                setDetail(full.result)
                setChecks(full.checks)
                setLoading(false)
            })
            .catch((e: Error) => {
                if (cancelled) return
                setError(e.message)
                setLoading(false)
            })

        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, caseId, runId])

    const loadRepeat = async (index: number) => {
        const target = repeats[index]
        if (!target) return
        setActiveRepeat(index)
        setLoading(true)
        try {
            const full = await fetchEval<{ result: EvalResultDetail; checks: EvalCheck[] }>(
                `results/${target.result_id}`
            )
            setDetail(full.result)
            setChecks(full.checks)
        } catch (e) {
            setError((e as Error).message)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
        if (open) window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [open, onClose])

    const failed = useMemo(() => checks.filter((c) => c.passed === false), [checks])

    if (!open) return null

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            <div
                className="absolute inset-0 bg-black/25 backdrop-blur-[2px] animate-in fade-in duration-150"
                onClick={onClose}
            />
            <div className="relative w-full max-w-2xl h-full bg-[var(--background)] border-l border-[var(--border-subtle)] flex flex-col animate-in slide-in-from-right duration-200">
                {/* header */}
                <div className="shrink-0 px-5 py-4 border-b border-[var(--border-subtle)]">
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <div className="text-[11px] uppercase tracking-wider text-[var(--muted-foreground)]">
                                {modelLabel}
                            </div>
                            <h2 className="mt-0.5 text-[16px] font-semibold text-[var(--foreground)] truncate">
                                {caseId}
                            </h2>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-1.5 -mr-1.5 rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)] transition-colors"
                        >
                            <X className="h-4 w-4" strokeWidth={1.5} />
                        </button>
                    </div>

                    {detail && (
                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-[var(--muted-foreground)]">
                            <Metric label="score" value={fmtScore(detail.score)} strong />
                            <Metric label="turns" value={String(detail.n_llm_turns ?? '—')} />
                            <Metric label="tools" value={String(detail.n_tool_calls ?? '—')} />
                            <Metric label="ttft" value={fmtMs(detail.ttft_ms)} />
                            <Metric label="answer at" value={fmtMs(detail.ttft_answer_ms)} />
                            <Metric label="total" value={fmtMs(detail.latency_ms)} />
                            <Metric
                                label="tokens"
                                value={fmtTokens((detail.input_tokens ?? 0) + (detail.output_tokens ?? 0))}
                            />
                            <Metric label="cost" value={fmtCost(detail.cost_usd)} />
                        </div>
                    )}

                    {detail && detail.skills_loaded?.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] text-[var(--muted-foreground)]">skills</span>
                            {detail.skills_loaded.map((s) => (
                                <span
                                    key={s}
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent)]/12 text-[var(--accent)]"
                                >
                                    {s}
                                </span>
                            ))}
                        </div>
                    )}

                    {detail?.hit_run_limit && (
                        <div className="mt-2.5 flex items-start gap-1.5 text-[11px] text-[var(--warning)]">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-px" strokeWidth={1.5} />
                            <span>
                                Hit the tool-call limit — the answer is truncated, so every score below is a
                                score on an incomplete run.
                            </span>
                        </div>
                    )}

                    {repeats.length > 1 && (
                        <div className="mt-3 flex items-center gap-1.5">
                            <span className="text-[11px] text-[var(--muted-foreground)]">repeat</span>
                            {repeats.map((r, i) => (
                                <button
                                    key={r.result_id}
                                    onClick={() => loadRepeat(i)}
                                    className={cn(
                                        'px-2 py-0.5 rounded-md text-[11px] tabular-nums transition-colors',
                                        i === activeRepeat
                                            ? 'bg-[var(--accent)] text-white'
                                            : 'bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                                    )}
                                >
                                    #{r.repeat_idx} · {fmtScore(r.score, 2)}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* tabs */}
                <div className="shrink-0 flex items-center gap-1 px-4 py-2 border-b border-[var(--border-subtle)]">
                    <TabButton icon={ListChecks} active={tab === 'checks'} onClick={() => setTab('checks')}>
                        Rubric{failed.length > 0 && <Pill>{failed.length}</Pill>}
                    </TabButton>
                    <TabButton icon={MessageSquare} active={tab === 'answer'} onClick={() => setTab('answer')}>
                        Answer
                    </TabButton>
                    <TabButton
                        icon={BookOpen}
                        active={tab === 'report'}
                        onClick={() => setTab('report')}
                        disabled={!detail?.report_md}
                    >
                        Report
                    </TabButton>
                    <TabButton icon={Wrench} active={tab === 'trace'} onClick={() => setTab('trace')}>
                        Trace{detail?.trace ? <Pill>{detail.trace.length}</Pill> : null}
                    </TabButton>
                </div>

                {/* body */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {loading && <p className="p-5 text-[13px] text-[var(--muted-foreground)]">Loading…</p>}
                    {error && !loading && <p className="p-5 text-[13px] text-[var(--warning)]">{error}</p>}
                    {!loading && detail && (
                        <>
                            {tab === 'checks' && <ChecksPanel checks={checks} />}
                            {tab === 'answer' && <AnswerPanel texts={detail.final_texts ?? []} />}
                            {tab === 'report' && <ReportPanel title={detail.report_title} md={detail.report_md} />}
                            {tab === 'trace' && <TracePanel steps={detail.trace ?? []} />}
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

function ChecksPanel({ checks }: { checks: EvalCheck[] }) {
    // Failures first, then by weight: the reason anyone opens this tab is to
    // find what broke, and a passing weight-1 formatting check should never sit
    // above a failed weight-3 one.
    const ordered = useMemo(
        () =>
            [...checks].sort((a, b) => {
                const af = a.passed === false ? 0 : 1
                const bf = b.passed === false ? 0 : 1
                if (af !== bf) return af - bf
                return b.weight - a.weight
            }),
        [checks]
    )

    const deterministic = ordered.filter((c) => c.kind === 'deterministic')
    const judge = ordered.filter((c) => c.kind === 'judge')

    return (
        <div className="p-4 space-y-5">
            <CheckGroup title="Deterministic" subtitle="Parsed from the output and trace — zero variance" checks={deterministic} />
            <CheckGroup title="LLM judge" subtitle="Scored 0–2 with a required quote as evidence" checks={judge} />
        </div>
    )
}

function CheckGroup({ title, subtitle, checks }: { title: string; subtitle: string; checks: EvalCheck[] }) {
    if (checks.length === 0) return null
    return (
        <div>
            <div className="mb-2">
                <h4 className="text-[12px] font-medium text-[var(--foreground)]">{title}</h4>
                <p className="text-[11px] text-[var(--muted-foreground)]">{subtitle}</p>
            </div>
            <div className="space-y-1.5">
                {checks.map((check) => {
                    const passed = check.passed !== false
                    const partial = !passed && check.score > 0
                    return (
                        <div
                            key={check.check_id}
                            className={cn(
                                'rounded-lg border px-3 py-2',
                                passed
                                    ? 'border-[var(--border-subtle)] bg-[var(--card)]'
                                    : 'border-[var(--warning)]/30 bg-[var(--warning)]/[0.06]'
                            )}
                        >
                            <div className="flex items-start gap-2">
                                <span className="mt-0.5 shrink-0">
                                    {passed ? (
                                        <Check className="h-3.5 w-3.5 text-[var(--accent)]" strokeWidth={2} />
                                    ) : (
                                        <AlertCircle className="h-3.5 w-3.5 text-[var(--warning)]" strokeWidth={2} />
                                    )}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-baseline gap-2 flex-wrap">
                                        <span className="text-[12px] text-[var(--foreground)] font-medium break-all">
                                            {check.key}
                                        </span>
                                        {check.weight >= 2 && (
                                            <span className="text-[9px] px-1 py-px rounded bg-[var(--muted)] text-[var(--muted-foreground)] uppercase tracking-wide">
                                                w{check.weight}
                                            </span>
                                        )}
                                        {check.turn !== null && (
                                            <span className="text-[10px] text-[var(--muted-foreground)]">
                                                turn {check.turn}
                                            </span>
                                        )}
                                        <span className="ml-auto text-[11px] tabular-nums text-[var(--muted-foreground)]">
                                            {check.score}/{check.max_score}
                                            {partial && ' (partial)'}
                                        </span>
                                    </div>
                                    {/* Evidence is the whole value of a failed row: a red line that
                                        doesn't say what was wrong costs more time than it saves. */}
                                    {check.evidence && (
                                        <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted-foreground)] break-words">
                                            {check.evidence}
                                        </p>
                                    )}
                                    {check.reason && check.reason !== check.evidence && (
                                        <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted-foreground)] italic break-words">
                                            {check.reason}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

function AnswerPanel({ texts }: { texts: string[] }) {
    if (texts.length === 0) {
        return <p className="p-5 text-[13px] text-[var(--muted-foreground)]">No answer text recorded.</p>
    }
    return (
        <div className="p-4 space-y-4">
            {texts.map((text, i) => (
                <div key={i}>
                    {texts.length > 1 && (
                        <div className="mb-1.5 text-[11px] uppercase tracking-wider text-[var(--muted-foreground)]">
                            Turn {i}
                        </div>
                    )}
                    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--card)] p-3">
                        <pre className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-[var(--foreground)] font-sans">
                            {text}
                        </pre>
                    </div>
                </div>
            ))}
        </div>
    )
}

function ReportPanel({ title, md }: { title: string | null; md: string | null }) {
    if (!md) return <p className="p-5 text-[13px] text-[var(--muted-foreground)]">No report in this run.</p>
    return (
        <div className="p-4">
            {title && (
                <div className="mb-2 flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 text-[var(--muted-foreground)]" strokeWidth={1.5} />
                    <h4 className="text-[13px] font-medium text-[var(--foreground)]">{title}</h4>
                </div>
            )}
            <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-semibold prose-p:text-[13px] prose-li:text-[13px] prose-headings:text-[var(--foreground)] prose-p:text-[var(--foreground)]">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
            </div>
        </div>
    )
}

const SKILL_READ = /^\/skills\/([^/]+)\/SKILL\.md$/

function TracePanel({ steps }: { steps: TraceStep[] }) {
    if (steps.length === 0) {
        return <p className="p-5 text-[13px] text-[var(--muted-foreground)]">No tool calls.</p>
    }
    return (
        <div className="p-4">
            <ol className="relative border-l border-[var(--border-subtle)] ml-2 space-y-3">
                {steps.map((step) => {
                    const path = String(step.args?.file_path ?? '')
                    const skill = step.name === 'read_file' ? SKILL_READ.exec(path)?.[1] : null
                    return (
                        <li key={`${step.turn}-${step.i}`} className="ml-4">
                            {/* Skill loads are highlighted because they are the single most
                                important signal in the whole trace: progressive disclosure
                                means "did it pick the right skill" is literally this call. */}
                            <span
                                className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--background)]"
                                style={{ backgroundColor: skill ? 'var(--accent)' : 'var(--muted-foreground)' }}
                            />
                            <div className="flex items-baseline gap-2 flex-wrap">
                                <span className="text-[11px] tabular-nums text-[var(--muted-foreground)]">
                                    {step.i}
                                </span>
                                <span
                                    className={cn(
                                        'text-[12px] font-medium',
                                        skill ? 'text-[var(--accent)]' : 'text-[var(--foreground)]'
                                    )}
                                >
                                    {skill ? `load skill: ${skill}` : step.name}
                                </span>
                            </div>
                            {!skill && Object.keys(step.args ?? {}).length > 0 && (
                                <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)] break-words font-mono">
                                    {Object.entries(step.args)
                                        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
                                        .join('  ')
                                        .slice(0, 260)}
                                </p>
                            )}
                            {step.result_head && (
                                <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted-foreground)] break-words line-clamp-3">
                                    {step.result_head}
                                </p>
                            )}
                        </li>
                    )
                })}
            </ol>
        </div>
    )
}

function Metric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
    return (
        <span className="inline-flex items-baseline gap-1">
            <span>{label}</span>
            <span className={cn('tabular-nums', strong ? 'text-[var(--foreground)] font-medium' : 'text-[var(--foreground)]')}>
                {value}
            </span>
        </span>
    )
}

function TabButton({
    icon: Icon,
    active,
    onClick,
    disabled,
    children,
}: {
    icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
    active: boolean
    onClick: () => void
    disabled?: boolean
    children: React.ReactNode
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] transition-colors',
                active
                    ? 'bg-[var(--secondary)] text-[var(--foreground)]'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
                disabled && 'opacity-40 cursor-not-allowed hover:text-[var(--muted-foreground)]'
            )}
        >
            <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
            {children}
        </button>
    )
}

function Pill({ children }: { children: React.ReactNode }) {
    return (
        <span className="ml-1 px-1.5 py-px rounded-full bg-[var(--warning)]/20 text-[var(--warning)] text-[10px] tabular-nums">
            {children}
        </span>
    )
}
