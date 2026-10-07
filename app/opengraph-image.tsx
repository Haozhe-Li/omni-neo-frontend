import { brandImage } from '@/lib/og-image'

// The default link preview for the whole site: the three-ring mark and the
// wordmark. Every route without an opengraph-image of its own inherits it —
// the Pages index, settings, voice, benchmarks and so on.
export const alt = 'OmniKnows'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return brandImage()
}
