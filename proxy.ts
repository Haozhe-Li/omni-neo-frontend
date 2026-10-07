import { clerkMiddleware } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { COLLECTOR_COOKIE, verifySession } from '@/lib/collector/session'

// By default, all routes are public (guest mode is supported).
// Clerk middleware still runs to make auth state available in server components.
//
// The one exception is the training-data collector (/collect and /api/collect):
// a separate tool for annotators, behind a shared password. Every request to it
// must carry a valid signed session cookie (lib/collector/session.ts) or it is
// bounced to the login page / answered 401. Only the login and logout endpoints
// and the login page itself are open. The API route handlers check the cookie
// again themselves — this is the front door, not the only lock.
const isCollectorPath = (p: string) =>
  p === '/collect' || p.startsWith('/collect/') || p === '/api/collect' || p.startsWith('/api/collect/')

const COLLECTOR_OPEN = new Set(['/collect/login', '/api/collect/login', '/api/collect/logout'])

export default clerkMiddleware(async (_auth, req) => {
  const path = req.nextUrl.pathname.replace(/\/+$/, '') || '/'
  if (!isCollectorPath(path) || COLLECTOR_OPEN.has(path)) return

  if (await verifySession(req.cookies.get(COLLECTOR_COOKIE)?.value)) return

  if (path.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const url = req.nextUrl.clone()
  url.pathname = '/collect/login'
  url.search = ''
  return NextResponse.redirect(url)
})

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}
