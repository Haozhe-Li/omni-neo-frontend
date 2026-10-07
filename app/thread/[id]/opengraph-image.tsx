import { brandImage } from '@/lib/og-image'

// A /thread/{id} link is a PRIVATE conversation — only its owner can open it —
// so its preview is the plain brand card and says nothing about the contents.
// This inherits the same look as the root image; the file exists so that
// guarantee is stated here, where someone adding a "nicer" per-thread preview
// would see it, rather than left to fall out of inheritance. Shared
// conversations have their own page and preview under /s/{id}.
export const alt = 'OmniKnows'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return brandImage()
}
