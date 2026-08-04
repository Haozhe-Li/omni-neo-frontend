import { Suspense } from 'react'
import type { Metadata } from 'next'
import { CompareClient } from './compare-client'
import { ComparePageSkeleton } from '@/components/benchmark/skeletons'

export const metadata: Metadata = {
    title: 'Compare models',
    description:
        "Put up to four models side by side on Omni's pro-mode evaluation: capability shape, every headline metric, and the cases where they disagree.",
}

export default function ComparePage() {
    // The selection lives in the query string, and useSearchParams needs a
    // Suspense boundary above it.
    return (
        <Suspense fallback={<ComparePageSkeleton />}>
            <CompareClient />
        </Suspense>
    )
}
