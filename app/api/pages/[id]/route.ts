import { NextResponse } from 'next/server'
import { redis } from '@/lib/redis'

// Single-page detail — mirrors the data app/pages/[id]/page.tsx fetches server-side,
// exposed as a client-fetchable JSON endpoint for the in-app embedded Pages panel.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params
        const rawData = await redis.get(`publish:${id}`)

        if (!rawData) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 })
        }

        const data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData

        return NextResponse.json({ id, ...data })
    } catch (error) {
        console.error('Error fetching page:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
