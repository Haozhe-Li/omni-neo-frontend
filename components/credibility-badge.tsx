'use client'

import { ShieldCheck } from 'lucide-react'
import type { Credibility } from '@/lib/credibility'
import { getCredibilityMeta } from '@/lib/credibility'

/**
 * Small neutral shield-check glyph shown next to a citation only when its
 * source is official / trusted / first-party. Deliberately icon-only,
 * low-saturation, and un-colored (inherits the surrounding muted-foreground
 * tone) — a quiet trust signal, not an alert badge.
 */
export function CredibilityIcon({ credibility, className = '' }: { credibility?: Credibility | null; className?: string }) {
  const meta = getCredibilityMeta(credibility)
  if (!meta?.trusted) return null
  return (
    <ShieldCheck
      size={11}
      strokeWidth={2}
      className={`shrink-0 text-[var(--muted-foreground)] opacity-70 ${className}`}
      aria-label={meta.label}
    />
  )
}

/**
 * Icon (when applicable) + label — the fuller "what kind of source is this"
 * readout used in the citation hover card, the sources sidebar, and the
 * References list. Renders nothing for "unknown"/missing credibility so
 * older content (saved before this field existed) looks unchanged.
 */
export function CredibilityTag({ credibility, className = '' }: { credibility?: Credibility | null; className?: string }) {
  const meta = getCredibilityMeta(credibility)
  if (!meta) return null
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)] px-1.5 py-0.5 text-[10.5px] font-medium leading-none text-[var(--muted-foreground)] ${className}`}
    >
      {meta.trusted && <ShieldCheck size={10} strokeWidth={2} className="shrink-0 opacity-80" />}
      {meta.label}
    </span>
  )
}

/** One-line explanation of *this specific* source's credibility, shown at
 * the bottom of the citation hover card. Renders the backend's own
 * source-specific `reason` (not a generic per-label definition) — only ever
 * explains the one source actually being shown, not every tier at once.
 * Renders nothing for "unknown"/missing credibility. */
export function CredibilityExplanation({ credibility }: { credibility?: Credibility | null }) {
  const meta = getCredibilityMeta(credibility)
  if (!meta || !credibility) return null
  return (
    <div className="border-t border-[var(--border-subtle)] px-3 py-2">
      <p className="text-[10.5px] leading-relaxed text-[var(--muted-foreground)]/80">
        <span className="font-medium text-[var(--muted-foreground)]">{meta.label}:</span> {credibility.reason}
      </p>
    </div>
  )
}
