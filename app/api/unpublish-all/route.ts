import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { redis } from '@/lib/redis'

export async function POST() {
    try {
        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const userIndexKey = `omni_pages:user:${userId}`
        const ids = await redis.zrange(userIndexKey, 0, -1)

        if (ids.length === 0) {
            return NextResponse.json({ success: true, count: 0 })
        }

        const pipeline = redis.pipeline()
        for (const id of ids) {
            pipeline.del(`publish:${id}`)
            pipeline.zrem('omni_pages:all', id)
        }
        pipeline.del(userIndexKey)

        await pipeline.exec()

        return NextResponse.json({ success: true, count: ids.length })
    } catch (error) {
        console.error('Failed to unpublish all reports:', error)
        return NextResponse.json({ error: 'Failed to unpublish all reports' }, { status: 500 })
    }
}
