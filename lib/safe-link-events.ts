import type { Credibility } from '@/lib/credibility'

export interface SafeLinkEventDetail {
  url: string
  /** Already-known credibility (from a citation/source). Omitted for a raw
   * link with no citation — `SafeLinkModal` fetches it via `classifyUrl`. */
  credibility?: Credibility | null
}

declare global {
  interface WindowEventMap {
    'omni:safe-link': CustomEvent<SafeLinkEventDetail>
  }
}

/** Opens the Safe Link interstitial — see `SafeLinkModal`, mounted once in
 * `app-sidebar.tsx`, same event-driven pattern as `omni:usage-limit`. */
export function requestSafeLinkGate(detail: SafeLinkEventDetail) {
  window.dispatchEvent(new CustomEvent('omni:safe-link', { detail }))
}
