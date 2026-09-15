'use client'

import { TriangleAlert } from 'lucide-react'
import type { Arguable } from '@/lib/arguable'
import { isArguable } from '@/lib/arguable'

/**
 * Small warning-triangle glyph shown next to a citation only when the
 * backend flagged this source as disputed. Deliberately icon-only, using
 * `--warning` rather than the muted trust tone of `CredibilityIcon` — this
 * is a caution signal, not a quiet trust cue.
 */
export function ArguableIcon({ arguable, className = '' }: { arguable?: Arguable | null; className?: string }) {
  if (!isArguable(arguable)) return null
  return (
    <TriangleAlert
      size={11}
      strokeWidth={2}
      className={`shrink-0 text-[var(--warning)] ${className}`}
      aria-label="Disputed"
    />
  )
}

/**
 * Icon + "Disputed" label — the fuller readout used in the citation hover
 * card, the sources sidebar, and the References list. Renders nothing when
 * the source isn't flagged, so unflagged/older content looks unchanged.
 */
export function ArguableTag({ arguable, className = '' }: { arguable?: Arguable | null; className?: string }) {
  if (!isArguable(arguable)) return null
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-[var(--warning)]/30 bg-[var(--warning)]/[0.08] px-2 py-[3px] text-[10.5px] leading-none text-[var(--warning)] ${className}`}
    >
      <TriangleAlert size={10} strokeWidth={2} className="shrink-0" />
      Disputed
    </span>
  )
}

/** One-line explanation of *why* this specific source is disputed, shown at
 * the bottom of the citation hover card. Renders the backend's own
 * source-specific `reason`. Renders nothing when the source isn't flagged. */
export function ArguableExplanation({ arguable }: { arguable?: Arguable | null }) {
  if (!isArguable(arguable)) return null
  return (
    <div className="border-t border-[var(--line-hair)] px-3 py-2">
      <p className="text-[11px] leading-relaxed text-[var(--ink-muted)]">
        <span className="text-[var(--warning)]">Disputed:</span> {arguable!.reason}
      </p>
    </div>
  )
}
