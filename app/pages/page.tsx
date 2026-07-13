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

    return (
        <PagesShell>
            <PagesClient initialPages={pages} />
        </PagesShell>
    )
}
