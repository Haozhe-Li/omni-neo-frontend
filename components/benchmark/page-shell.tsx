'use client'

import { useBenchmarkData } from '@/components/benchmark/benchmark-provider'
import { BenchmarkNav } from '@/components/benchmark/benchmark-nav'
import { ModelFilter as FilterMenu } from '@/components/benchmark/model-filter'

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

                <BenchmarkFooter />
            </div>
        </div>
    )
}

/**
 * Same footer as the rest of the site.
 *
 * Shown at every width, unlike the home page's `hidden md:flex` version: these
 * pages are public, shareable and meant to stand on their own, and the one
 * place that says who made them and who holds the copyright should not be the
 * thing that disappears on a phone.
 */
function BenchmarkFooter() {
    return (
        <footer className="mt-14 flex w-full flex-col items-center justify-center gap-4 py-6">
            <div className="flex flex-col items-center gap-1 text-[10px] text-[var(--muted-foreground)]/60">
                <p>
                    &copy; {new Date().getFullYear()}{' '}
                    <a
                        href="https://omniknows.xyz"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-[family-name:var(--font-plex)] underline decoration-[var(--muted-foreground)]/30 underline-offset-2 transition-colors hover:text-[var(--foreground)] hover:decoration-[var(--foreground)]"
                    >
                        Omni Knows
                    </a>
                    {'. All rights reserved.'}
                </p>
                <p>
                    Made with love by{' '}
                    <a
                        href="https://haozhe.li"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-[var(--muted-foreground)]/30 underline-offset-2 transition-colors hover:text-[var(--foreground)] hover:decoration-[var(--foreground)]"
                    >
                        Haozhe Li
                    </a>
                </p>
            </div>
        </footer>
    )
}

/**
 * A page's own heading.
 *
 * Each route renders exactly one of these, which is what stops the section
 * repeating itself. `aside` is where a page-level control goes — the roster
 * filter is one, and it belongs to the page rather than the nav bar: it only
 * affects what the page below it shows, and on a phone it is the one thing
 * that would not fit in the bar.
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

/**
 * The roster filter, rendered by whichever page shows a list of models.
 *
 * Re-exported here so pages keep importing their header furniture from one
 * place — see model-filter.tsx for the component itself.
 */
export function ModelFilter() {
    return <FilterMenu />
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
