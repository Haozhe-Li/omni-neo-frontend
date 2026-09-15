// Mirrors the backend's dispute-flag classification, alongside credibility
// (see `lib/credibility.ts`) — a second, independent signal on a source: not
// "how trustworthy is this publisher" but "does this specific source's
// content conflict with other sources / contain disputed claims".

/** What a `Source`/`CheckSourceMatch`'s `arguable` field actually carries —
 * `reason` is a real, source-specific one-sentence explanation of *why* it's
 * disputed, never a generic definition. */
export interface Arguable {
  arguable: boolean
  reason: string
}

/** True only when the backend explicitly flagged this source as disputed.
 * Absent/missing means "not flagged" — treat it the same as `false`, not as
 * "verified clean", so content saved before this field existed looks
 * unchanged. */
export function isArguable(arguable?: Arguable | null): boolean {
  return !!arguable?.arguable
}
