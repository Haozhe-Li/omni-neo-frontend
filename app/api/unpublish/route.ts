import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { redis } from '@/lib/redis'

export async function POST(request: Request) {
    try {
        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const rawData = await request.json()
        const { id } = rawData

        if (!id) {
            return NextResponse.json({ error: 'ID is required' }, { status: 400 })
        }

        const publishKey = `publish:${id}`

        // 1. Verify ownership
        const rawPageData = await redis.get(publishKey)
        if (!rawPageData) {
            return NextResponse.json({ error: 'Page not found' }, { status: 404 })
        }

        const pageData = typeof rawPageData === 'string' ? JSON.parse(rawPageData) : rawPageData
        if (pageData.userId !== userId) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        // 2. Remove from Redis
        const pipeline = redis.pipeline()

        // Delete the main hash
        pipeline.del(publishKey)

        // Remove from sorted sets
        pipeline.zrem('omni_pages:all', id)
        pipeline.zrem(`omni_pages:user:${userId}`, id)

        await pipeline.exec()

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Failed to unpublish report:', error)
        return NextResponse.json({ error: 'Failed to unpublish report' }, { status: 500 })
    }
}
