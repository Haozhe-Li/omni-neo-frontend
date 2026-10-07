import { bubbleImage, brandImage } from '@/lib/og-image'

// Per request, not at build: a share can be revoked, and a revoked link must
// stop previewing its contents.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export const alt = 'A shared conversation on OmniKnows'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const BACKEND_URL = (
  process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000'
).replace(/\/$/, '')

// Short at the CDN so a revoked link stops previewing within minutes — the
// default for generated images is a year.
const CACHE = { 'Cache-Control': 'public, max-age=0, s-maxage=600, stale-while-revalidate=3600' }

/** The bubble shows what the sharer asked first. Anything that goes wrong — an
 *  unknown or revoked link, the backend down — falls back to the plain brand
 *  card rather than an error image or a stale preview. */
export default async function Image({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params
  try {
    const res = await fetch(`${BACKEND_URL}/api/shared/${encodeURIComponent(shareId)}`, { cache: 'no-store' })
    if (res.ok) {
      const data = await res.json()
      const first = (data?.messages ?? []).find(
        (m: { role?: string; hidden?: boolean; content?: unknown }) =>
          m?.role === 'user' && !m.hidden && typeof m.content === 'string' && m.content.trim()
      )
      if (first) return bubbleImage(first.content, CACHE)
    }
  } catch (e) {
    console.error('OG: could not load shared conversation', e)
  }
  return brandImage(CACHE)
}
