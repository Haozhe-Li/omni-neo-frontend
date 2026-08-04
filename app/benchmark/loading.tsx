import { MetricGridSkeleton, ScatterSkeleton } from '@/components/benchmark/skeletons'

/** Route-level fallback, so a cold visit paints the page's shape immediately. */
export default function Loading() {
    return (
        <div className="space-y-4">
            <MetricGridSkeleton />
            <ScatterSkeleton />
        </div>
    )
}
