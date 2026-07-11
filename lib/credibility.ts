// Mirrors the backend's classification tiers (core/utils/source_credibility.py).
export type CredibilityLabel = 'official' | 'trusted' | 'first_party' | 'social_media' | 'junk' | 'unknown'

export interface CredibilityMeta {
  label: string
  description: string
  /** Whether this tier earns the shield-check trust glyph in the compact
   * inline citation pill — reserved for the three "the reader can lean on
   * this" tiers, per design: official / trusted / first-party only. */
  trusted: boolean
}

type KnownLabel = Exclude<CredibilityLabel, 'unknown'>

export const CREDIBILITY_META: Record<KnownLabel, CredibilityMeta> = {
  official: {
    label: 'Official',
    description: 'A government, military, or accredited educational institution.',
    trusted: true,
  },
  trusted: {
    label: 'Trusted',
    description: 'A well-established, editorially rigorous, widely recognized source.',
    trusted: true,
  },
  first_party: {
    label: 'Primary source',
    description: "Published directly by the person, company, or organization it's about.",
    trusted: true,
  },
  social_media: {
    label: 'Social media',
    description: 'A social media or forum post — credibility depends on the poster, not the platform.',
    trusted: false,
  },
  junk: {
    label: 'Low quality',
    description: 'Flagged as spam, clickbait, or otherwise unreliable.',
    trusted: false,
  },
}

/** Returns null for "unknown"/missing — those render nothing, not a
 * placeholder, so content saved before this field existed looks unchanged. */
export function getCredibilityMeta(credibility?: string | null): CredibilityMeta | null {
  if (!credibility || credibility === 'unknown') return null
  return CREDIBILITY_META[credibility as KnownLabel] ?? null
}

/** True for the three "the reader can lean on this" tiers (official /
 * trusted / first-party) — used to float those sources to the top of a
 * list without otherwise reordering it. */
export function isTrustedTier(credibility?: string | null): boolean {
  return getCredibilityMeta(credibility)?.trusted ?? false
}

