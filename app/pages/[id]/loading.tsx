import { PagesShell } from '@/components/pages-shell'

/**
 * Route-level Suspense fallback for /pages/[id] — same reasoning as the list
 * route's sibling loading.tsx: without it, Next blocks the navigation on
 * the *previous* screen until this route's own Redis read
 * (app/pages/[id]/page.tsx) resolves. Mirrors PagesDetailView's toolbar
 * height and reading-column width so the swap-in doesn't jump the layout.
 */
export default function PageDetailLoading() {
    return (
        <PagesShell>
            <div className="flex h-full w-full flex-col">
                <div className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--border-subtle)] px-4">
                    <div className="h-4 w-16 animate-pulse rounded bg-[var(--secondary)]" />
                    <div className="flex-1" />
                    <div className="h-8 w-20 animate-pulse rounded-lg bg-[var(--secondary)]" />
                </div>
                <div className="flex-1 overflow-y-auto">
                    <div className="mx-auto max-w-3xl px-6 py-10 sm:px-8">
                        <div className="h-8 w-2/3 animate-pulse rounded-md bg-[var(--secondary)]" />
                        <div className="mt-8 space-y-3">
                            {Array.from({ length: 8 }).map((_, i) => (
                                <div
                                    key={i}
                                    className="h-4 animate-pulse rounded bg-[var(--secondary)]"
                                    style={{ width: `${85 - (i % 4) * 12}%` }}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </PagesShell>
    )
}
