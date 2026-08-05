'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, GitCompare, Menu, RefreshCw } from 'lucide-react'
import { useBenchmarkData } from '@/components/benchmark/benchmark-provider'
import { AnchoredPanel, useAnchoredPanel } from '@/components/benchmark/popover'
import { CopyPageButton, LlmsTxtActionRow, useLlmsTxtActions } from '@/components/benchmark/llms-txt-menu'
import { BENCH_BASE, benchRoutes } from '@/lib/benchmark'
import { cn } from '@/lib/utils'

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const lerp = (from: number, to: number, t: number) => from + (to - from) * t

/**
 * How far past the top of the page the bar takes to go from flush-and-square
 * to fully docked-and-pill, in scroll pixels. Starting the range a little
 * below 0 rather than at it means the very first frame of scroll doesn't
 * instantly kick the bar into motion — there's a short dead zone before it
 * starts reacting, which reads as more deliberate than "the instant your
 * finger moves."
 */
const COLLAPSE_RANGE: [number, number] = [16, 220]

/**
 * A single scroll-linked progress value (0 at the top, 1 once fully
 * collapsed), eased and rAF-throttled. Everything about the bar's floating
 * state — margin, radius, shadow, and which content survives — is a pure
 * function of this one number, so the bar is always internally consistent at
 * any scroll position, including mid-scroll and scrolling back up. No CSS
 * transition rides alongside it: a transition would make the bar lag behind
 * the finger instead of tracking it 1:1, which is the wrong feel for
 * something meant to read as physically tied to the page moving.
 *
 * Pinned to 0 below `sm`. The whole docking choreography — narrowing,
 * lifting off the top edge, hiding the wordmark — is a wide-screen effect;
 * on a phone the bar is already the plainest thing it gets (a flat glass
 * strip that opens a hamburger sheet), and there is no "compact" state left
 * to collapse into. Checked with `matchMedia` rather than reading a fixed
 * width once, matching the guard this file already has for the mobile
 * menu's own trigger: resizing across the boundary — rotating a tablet,
 * dragging a desktop window narrow — should snap the bar back to flush
 * immediately rather than leaving it stuck mid-dock on a layout that no
 * longer has room for it.
 */
function useCollapseProgress(): number {
    const [progress, setProgress] = useState(0)
    const rafRef = useRef(0)

    useEffect(() => {
        const [start, end] = COLLAPSE_RANGE
        const mq = window.matchMedia('(min-width: 640px)')
        const measure = () => {
            rafRef.current = 0
            if (!mq.matches) {
                setProgress(0)
                return
            }
            const raw = clamp01((window.scrollY - start) / (end - start))
            // Ease-out: the bar moves fastest right as it leaves the top and
            // settles into its floating state, rather than a linear crawl
            // that still feels like it's "getting there" near the end.
            setProgress(raw * (2 - raw))
        }
        const onScroll = () => {
            if (rafRef.current) return
            rafRef.current = requestAnimationFrame(measure)
        }
        measure()
        window.addEventListener('scroll', onScroll, { passive: true })
        mq.addEventListener('change', measure)
        return () => {
            window.removeEventListener('scroll', onScroll)
            mq.removeEventListener('change', measure)
            if (rafRef.current) cancelAnimationFrame(rafRef.current)
        }
    }, [])

    return progress
}

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
function BrandMark({ collapseProgress }: { collapseProgress: number }) {
    // The wordmark is the first thing to go once the bar starts docking —
    // by the time it's a compact pill there's no room to spare on a name
    // that the icon alone already carries. Collapsed over the back half of
    // the range (not the whole thing) so it disappears a beat after the bar
    // itself starts moving, rather than both happening in the same instant.
    const wordmarkGone = clamp01((collapseProgress - 0.5) / 0.5)
    return (
        <Link href={benchRoutes.overview()} className="group flex shrink-0 items-center">
            <Image
                src="/android-chrome-512x512.png"
                alt=""
                width={20}
                height={20}
                className="rounded-lg"
            />
            <span
                className="overflow-hidden whitespace-nowrap font-[family-name:var(--font-plex)] text-[14px] font-light lowercase tracking-tight text-[var(--muted-foreground)] transition-colors group-hover:text-[var(--foreground)]"
                style={{
                    maxWidth: lerp(88, 0, wordmarkGone),
                    marginLeft: lerp(8, 0, wordmarkGone),
                    opacity: 1 - wordmarkGone,
                }}
            >
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

    const collapseProgress = useCollapseProgress()
    // A boolean snap rather than a continuously-animated border: whether the
    // bar has a full border (floating card) or just a bottom hairline (flush
    // with the page) is a discrete visual fact, not a magnitude — there's no
    // meaningful "40% of a border." It flips essentially the instant the bar
    // starts moving, alongside everything else that's ramping up smoothly.
    const docked = collapseProgress > 0.02

    return (
        <header
            className="sticky top-0 z-40"
            style={{
                // The gap above the docked pill lives here, as padding on
                // the sticky element itself, not as margin-top on the bar
                // inside it. Margin on a first child collapses through its
                // parent's top edge — with the child's margin hoisted onto
                // the header, the "gap" only exists for the one scroll frame
                // before the header re-pins to `top: 0`, so the moment it's
                // actually stuck the bar reads as flush again regardless of
                // how large the margin is. Padding never collapses, so the
                // gap survives being pinned.
                paddingTop: lerp(0, 12, collapseProgress),
            }}
        >
            {/* The bar that's actually seen — full-bleed and square at the top
                of the page, then radius, width, and shadow all ease toward a
                floating pill as `collapseProgress` climbs. Every one of those
                is a direct function of that single number: no CSS transition
                rides along, so the bar tracks the scroll position itself
                rather than a smoothed copy of it that would visibly lag a
                fast flick. `overflow-hidden` clips the refresh rail below to
                whatever radius is currently in effect — safe to add because
                the dropdowns anchored off buttons inside this bar render
                into a `document.body` portal, not this element, so they were
                never going to be clipped by it. */}
            <div
                className={cn(
                    'relative mx-auto w-full bg-[var(--background)]/85 backdrop-blur-2xl overflow-hidden border-[var(--border-subtle)]',
                    docked ? 'border' : 'border-b'
                )}
                style={{
                    borderRadius: lerp(0, 28, collapseProgress),
                    maxWidth: collapseProgress > 0.001 ? lerp(1800, 620, collapseProgress) : undefined,
                    boxShadow: `0 ${lerp(0, 16, collapseProgress)}px ${lerp(0, 40, collapseProgress)}px -${lerp(
                        4,
                        16,
                        collapseProgress
                    )}px rgba(15, 15, 15, ${(0.18 * collapseProgress).toFixed(3)})`,
                }}
            >
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
                    <BrandMark collapseProgress={collapseProgress} />

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
            </div>
        </header>
    )
}
