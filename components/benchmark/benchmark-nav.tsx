'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, GitCompare, RefreshCw } from 'lucide-react'
import { useBenchmarkData } from '@/components/benchmark/benchmark-provider'
import { BENCH_BASE, benchRoutes } from '@/lib/benchmark'
import { cn } from '@/lib/utils'

/**
 * The section's top bar.
 *
 * Flat and top-level — brand, then sections, then actions — rather than a
 * breadcrumb hanging off Omni's own navigation. That shape is deliberate: this
 * section is expected to be lifted into a site of its own, and a breadcrumb
 * (`omniknows / Benchmarks / …`) encodes "subordinate to Omni" into the
 * navigation itself, which is exactly what would have to be torn out on that
 * day. A flat bar survives the move by swapping one component.
 *
 * Structurally it holds more than it currently shows: methodology and a
 * changelog are the obvious next sections for a standalone benchmark site, and
 * an actions slot sits ready on the right. Only what exists is rendered — the
 * layout just does not have to be rebuilt to admit the rest.
 *
 * Visually this is the same bar the blog already uses (`markdown-blog-view`):
 * sticky, h-14, translucent with a blur, one hairline rule. Reusing that means
 * the app has one top-bar language rather than two.
 */

/** Where the wordmark points, and what it says. One swap on extraction. */
function BrandMark() {
    return (
        <Link href="/" className="group flex shrink-0 items-center gap-2">
            <Image
                src="/android-chrome-512x512.png"
                alt=""
                width={20}
                height={20}
                className="rounded-lg"
            />
            <span className="font-[family-name:var(--font-plex)] text-[14px] font-light lowercase tracking-tight text-[var(--muted-foreground)] transition-colors group-hover:text-[var(--foreground)]">
                omni<span className="font-normal text-[var(--accent)]">knows</span>
            </span>
        </Link>
    )
}

const SECTIONS = [
    { href: benchRoutes.overview(), label: 'Models', icon: BarChart3 },
    { href: `${BENCH_BASE}/compare`, label: 'Compare', icon: GitCompare },
]

export function BenchmarkNav() {
    const pathname = usePathname()
    const { refresh, refreshing } = useBenchmarkData()

    // A model page is a leaf of Models, not a section of its own, so it keeps
    // that tab lit rather than leaving nothing selected.
    const activeHref = pathname.startsWith(`${BENCH_BASE}/compare`)
        ? `${BENCH_BASE}/compare`
        : benchRoutes.overview()

    return (
        <header className="sticky top-0 z-40 border-b border-[var(--border-subtle)] bg-[var(--background)]/85 backdrop-blur-xl">
            {/* Refresh progress rail, hairline along the bar's bottom edge. */}
            <div
                className={cn(
                    'pointer-events-none absolute inset-x-0 bottom-0 h-0.5 transition-opacity duration-200',
                    refreshing ? 'opacity-100' : 'opacity-0'
                )}
            >
                <div className="animate-shimmer h-full w-full" />
            </div>

            <div className="mx-auto flex h-14 w-full max-w-[1280px] items-center gap-3 px-4 sm:gap-5 sm:px-6">
                <BrandMark />

                <span
                    aria-hidden
                    className="hidden h-4 w-px shrink-0 bg-[var(--border)] sm:block"
                />

                <nav className="flex min-w-0 flex-1 items-center gap-0.5">
                    {SECTIONS.map(({ href, label, icon: Icon }) => {
                        const active = href === activeHref
                        return (
                            <Link
                                key={href}
                                href={href}
                                aria-current={active ? 'page' : undefined}
                                className={cn(
                                    'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors sm:px-3',
                                    active
                                        ? 'bg-[var(--muted)] font-medium text-[var(--foreground)]'
                                        : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                                )}
                            >
                                <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
                                {label}
                            </Link>
                        )
                    })}
                </nav>

                {/* Actions. Currently one button; the slot is where a standalone
                    site's account or upgrade affordance would live. */}
                <div className="flex shrink-0 items-center gap-2">
                    <button
                        onClick={refresh}
                        disabled={refreshing}
                        title="Clear the server cache and reload from the database"
                        aria-label="Refresh benchmark data"
                        className={cn(
                            'inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--card)] px-2 py-1.5 text-[12px] transition-colors sm:px-2.5',
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
        </header>
    )
}
