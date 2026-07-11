// Mirrors the backend's classification tiers (core/utils/source_credibility.py).
export type CredibilityLabel = 'official' | 'trusted' | 'first_party' | 'social_media' | 'junk' | 'unknown'

/** What a `Source`/`CheckSourceMatch`'s `credibility` field actually carries —
 * the backend always sends both: `reason` is a real, source-specific
 * one-sentence explanation (LLM-written, or a templated sentence for the
 * regex-resolved tiers), never a generic label definition. */
export interface Credibility {
  label: CredibilityLabel
  reason: string
}

export interface CredibilityMeta {
  /** Short display name for the label, e.g. "Official". */
  label: string
  /** Whether this tier earns the shield-check trust glyph in the compact
   * inline citation pill — reserved for the three "the reader can lean on
   * this" tiers, per design: official / trusted / first-party only. */
  trusted: boolean
}

type KnownLabel = Exclude<CredibilityLabel, 'unknown'>

export const CREDIBILITY_META: Record<KnownLabel, CredibilityMeta> = {
  official: { label: 'Official', trusted: true },
  trusted: { label: 'Trusted', trusted: true },
  first_party: { label: 'Primary source', trusted: true },
  social_media: { label: 'Social media', trusted: false },
  junk: { label: 'Low quality', trusted: false },
}

/** Returns null for "unknown"/missing — those render nothing, not a
 * placeholder, so content saved before this field existed looks unchanged. */
export function getCredibilityMeta(credibility?: Credibility | null): CredibilityMeta | null {
  if (!credibility || credibility.label === 'unknown') return null
  return CREDIBILITY_META[credibility.label as KnownLabel] ?? null
}

/** True for the three "the reader can lean on this" tiers (official /
 * trusted / first-party) — used to float those sources to the top of a
 * list without otherwise reordering it. */
export function isTrustedTier(credibility?: Credibility | null): boolean {
  return getCredibilityMeta(credibility)?.trusted ?? false
}
