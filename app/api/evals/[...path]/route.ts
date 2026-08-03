import { NextRequest, NextResponse } from 'next/server'

/**
 * Thin proxy for the backend's read-only evaluation API (`/api/evals/*`).
 *
 * A catch-all rather than nine route files: every endpoint is a GET with the
 * same auth and error handling, so the only thing that varies is the path.
 *
 * No auth: the benchmark page is public, and the backend's eval endpoints are
 * too. Nothing here is user data — every row describes a fixed synthetic test
 * case from evals/cases.yaml being answered by a model.
 *
 * Responses are cached at the edge for a minute. The backend already holds a
 * week-long Redis cache, so this only collapses bursts from one viewer moving
 * between tabs; it is short enough that a fresh benchmark run still shows up
 * promptly.
 */

const ALLOWED = new Set([
    'runs',
    'results',
    'leaderboard',
    'family-grid',
    'check-failures',
    'matrix',
    'cases',
])

// The one non-GET route: it bumps a cache generation counter so the refresh
// button can actually drop the backend's week-long cache. Writes no eval data,
// and is rate-limited server-side.
const POST_ALLOWED = new Set(['refresh'])

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    return proxy(request, await params, 'GET')
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    return proxy(request, await params, 'POST')
}

async function proxy(
    request: NextRequest,
    { path }: { path: string[] },
    method: 'GET' | 'POST'
) {
    const segments = path ?? []
    const allowed = method === 'POST' ? POST_ALLOWED : ALLOWED

    // Path allow-list on the first segment, per method. Keeping the proxy
    // narrow means a future backend endpoint can't be reached through here by
    // accident — and that POST can only ever reach the cache-control route.
    if (segments.length === 0 || !allowed.has(segments[0])) {
        return NextResponse.json({ error: 'Unknown eval endpoint' }, { status: 404 })
    }

    const base = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL || 'http://127.0.0.1:8000'
    const root = base.endsWith('/') ? base.slice(0, -1) : base
    const search = request.nextUrl.search
    const target = `${root}/api/evals/${segments.join('/')}${search}`

    try {
        const res = await fetch(target, { method, cache: 'no-store' })

        const body = await res.text()
        return new NextResponse(body, {
            status: res.status,
            headers: {
                'Content-Type': 'application/json',
                // Never cache the refresh call or an error — only successful
                // reads. Edge-caching a refresh would defeat the whole point.
                ...(res.ok && method === 'GET'
                    ? { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' }
                    : { 'Cache-Control': 'no-store' }),
            },
        })
    } catch (error) {
        console.error('[evals proxy]', target, error)
        return NextResponse.json(
            { error: 'Could not reach the evaluation backend' },
            { status: 502 }
        )
    }
}
