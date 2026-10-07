import { NextResponse } from 'next/server'
import { COLLECTOR_COOKIE } from '@/lib/collector/session'

export const dynamic = 'force-dynamic'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COLLECTOR_COOKIE, '', { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 0 })
  return res
}
