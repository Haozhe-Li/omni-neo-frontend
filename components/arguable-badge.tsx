'use client'

import { TriangleAlert } from 'lucide-react'
import type { Credibility } from '@/lib/credibility'
import { isArguable } from '@/lib/credibility'

/**
 * Small warning-triangle glyph shown next to a citation only when the
 * backend classified this source's credibility as "arguable" (a documented
 * reliability problem). Deliberately icon-only, using `--warning` rather
 * than the muted trust tone of `CredibilityIcon` — this is a caution signal,
 * not a quiet trust cue.
 */
export function ArguableIcon({ credibility, className = '' }: { credibility?: Credibility | null; className?: string }) {
  if (!isArguable(credibility)) return null
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
 * card, the sources sidebar, and the References list. Renders nothing unless
 * the source's credibility label is "arguable", so unflagged/older content
 * looks unchanged.
 */
export function ArguableTag({ credibility, className = '' }: { credibility?: Credibility | null; className?: string }) {
  if (!isArguable(credibility)) return null
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
 * source-specific `reason`. Renders nothing unless the source is flagged
 * "arguable". */
export function ArguableExplanation({ credibility }: { credibility?: Credibility | null }) {
  if (!isArguable(credibility)) return null
  return (
    <div className="border-t border-[var(--line-hair)] px-3 py-2">
      <p className="text-[11px] leading-relaxed text-[var(--ink-muted)]">
        <span className="text-[var(--warning)]">Disputed:</span> {credibility!.reason}
      </p>
    </div>
  )
}
