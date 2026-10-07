import { brandImage } from '@/lib/og-image'

// Same reason as app/benchmark/opengraph-image.tsx: this route's generateMetadata
// sets its own `openGraph`, which drops anything inherited.
export const alt = 'OmniKnows'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return brandImage()
}
