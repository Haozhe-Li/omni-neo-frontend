// Mirrors the backend's classification tiers (core/utils/source_credibility.py).
// "arguable" is a documented-reliability-problem tier, not a separate flag —
// it's handled by its own dedicated UI (see `components/arguable-badge.tsx`
// and `isArguable` below) rather than by `CREDIBILITY_META`/`CredibilityTag`.
export type CredibilityLabel =
  | 'official'
  | 'trusted'
  | 'first_party'
  | 'social_media'
  | 'arguable'
  | 'junk'
  | 'unknown'

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

// "arguable" is excluded here the same way "unknown" is: it renders through
// `ArguableTag`/`ArguableIcon`/`ArguableExplanation` instead of the generic
// credibility pill, so it must never gain a `CREDIBILITY_META` entry (that
// would make `CredibilityTag` render a second, redundant badge for it).
type KnownLabel = Exclude<CredibilityLabel, 'unknown' | 'arguable'>

export const CREDIBILITY_META: Record<KnownLabel, CredibilityMeta> = {
  official: { label: 'Official', trusted: true },
  trusted: { label: 'Trusted', trusted: true },
  first_party: { label: 'Primary source', trusted: true },
  social_media: { label: 'Social media', trusted: false },
  junk: { label: 'Low quality', trusted: false },
}

/** Returns null for "unknown"/"arguable"/missing — those render nothing (or,
 * for "arguable", render via the dedicated Arguable* components instead), not
 * a placeholder, so content saved before this field existed looks unchanged. */
export function getCredibilityMeta(credibility?: Credibility | null): CredibilityMeta | null {
  if (!credibility || credibility.label === 'unknown' || credibility.label === 'arguable') return null
  return CREDIBILITY_META[credibility.label as KnownLabel] ?? null
}

/** True for the three "the reader can lean on this" tiers (official /
 * trusted / first-party) — used to float those sources to the top of a
 * list without otherwise reordering it. */
export function isTrustedTier(credibility?: Credibility | null): boolean {
  return getCredibilityMeta(credibility)?.trusted ?? false
}

/** True only when the backend classified this specific source as "arguable"
 * (a documented reliability problem — see `source_credibility.py`), never a
 * generic viewpoint flag. Absent/other label means "not flagged" — treat
 * that the same as `false`, not as "verified clean", so content saved before
 * this tier existed looks unchanged. */
export function isArguable(credibility?: Credibility | null): boolean {
  return credibility?.label === 'arguable'
}

/** True when a click on this link must be gated by the Safe Link
 * interstitial before navigating — every label except the three trusted
 * tiers, and (since `isTrustedTier` is false for `undefined`) any link with
 * no credibility at all, e.g. a raw markdown URL the model typed with no
 * `[n]` citation attached. */
export function needsInterstitial(credibility?: Credibility | null): boolean {
  return !isTrustedTier(credibility)
}

export type SafeLinkSeverity = 'warning' | 'neutral'

/** The interstitial only draws two visual severities, not one per label:
 * "arguable"/"junk" reuse `ArguableTag`'s existing warning treatment (a
 * documented reliability problem), everything else gated (social_media,
 * unknown, or a link we couldn't verify) reads as merely unverified rather
 * than flagged. */
export function safeLinkSeverity(credibility?: Credibility | null): SafeLinkSeverity {
  return credibility?.label === 'arguable' || credibility?.label === 'junk' ? 'warning' : 'neutral'
}
