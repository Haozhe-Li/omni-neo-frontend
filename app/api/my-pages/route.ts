import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { redis } from '@/lib/redis'

export async function GET() {
    try {
        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // 1. Fetch page IDs from the 'omni_pages:user:${userId}' sorted set
        const pageIds = await redis.zrange(`omni_pages:user:${userId}`, 0, -1, { rev: true })

        if (pageIds.length === 0) {
            return NextResponse.json({ pages: [] })
        }

        // 2. Fetch the JSON data for each ID
        const keys = pageIds.map((id) => `publish:${id}`)
        const rawData = await redis.mget(...keys)

        // 3. Parse and pair with the ID
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
        console.error('Error fetching user pages:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
