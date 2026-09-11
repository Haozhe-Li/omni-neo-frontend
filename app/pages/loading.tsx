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
 * row, a stack of feed-row cards) so the swap-in doesn't jump the page around.
 */
export default function PagesLoading() {
    return (
        <PagesShell>
            <div className="h-full overflow-y-auto custom-scrollbar">
                <div className="mx-auto max-w-[1000px] px-6 sm:px-10">
                    <section className="pt-10 sm:pt-11 pb-7">
                        <div className="h-3.5 w-40 rounded-md bg-[var(--sand)] animate-pulse" />
                        <div className="mt-3 h-9 w-28 rounded-md bg-[var(--sand)] animate-pulse" />
                    </section>

                    <section className="pb-10">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-3 mb-6">
                            <div className="h-8 w-full sm:w-56 rounded-full bg-[var(--sand)] animate-pulse" />
                            <div className="h-8 w-20 shrink-0 rounded-full bg-[var(--sand)] animate-pulse" />
                        </div>

                        <div className="flex flex-col gap-3.5">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div
                                    key={i}
                                    className="flex flex-col gap-3 rounded-[26px] border border-[var(--line)] bg-[var(--paper-raised)] px-[30px] pb-[18px] pt-[22px]"
                                >
                                    <div className="flex items-center gap-2.5">
                                        <div className="h-[26px] w-[26px] shrink-0 animate-pulse rounded-full bg-[var(--sand)]" />
                                        <div className="h-3 w-24 animate-pulse rounded bg-[var(--sand)]" />
                                        <div className="h-3 w-16 animate-pulse rounded bg-[var(--sand)]" />
                                    </div>
                                    <div className="h-6 w-3/4 animate-pulse rounded bg-[var(--sand)]" />
                                    <div className="h-4 w-full max-w-[68ch] animate-pulse rounded bg-[var(--sand)]" />
                                    <div className="mt-1 flex items-center justify-between gap-3 border-t border-[var(--line-hair)] pt-3">
                                        <div className="h-3 w-24 animate-pulse rounded bg-[var(--sand)]" />
                                        <div className="h-7 w-40 animate-pulse rounded-full bg-[var(--sand)]" />
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
