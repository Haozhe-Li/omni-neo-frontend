import { NextRequest, NextResponse } from 'next/server'
import { redis } from '@/lib/redis'
import {
  ANNOTATOR_RE,
  COLLECTOR_COOKIE,
  SESSION_TTL_MS,
  passwordMatches,
  signSession,
} from '@/lib/collector/session'

// Password check for the /collect tool. Shared password (COLLECTOR_PASSWORD) plus
// an annotator name, which only labels the rows that person collects.
//
// Throttled per client IP: MAX_ATTEMPTS failures inside WINDOW_S locks that IP out
// for the rest of the window. Counted in Upstash (already used by the app) so it
// holds across serverless instances; if Redis is unreachable the check fails
// CLOSED — an unthrottled password endpoint is worse than a login that is down.
export const dynamic = 'force-dynamic'

const MAX_ATTEMPTS = 8
const WINDOW_S = 15 * 60

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for')
  return (fwd?.split(',')[0] ?? req.headers.get('x-real-ip') ?? 'unknown').trim()
}

export async function POST(req: NextRequest) {
  const expected = process.env.COLLECTOR_PASSWORD
  if (!expected || !process.env.COLLECTOR_SESSION_SECRET || process.env.COLLECTOR_SESSION_SECRET.length < 32) {
    return NextResponse.json({ error: 'The collector is not configured on this deployment.' }, { status: 503 })
  }

  let body: { password?: unknown; annotator?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 })
  }
  const password = typeof body.password === 'string' ? body.password : ''
  const annotator = typeof body.annotator === 'string' ? body.annotator.trim().toLowerCase() : ''
  if (!ANNOTATOR_RE.test(annotator)) {
    return NextResponse.json(
      { error: 'Name must be 1–32 characters: lowercase letters, digits, "-" or "_".' },
      { status: 400 },
    )
  }

  const key = `collector:login:${clientIp(req)}`
  try {
    const failures = Number((await redis.get(key)) ?? 0)
    if (failures >= MAX_ATTEMPTS) {
      return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })
    }
  } catch {
    return NextResponse.json({ error: 'Login is temporarily unavailable.' }, { status: 503 })
  }

  if (!(await passwordMatches(password, expected))) {
    try {
      const n = await redis.incr(key)
      if (n === 1) await redis.expire(key, WINDOW_S)
    } catch {}
    return NextResponse.json({ error: 'Wrong password.' }, { status: 401 })
  }

  const token = await signSession({ annotator, expiresAt: Date.now() + SESSION_TTL_MS })
  if (!token) return NextResponse.json({ error: 'The collector is not configured on this deployment.' }, { status: 503 })

  const res = NextResponse.json({ ok: true, annotator })
  res.cookies.set(COLLECTOR_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  })
  return res
}
