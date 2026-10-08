/**
 * Drawing from the prepared query set (lib/collector/queries.ts).
 *
 * Pure: the page keeps the "already used" ids (and persists them), this only decides
 * what to draw. A draw avoids ids already used; when a filter has run dry it says so
 * rather than quietly repeating, and the page offers a reset.
 */
import { PREPARED_QUERIES, type PreparedQuery } from './queries'
import type { SkillId } from './fields'

export interface QueryFilter {
  /** '' = every category. */
  cat: string
  /** '' = both languages. */
  lang: '' | 'zh' | 'en'
  /** Leave out queries whose original design needed an input the collector has no field for. */
  skipUnavailable: boolean
}

export const NO_FILTER: QueryFilter = { cat: '', lang: '', skipUnavailable: true }

// attached_files / priority_sources / follow_up_selection: see queries.ts.
const UNAVAILABLE = new Set(['attached_files', 'priority_sources', 'follow_up_selection'])

export function matches(q: PreparedQuery, f: QueryFilter): boolean {
  if (f.cat && q.cat !== f.cat) return false
  if (f.lang && q.lang !== f.lang) return false
  if (f.skipUnavailable && q.block && UNAVAILABLE.has(q.block)) return false
  return true
}

export function pool(f: QueryFilter): PreparedQuery[] {
  return PREPARED_QUERIES.filter((q) => matches(q, f))
}

/** Categories with their size under the *other* filters, for the dropdown. */
export function categories(f: QueryFilter): { cat: string; n: number }[] {
  const counts = new Map<string, number>()
  for (const q of PREPARED_QUERIES) {
    if (matches(q, { ...f, cat: '' })) counts.set(q.cat, (counts.get(q.cat) ?? 0) + 1)
  }
  return [...counts].map(([cat, n]) => ({ cat, n })).sort((a, b) => a.cat.localeCompare(b.cat))
}

/** A random unused query matching the filter, or null when none is left. */
export function draw(f: QueryFilter, used: ReadonlySet<string>, rng: () => number = Math.random): PreparedQuery | null {
  const left = pool(f).filter((q) => !used.has(q.id))
  return left.length ? left[Math.floor(rng() * left.length)] : null
}

export function findByText(text: string): PreparedQuery | undefined {
  const t = text.trim()
  return PREPARED_QUERIES.find((q) => q.text === t)
}

/** The skill the original design had the user pick for this query, if any. Only the
 *  `requested_skill` queries carry one; their category says which (the backend's
 *  REQUESTED_SKILL_BY_CAT, restricted to what the chat's picker can send). */
export function skillFor(q: PreparedQuery): SkillId | '' {
  if (q.block !== 'requested_skill') return ''
  if (q.cat === 'teach') return 'guided-learning'
  if (q.cat === 'deep-research' || q.cat === 'budget-exhausted' || q.cat === 'search-fact') return 'deep-research'
  return ''
}
