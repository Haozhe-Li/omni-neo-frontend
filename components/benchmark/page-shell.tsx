'use client'

import { useBenchmarkData } from '@/components/benchmark/benchmark-provider'
import { BenchmarkNav } from '@/components/benchmark/benchmark-nav'
import { cn } from '@/lib/utils'

/**
 * The frame every benchmark route renders inside.
 *
 * It deliberately renders no title. An earlier version put "Benchmarks" and a
 * description here, which meant the compare page showed two stacked headings
 * and two descriptions before any data, and the model page pushed the model's
 * own name to the third line. A shared frame can own navigation; it cannot own
 * a heading, because only the page knows what it is about.
 */
export function BenchmarkShell({ children }: { children: React.ReactNode }) {
    const { note, error } = useBenchmarkData()

    return (
        <div className="omni-bench min-h-screen bg-[var(--background)]">
            <BenchmarkNav />

            <div className="mx-auto w-full max-w-[1280px] px-4 pb-20 pt-6 sm:px-6 sm:pt-8">
                {note && (
                    <p className="mb-3 text-right text-[11px] text-[var(--muted-foreground)]">{note}</p>
                )}

                {error ? (
                    <div className="rounded-xl border border-[var(--warning)]/30 bg-[var(--warning)]/[0.06] px-4 py-3">
                        <p className="text-[13px] text-[var(--foreground)]">{error}</p>
                        <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                            The backend must be running and the eval tables created
                            (evals/schema_evals.sql).
                        </p>
                    </div>
                ) : (
                    children
                )}
            </div>
        </div>
    )
}

/**
 * A page's own heading.
 *
 * Each route renders exactly one of these, which is what stops the section
 * repeating itself. `aside` is where a page-level control goes — the run-batch
 * filter is one, and it belongs to the page rather than the nav bar: it is used
 * rarely, it only affects what the page below it shows, and on a phone it is
 * the one thing that would not fit in the bar.
 */
export function PageHeading({
    title,
    description,
    aside,
}: {
    title: string
    description?: string
    aside?: React.ReactNode
}) {
    return (
        <header className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
            <div className="min-w-0">
                <h1 className="text-[24px] font-semibold tracking-tight text-[var(--foreground)] sm:text-[28px]">
                    {title}
                </h1>
                {description && (
                    <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-[var(--muted-foreground)]">
                        {description}
                    </p>
                )}
            </div>
            {aside && <div className="shrink-0">{aside}</div>}
        </header>
    )
}

/** The run-batch filter, rendered by whichever page wants it. */
export function BatchFilter() {
    const { labels, label, setLabel } = useBenchmarkData()
    if (labels.length === 0) return null

    return (
        <label className="flex items-center gap-2">
            <span className="text-[11px] text-[var(--muted-foreground)]">Batch</span>
            <select
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className={cn(
                    'max-w-[52vw] cursor-pointer truncate rounded-lg border border-[var(--border-subtle)]',
                    'bg-[var(--card)] px-2.5 py-1.5 text-[12px] text-[var(--foreground)]',
                    'outline-none transition-colors focus:border-[var(--accent)]'
                )}
            >
                <option value="">All run batches</option>
                {labels.map((l) => (
                    <option key={l} value={l}>
                        {l}
                    </option>
                ))}
            </select>
        </label>
    )
}

/** Shown on the overview when the tables exist but nothing has been run yet. */
export function EmptyState() {
    return (
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] px-6 py-14 text-center">
            <p className="text-[14px] text-[var(--foreground)]">No evaluation runs yet.</p>
            <p className="mt-1.5 text-[12px] text-[var(--muted-foreground)]">
                Run{' '}
                <code className="rounded bg-[var(--muted)] px-1 py-0.5">
                    python -m evals.cli --smoke --models all
                </code>{' '}
                to populate this page.
            </p>
        </div>
    )
}
