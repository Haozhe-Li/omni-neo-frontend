import { redis } from '@/lib/redis'
import { Metadata } from 'next'
import { PagesShell } from '@/components/pages-shell'
import { PagesClient } from './pages-client'

export const metadata: Metadata = {
    title: 'Explore Pages',
    description: 'Explore research, insights, and comprehensive answers published by the Omni Knows community.',
    openGraph: {
        title: 'Explore Pages | Omni Knows',
        description: 'Explore research, insights, and comprehensive answers published by the Omni Knows community.',
        images: ['/omniknows_pages_home.png'],
        type: 'website',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Explore Pages | Omni Knows',
        description: 'Explore research, insights, and comprehensive answers published by the Omni Knows community.',
        images: ['/omniknows_pages_home.png'],
    }
}

export const revalidate = 60 // Revalidate every minute

export default async function OmniPagesList() {
    const pageIds = await redis.zrange('omni_pages:all', 0, 49, { rev: true })

    let pages: any[] = []

    if (pageIds.length > 0) {
        const keys = pageIds.map((id) => `publish:${id}`)
        const rawData = await redis.mget(...keys)

        pages = rawData
            .map((data, index) => {
                if (!data) return null
                const parsed = typeof data === 'string' ? JSON.parse(data) : data
                return {
                    id: pageIds[index],
                    ...parsed,
                }
            })
            .filter(Boolean)
    }

    // ─── No more dynamic "featured" split. ───
    // All fetched pages go to the grid below.
    const rest = pages.length > 0 ? pages : [
        { id: 'mock-1', title: 'Global Semiconductor Supply Chain Risk Assessment 2026', authorName: 'Omni AI', publishedAt: '2026-07-08', coverImage: 'https://cdn.omniknows.xyz/public/cover-fe16d891e33e4b418d835c29e12357b6.jpg', sources: [{ title: 'SEMI', url: 'https://www.semi.org' }, { title: 'Reuters', url: 'https://www.reuters.com' }, { title: 'Bloomberg', url: 'https://www.bloomberg.com' }, { title: 'TSMC', url: 'https://www.tsmc.com' }, { title: 'WSJ', url: 'https://www.wsj.com' }] },
        { id: 'mock-2', title: 'Comparative Analysis of Renewable Energy Storage Technologies', authorName: 'Omni AI', publishedAt: '2026-07-05' },
        { id: 'mock-3', title: 'The State of Remote Work in 2026', authorName: 'Omni AI', publishedAt: '2026-07-01', coverImage: 'https://cdn.omniknows.xyz/public/cover-9dde1669144c4297a5b327d9711dafd0.jpg', sources: [{ title: 'Gallup', url: 'https://www.gallup.com' }, { title: 'BLS', url: 'https://www.bls.gov' }] },
        { id: 'mock-4', title: 'Quantum Computing Commercialization Timeline', authorName: 'Omni AI', publishedAt: '2026-06-28' },
        { id: 'mock-5', title: 'Urban Transit Ridership Recovery Post-Pandemic', authorName: 'Omni AI', publishedAt: '2026-06-20', sources: [{ title: 'APTA', url: 'https://www.apta.com' }] },
        { id: 'mock-6', title: 'Foundation Model Pricing Trends Across Providers', authorName: 'Max Li', publishedAt: '2026-06-15' },
    ]

    return (
        <PagesShell>
            <PagesClient initialPages={rest} />
        </PagesShell>
    )
}
