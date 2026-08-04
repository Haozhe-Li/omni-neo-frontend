import { Suspense } from 'react'
import type { Metadata } from 'next'
import { OverviewClient } from './overview-client'
import { MetricGridSkeleton, ScatterSkeleton } from '@/components/benchmark/skeletons'

export const metadata: Metadata = {
    title: 'Benchmarks',
    description:
        "How each model performs in Omni's pro mode across skill triggering, output contracts, answer quality, latency and cost.",
    openGraph: {
        title: 'Benchmarks | Omni Knows',
        description:
            "Open evaluation results: how each model performs in Omni's pro mode across skill triggering, output contracts, answer quality, latency and cost.",
        type: 'website',
    },
}

export default function BenchmarkPage() {
    // useSearchParams (the scatter's axis state) opts a client component into
    // client-side rendering, which Next requires a Suspense boundary for.
    return (
        <Suspense
            fallback={
                <div className="space-y-4">
                    <MetricGridSkeleton />
                    <ScatterSkeleton />
                </div>
            }
        >
            <OverviewClient />
        </Suspense>
    )
}
