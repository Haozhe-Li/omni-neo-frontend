import { redis } from '@/lib/redis'
import { bubbleImage, brandImage } from '@/lib/og-image'

// Per request: a page can be unpublished, and an unpublished page must stop
// previewing its title.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export const alt = 'A page on OmniKnows'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const CACHE = { 'Cache-Control': 'public, max-age=0, s-maxage=600, stale-while-revalidate=3600' }

/** A published page previews its title in the bubble. A missing or unpublished
 *  page falls back to the plain brand card. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const raw = await redis.get(`publish:${id}`)
    if (raw) {
      const data = typeof raw === 'string' ? JSON.parse(raw) : (raw as { title?: string })
      if (data?.title) return bubbleImage(String(data.title), CACHE)
    }
  } catch (e) {
    console.error('OG: could not load page title', e)
  }
  return brandImage(CACHE)
}
