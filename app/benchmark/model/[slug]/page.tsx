import type { Metadata } from 'next'
import { ModelClient } from './model-client'

export const metadata: Metadata = {
    title: 'Model',
    description:
        "Every metric recorded for one model in Omni's pro-mode evaluation: quality, per-suite scores, per-case results, latency, tokens and cost.",
}

export default async function ModelPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params
    return <ModelClient slug={slug} />
}
