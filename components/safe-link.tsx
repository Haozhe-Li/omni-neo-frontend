'use client'

import * as React from 'react'
import type { Credibility } from '@/lib/credibility'
import { needsInterstitial } from '@/lib/credibility'
import { requestSafeLinkGate } from '@/lib/safe-link-events'

interface SafeLinkProps extends Omit<React.ComponentPropsWithoutRef<'a'>, 'href' | 'target' | 'rel'> {
  href: string
  /** Pass the source/citation's known credibility, or omit it for a raw
   * link with no citation — either way, anything but the three trusted
   * tiers gates through the Safe Link interstitial on click. */
  credibility?: Credibility | null
}

/**
 * Drop-in replacement for an outbound `<a target="_blank">` that gates
 * non-trusted links behind the Safe Link interstitial (see
 * `SafeLinkModal`). Stays a real anchor with a real `href` — middle-click/
 * open-in-new-tab keep working for the trusted path, and `forwardRef` lets
 * it sit under a Radix `HoverCardTrigger asChild` unchanged. Stateless: it
 * only decides gate-vs-passthrough per click and hands off to the modal via
 * a window event, rather than each link mounting its own dialog.
 */
export const SafeLink = React.forwardRef<HTMLAnchorElement, SafeLinkProps>(
  ({ href, credibility, onClick, children, ...rest }, ref) => {
    const gated = needsInterstitial(credibility)

    const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
      onClick?.(e)
      if (e.defaultPrevented) return
      if (!gated) return
      e.preventDefault()
      requestSafeLinkGate({ url: href, credibility: credibility ?? undefined })
    }

    return (
      <a ref={ref} href={href} target="_blank" rel="noopener noreferrer" onClick={handleClick} {...rest}>
        {children}
      </a>
    )
  },
)
SafeLink.displayName = 'SafeLink'
