import { NextRequest, NextResponse } from 'next/server'
import { COLLECTOR_COOKIE, verifySession } from '@/lib/collector/session'

// Server-side proxy from the /collect page to the backend's /api/collector/*.
//
// The browser never sees COLLECTOR_API_KEY: it is added here, after the session
// cookie has been checked (a second time — proxy.ts already bounced anonymous
// requests, but a route handler must not rely on that). The annotator name sent
// as X-Collector-Id comes from the signed cookie, not from anything the page says.
//
// Only the backend routes the page actually uses are forwarded, by method and
// path shape; everything else is a 404 here rather than an open pipe to the
// backend. Streams (/generate, /stream) are passed through unbuffered.
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const ID = '[0-9a-fA-F-]{8,64}'
const ROUTES: { method: string; re: RegExp }[] = [
  { method: 'POST', re: /^threads$/ },
  { method: 'DELETE', re: new RegExp(`^threads/${ID}$`) },
  { method: 'POST', re: /^generate$/ },
  { method: 'GET', re: new RegExp(`^threads/${ID}/stream$`) },
  { method: 'POST', re: new RegExp(`^threads/${ID}/stop$`) },
  { method: 'GET', re: new RegExp(`^threads/${ID}/state$`) },
  { method: 'PUT', re: new RegExp(`^threads/${ID}/final$`) },
  { method: 'POST', re: new RegExp(`^threads/${ID}/submit$`) },
  { method: 'POST', re: new RegExp(`^threads/${ID}/restart$`) },
  { method: 'POST', re: new RegExp(`^threads/${ID}/uploads$`) },
  { method: 'POST', re: /^uploads\/confirm$/ },
]

// The one route that takes a query string. Anything else in it is dropped, and the id
// must be the shape the upload endpoint mints, so the proxy cannot be used to smuggle
// parameters (or a path) to the backend.
const FILE_ID_RE = /^user_uploads\/[a-z0-9_-]{1,40}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function backendBase(): string {
  const base = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000'
  return base.replace(/\/+$/, '')
}

async function forward(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const session = await verifySession(req.cookies.get(COLLECTOR_COOKIE)?.value)
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const key = process.env.COLLECTOR_API_KEY
  if (!key) return NextResponse.json({ error: 'The collector is not configured on this deployment.' }, { status: 503 })

  const path = (await ctx.params).path.join('/')
  if (!ROUTES.some((r) => r.method === req.method && r.re.test(path))) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  let search = ''
  if (path === 'uploads/confirm') {
    const fileId = req.nextUrl.searchParams.get('file_id') ?? ''
    if (!FILE_ID_RE.test(fileId)) return NextResponse.json({ error: 'bad file id' }, { status: 400 })
    search = `?file_id=${encodeURIComponent(fileId)}`
  }

  const hasBody = req.method === 'POST' || req.method === 'PUT'
  if (hasBody && !req.headers.get('content-type')?.includes('application/json')) {
    return NextResponse.json({ error: 'expected application/json' }, { status: 415 })
  }

  let upstream: Response
  try {
    upstream = await fetch(`${backendBase()}/api/collector/${path}${search}`, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'X-Collector-Key': key,
        'X-Collector-Id': session.annotator,
      },
      body: hasBody ? await req.text() : undefined,
      signal: req.signal,
      cache: 'no-store',
    })
  } catch {
    return NextResponse.json({ error: 'The backend is unreachable.' }, { status: 502 })
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}

export { forward as GET, forward as POST, forward as PUT, forward as DELETE }
