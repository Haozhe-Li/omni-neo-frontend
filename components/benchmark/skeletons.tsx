'use client'

import { cn } from '@/lib/utils'

/**
 * Loading placeholders for the benchmark pages.
 *
 * Every skeleton here mirrors the geometry of the component it stands in for —
 * a bar chart's skeleton is a row of bars of descending height, not a grey
 * rectangle. That is the point: the placeholder occupies the same box the real
 * content will, so nothing jumps when data lands, and the shape itself tells
 * you what is coming.
 */

export function SkeletonBlock({
    className,
    style,
}: {
    className?: string
    style?: React.CSSProperties
}) {
    return <div className={cn('omni-skeleton rounded-md', className)} style={style} />
}

/** Heights that read as a plausible sorted bar chart rather than a stack. */
const BAR_HEIGHTS = [92, 84, 79, 71, 66, 58, 52, 45, 38, 30]

export function MetricCardSkeleton({ wide = false }: { wide?: boolean }) {
    return (
        <div
            className={cn(
                'rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] p-4 sm:p-5',
                wide && 'sm:col-span-2 xl:col-span-3'
            )}
        >
            <SkeletonBlock className="h-4 w-28" />
            <SkeletonBlock className="mt-2 h-3 w-52 max-w-full" />

            {/* Vertical bars from sm up, mirroring MetricBarCard's own switch. */}
            <div className="mt-6 hidden h-[190px] items-end gap-1.5 sm:flex">
                {BAR_HEIGHTS.map((h, i) => (
                    <div key={i} className="flex flex-1 flex-col justify-end">
                        <SkeletonBlock
                            className="w-full rounded-b-none"
                            // Inline height: an arbitrary percentage per bar is
                            // exactly what Tailwind's fixed scale can't express.
                            style={{ height: `${h}%` }}
                        />
                    </div>
                ))}
            </div>

            {/* Horizontal rows below sm. */}
            <div className="mt-4 space-y-2 sm:hidden">
                {BAR_HEIGHTS.slice(0, 8).map((h, i) => (
                    <div key={i} className="flex items-center gap-2">
                        <SkeletonBlock className="h-3 w-20 shrink-0" />
                        <SkeletonBlock className="h-4" style={{ width: `${h * 0.7}%` }} />
                    </div>
                ))}
            </div>
        </div>
    )
}

export function MetricGridSkeleton() {
    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCardSkeleton wide />
            {Array.from({ length: 6 }).map((_, i) => (
                <MetricCardSkeleton key={i} />
            ))}
        </div>
    )
}

export function ScatterSkeleton() {
    return (
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] p-4 sm:p-5">
            <SkeletonBlock className="h-4 w-40" />
            <SkeletonBlock className="mt-2 h-3 w-64 max-w-full" />
            <SkeletonBlock className="mt-5 h-[260px] w-full sm:h-[380px]" />
        </div>
    )
}

export function RankTilesSkeleton() {
    return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
                <div
                    key={i}
                    className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] p-4"
                >
                    <SkeletonBlock className="h-3 w-16" />
                    <SkeletonBlock className="mt-4 h-7 w-20" />
                    <SkeletonBlock className="mt-3 h-1.5 w-full" />
                </div>
            ))}
        </div>
    )
}

export function ModelPageSkeleton() {
    return (
        <div className="space-y-6">
            <div>
                <SkeletonBlock className="h-3 w-24" />
                <SkeletonBlock className="mt-3 h-8 w-64 max-w-full" />
                <SkeletonBlock className="mt-3 h-3 w-48 max-w-full" />
            </div>
            <RankTilesSkeleton />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] p-5 space-y-3">
                    <SkeletonBlock className="h-4 w-32" />
                    {Array.from({ length: 4 }).map((_, i) => (
                        <SkeletonBlock key={i} className="h-3 w-full" />
                    ))}
                </div>
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] p-5 space-y-3">
                    <SkeletonBlock className="h-4 w-32" />
                    {Array.from({ length: 4 }).map((_, i) => (
                        <SkeletonBlock key={i} className="h-6 w-full" />
                    ))}
                </div>
            </div>
        </div>
    )
}

export function ComparePageSkeleton() {
    return (
        <div className="space-y-6">
            <div>
                <SkeletonBlock className="h-8 w-48" />
                <SkeletonBlock className="mt-3 h-3 w-72 max-w-full" />
            </div>
            <div className="flex flex-wrap gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                    <SkeletonBlock key={i} className="h-9 w-36" />
                ))}
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <SkeletonBlock className="h-[340px] w-full rounded-2xl" />
                <SkeletonBlock className="h-[340px] w-full rounded-2xl" />
            </div>
        </div>
    )
}

/** The page header's own placeholder, so the shell never pops in late. */
export function HeaderSkeleton() {
    return (
        <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
                <SkeletonBlock className="h-7 w-40" />
                <SkeletonBlock className="mt-2.5 h-3 w-80 max-w-full" />
            </div>
            <SkeletonBlock className="h-8 w-24" />
        </div>
    )
}
