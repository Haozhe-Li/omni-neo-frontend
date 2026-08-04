'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { useBenchmarkData } from '@/components/benchmark/benchmark-provider'
import { cn } from '@/lib/utils'

/**
 * The frame every benchmark route renders inside: title, run-batch filter,
 * refresh, and a back link once you are below the overview.
 *
 * It lives in the layout rather than in each page so the header does not
 * unmount and remount as you move between routes — the filter keeps its value
 * and the refresh button keeps its spinner across navigation.
 */
export function BenchmarkShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const { labels, label, setLabel, refresh, refreshing, note, error } = useBenchmarkData()
    const isRoot = pathname === '/benchmark'

    return (
        <div className="min-h-screen">
            {/* Refresh progress rail. Pinned to the viewport so it stays visible
                when you refresh from halfway down a long page. */}
            <div
                className={cn(
                    'fixed inset-x-0 top-0 z-50 h-0.5 transition-opacity duration-200',
                    refreshing ? 'opacity-100' : 'pointer-events-none opacity-0'
                )}
            >
                <div className="animate-shimmer h-full w-full" />
            </div>

            <div className="mx-auto w-full max-w-[1280px] px-4 pb-20 sm:px-6">
                <header className="pt-8 pb-5 sm:pt-10">
                    {!isRoot && (
                        <Link
                            href="/benchmark"
                            className="mb-3 inline-flex items-center gap-1.5 text-[12px] text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
                        >
                            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
                            All models
                        </Link>
                    )}

                    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
                        <div className="min-w-0">
                            <Link
                                href="/benchmark"
                                className="text-[24px] font-semibold tracking-tight text-[var(--foreground)] sm:text-[28px]"
                            >
                                Benchmarks
                            </Link>
                            <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-[var(--muted-foreground)]">
                                How each model behaves in Omni&apos;s pro mode — skill triggering, output
                                contracts, answer quality, and what it costs to get there.
                            </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                            {labels.length > 0 && (
                                <select
                                    value={label}
                                    onChange={(e) => setLabel(e.target.value)}
                                    aria-label="Run batch"
                                    className="max-w-[46vw] cursor-pointer truncate rounded-lg border border-[var(--border-subtle)] bg-[var(--card)] px-2.5 py-1.5 text-[12px] text-[var(--foreground)] outline-none transition-colors focus:border-[var(--accent)]"
                                >
                                    <option value="">All run batches</option>
                                    {labels.map((l) => (
                                        <option key={l} value={l}>
                                            {l}
                                        </option>
                                    ))}
                                </select>
                            )}
                            <button
                                onClick={refresh}
                                disabled={refreshing}
                                title="Clear the server cache and reload from the database"
                                className={cn(
                                    'inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--card)] px-2.5 py-1.5 text-[12px] transition-colors',
                                    refreshing
                                        ? 'cursor-wait text-[var(--muted-foreground)]'
                                        : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                                )}
                            >
                                <RefreshCw
                                    className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')}
                                    strokeWidth={1.5}
                                />
                                <span className="hidden sm:inline">
                                    {refreshing ? 'Refreshing…' : 'Refresh'}
                                </span>
                            </button>
                        </div>
                    </div>

                    {note && (
                        <p className="mt-2 text-right text-[11px] text-[var(--muted-foreground)]">{note}</p>
                    )}
                </header>

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
