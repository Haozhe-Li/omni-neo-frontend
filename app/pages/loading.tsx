import { PagesShell } from '@/components/pages-shell'

/**
 * Route-level Suspense fallback for /pages.
 *
 * Without this file, Next holds the whole navigation on the *previous*
 * screen until `OmniPagesList` (app/pages/page.tsx) finishes its Redis
 * round-trip — clicking "Pages" in the sidebar would visibly stall for a
 * couple of seconds before anything moved. This file is enough on its own:
 * Next wraps the route segment in a Suspense boundary automatically, so the
 * navigation completes immediately (this skeleton paints at once, `<PagesShell>`
 * and all) and the real grid swaps in once the data streams in behind it —
 * no change needed to the page's own data fetching.
 *
 * Mirrors PagesClient/PagesGrid's actual layout (header, count + search/sort
 * row, a 3-column card grid) so the swap-in doesn't jump the page around.
 */
export default function PagesLoading() {
    return (
        <PagesShell>
            <div className="h-full overflow-y-auto custom-scrollbar">
                <div className="max-w-6xl mx-auto px-6">
                    <section className="pt-10 sm:pt-14 pb-6">
                        <div className="h-7 w-28 rounded-md bg-[var(--secondary)] animate-pulse" />
                        <div className="mt-2.5 h-4 w-80 max-w-full rounded-md bg-[var(--secondary)] animate-pulse" />
                    </section>

                    <section className="pb-8 sm:pb-10">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                            <div className="h-4 w-16 rounded-md bg-[var(--secondary)] animate-pulse" />
                            <div className="flex items-center gap-3">
                                <div className="h-9 w-full sm:w-64 rounded-xl bg-[var(--secondary)] animate-pulse" />
                                <div className="h-9 w-24 shrink-0 rounded-xl bg-[var(--secondary)] animate-pulse" />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <div
                                    key={i}
                                    className="flex flex-col overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)]"
                                >
                                    <div className="aspect-[16/9] w-full animate-pulse bg-[var(--secondary)]" />
                                    <div className="px-4 pt-3.5 pb-4">
                                        <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--secondary)]" />
                                        <div className="mt-2 h-4 w-1/2 animate-pulse rounded bg-[var(--secondary)]" />
                                    </div>
                                    <div className="mt-auto border-t border-[var(--border-subtle)] px-4 pt-3 pb-4">
                                        <div className="flex items-center justify-between">
                                            <div className="h-3 w-20 animate-pulse rounded bg-[var(--secondary)]" />
                                            <div className="h-3 w-16 animate-pulse rounded bg-[var(--secondary)]" />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            </div>
        </PagesShell>
    )
}
