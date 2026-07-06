import { NextResponse } from 'next/server'
import { redis } from '@/lib/redis'

// Public gallery listing — mirrors the data app/pages/page.tsx fetches server-side,
// exposed as a client-fetchable JSON endpoint for the in-app embedded Pages panel.
export async function GET() {
    try {
        const pageIds = await redis.zrange('omni_pages:all', 0, 49, { rev: true })

        if (pageIds.length === 0) {
            return NextResponse.json({ pages: [] })
        }

        const keys = pageIds.map((id) => `publish:${id}`)
        const rawData = await redis.mget(...keys)

        const pages = rawData
            .map((data, index) => {
                if (!data) return null
                const parsed = typeof data === 'string' ? JSON.parse(data) : data
                return {
                    id: pageIds[index],
                    ...parsed,
                }
            })
            .filter(Boolean)

        return NextResponse.json({ pages })
    } catch (error) {
        console.error('Error fetching pages:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
