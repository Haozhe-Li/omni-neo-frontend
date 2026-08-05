'use client'

import { useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, GitCompare, Menu, RefreshCw } from 'lucide-react'
import { useBenchmarkData } from '@/components/benchmark/benchmark-provider'
import { AnchoredPanel, useAnchoredPanel } from '@/components/benchmark/popover'
import { CopyPageButton, LlmsTxtActionRow, useLlmsTxtActions } from '@/components/benchmark/llms-txt-menu'
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
 * Below `sm` the tabs and actions fold into a single hamburger menu rather
 * than trying to fit "Models · Compare · Copy Page ▾ · Refresh" on one line —
 * both halves are rendered always and toggled with Tailwind's `sm:` prefix, so
 * there is no JS media-query state and no hydration mismatch, the same
 * approach the metric bar charts use for their own desktop/phone split.
 *
 * Visually this is the same bar the blog already uses (`markdown-blog-view`):
 * sticky, h-14, translucent with a blur, one hairline rule. Reusing that means
 * the app has one top-bar language rather than two.
 */

/**
 * Where the wordmark points, and what it says. One swap on extraction.
 *
 * It points at the benchmark's own home, not at Omni's. A wordmark in a bar
 * means "the top of the thing you are in", and this section is a thing of its
 * own — it is expected to be lifted into a standalone site, where a logo that
 * navigated out of the product would be plainly wrong. Making it the section
 * root today is what that link is going to mean anyway.
 */
function BrandMark() {
    return (
        <Link href={benchRoutes.overview()} className="group flex shrink-0 items-center gap-2">
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

/** Hairline between groups of rows inside the mobile menu sheet. */
function MenuDivider() {
    return <div className="my-1 h-px bg-[var(--border-subtle)]" aria-hidden />
}

export function BenchmarkNav() {
    const pathname = usePathname()
    const { refresh, refreshing } = useBenchmarkData()
    const llmsTxtActions = useLlmsTxtActions()
    const menu = useAnchoredPanel('right')

    // A model page is a leaf of Models, not a section of its own, so it keeps
    // that tab lit rather than leaving nothing selected.
    const activeHref = pathname.startsWith(`${BENCH_BASE}/compare`)
        ? `${BENCH_BASE}/compare`
        : benchRoutes.overview()

    // Safety net for the one scenario `useAnchoredPanel` wasn't built for: its
    // trigger here is CSS-hidden above `sm` rather than always visible, so
    // resizing past that width while the sheet is open would leave it trying
    // to anchor to a trigger that is no longer on screen. Closing it on the
    // crossing is simpler than teaching the shared hook about a trigger that
    // can disappear.
    useEffect(() => {
        if (!menu.open) return
        const mq = window.matchMedia('(min-width: 640px)')
        const onChange = () => {
            if (mq.matches) menu.setOpen(false)
        }
        mq.addEventListener('change', onChange)
        return () => mq.removeEventListener('change', onChange)
    }, [menu.open, menu.setOpen])

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

                {/* ── sm and up: tabs on the left half, actions on the right ── */}
                <div className="hidden min-w-0 flex-1 items-center justify-between gap-3 sm:flex">
                    <nav className="flex min-w-0 items-center gap-0.5">
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

                    {/* Refresh is deliberately the quietest thing in the bar: an
                        icon with no label, no border, no background — reachable
                        from anywhere in the section (the whole reason it lives in
                        the header and not on each page) without competing with
                        Copy Page for attention. */}
                    <div className="flex shrink-0 items-center gap-1">
                        <CopyPageButton actions={llmsTxtActions} />
                        <button
                            onClick={refresh}
                            disabled={refreshing}
                            title="Clear the server cache and reload from the database"
                            aria-label="Refresh benchmark data"
                            className={cn(
                                'inline-flex items-center rounded-lg p-1.5 transition-colors',
                                refreshing
                                    ? 'cursor-wait text-[var(--muted-foreground)]'
                                    : 'text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]'
                            )}
                        >
                            <RefreshCw
                                className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')}
                                strokeWidth={1.5}
                            />
                        </button>
                    </div>
                </div>

                {/* ── below sm: everything folds into one menu ── */}
                <div className="ml-auto flex items-center sm:hidden">
                    <button
                        ref={menu.triggerRef}
                        type="button"
                        onClick={() => menu.setOpen(!menu.open)}
                        aria-haspopup="menu"
                        aria-expanded={menu.open}
                        aria-label="Menu"
                        className="inline-flex items-center rounded-lg p-2 text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
                    >
                        <Menu className="h-5 w-5" strokeWidth={1.5} />
                    </button>

                    <AnchoredPanel state={menu} ariaLabel="Benchmark menu" role="menu">
                        {SECTIONS.map(({ href, label, icon: Icon }) => {
                            const active = href === activeHref
                            return (
                                <Link
                                    key={href}
                                    href={href}
                                    aria-current={active ? 'page' : undefined}
                                    onClick={() => menu.setOpen(false)}
                                    className={cn(
                                        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors',
                                        active
                                            ? 'bg-[var(--muted)] font-medium text-[var(--foreground)]'
                                            : 'text-[var(--foreground)] hover:bg-[var(--muted)]'
                                    )}
                                >
                                    <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)]" strokeWidth={1.5} />
                                    {label}
                                </Link>
                            )
                        })}

                        <MenuDivider />

                        {llmsTxtActions.map((action) => (
                            <LlmsTxtActionRow
                                key={action.key}
                                action={action}
                                onNavigate={() => menu.setOpen(false)}
                            />
                        ))}

                        <MenuDivider />

                        <button
                            type="button"
                            onClick={refresh}
                            disabled={refreshing}
                            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[var(--foreground)] transition-colors hover:bg-[var(--muted)] disabled:cursor-wait"
                        >
                            <RefreshCw
                                className={cn('h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)]', refreshing && 'animate-spin')}
                                strokeWidth={1.5}
                            />
                            {refreshing ? 'Refreshing…' : 'Refresh data'}
                        </button>
                    </AnchoredPanel>
                </div>
            </div>
        </header>
    )
}
