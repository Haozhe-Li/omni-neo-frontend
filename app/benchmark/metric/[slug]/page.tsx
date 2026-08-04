import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { MetricClient } from './metric-client'
import { METRIC_CARDS, metricCardBySlug } from '@/lib/benchmark'

/**
 * Metadata here is real, unlike the model pages' — and it can be, because these
 * eight pages are a fixed enumeration that needs no data fetch to name. That
 * matters: "what is X" is the search these pages answer, so the title and
 * description are the content as much as the ranking is.
 */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string }>
}): Promise<Metadata> {
    const { slug } = await params
    const card = metricCardBySlug(slug)
    if (!card) return { title: 'Metric' }

    const description = `${card.doc.what} ${card.doc.how}`.slice(0, 300)
    return {
        title: card.title,
        description,
        openGraph: {
            title: `${card.title} | Omni benchmarks`,
            description,
            type: 'website',
        },
    }
}

/** Eight known metrics — prerender the lot rather than build them on demand. */
export function generateStaticParams() {
    return METRIC_CARDS.map((card) => ({ slug: card.slug }))
}

export default async function MetricPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params
    // 404 on an unknown metric rather than rendering an empty shell: these are
    // indexable URLs, and a soft-404 that returns 200 is worse than nothing.
    if (!metricCardBySlug(slug)) notFound()

    return <MetricClient slug={slug} />
}
