import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { redis } from '@/lib/redis'

// Flips a published page between the two non-private categories: listed in
// the public Pages lobby (omni_pages:all) vs. unlisted (link-only — still
// world-readable at /pages/{id}, just not discoverable from the lobby grid).
// Deleting the page entirely is handled by /api/unpublish; this only ever
// toggles `publishToPages`, never removes the page or its owner index.
export async function POST(request: Request) {
    try {
        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { id, listed } = await request.json()
        if (!id || typeof listed !== 'boolean') {
            return NextResponse.json({ error: 'id and listed (boolean) are required' }, { status: 400 })
        }

        const publishKey = `publish:${id}`
        const rawPageData = await redis.get(publishKey)
        if (!rawPageData) {
            return NextResponse.json({ error: 'Page not found' }, { status: 404 })
        }

        const pageData = typeof rawPageData === 'string' ? JSON.parse(rawPageData) : rawPageData
        if (pageData.userId !== userId) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        if (listed) {
            delete pageData.publishToPages
        } else {
            pageData.publishToPages = false
        }

        const publishedAtMs = pageData.publishedAt ? new Date(pageData.publishedAt).getTime() : NaN
        const score = Number.isFinite(publishedAtMs) ? publishedAtMs : Date.now()

        const pipeline = redis.pipeline()
        pipeline.set(publishKey, JSON.stringify(pageData))
        if (listed) {
            pipeline.zadd('omni_pages:all', { score, member: id })
        } else {
            pipeline.zrem('omni_pages:all', id)
        }
        await pipeline.exec()

        return NextResponse.json({ success: true, listed })
    } catch (error) {
        console.error('Failed to toggle page listing:', error)
        return NextResponse.json({ error: 'Failed to update page' }, { status: 500 })
    }
}
