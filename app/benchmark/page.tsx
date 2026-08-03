import type { Metadata } from 'next'
import { BenchmarkClient } from './benchmark-client'

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
    return <BenchmarkClient />
}
