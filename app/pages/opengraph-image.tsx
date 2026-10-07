import { brandImage } from '@/lib/og-image'

// This segment's pages define their own `openGraph` metadata, which replaces the
// root layout's wholesale — including the root's generated image — so the brand
// card has to be provided here too or the link previews with no image at all.
export const alt = 'OmniKnows'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return brandImage()
}
