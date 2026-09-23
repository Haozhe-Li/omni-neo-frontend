'use client'

import { BookOpen, FileText, X } from 'lucide-react'
import { toast } from 'sonner'
import type { CheckSourceMatch, CheckSourceState, Source } from '@/lib/types'
import { canHighlightExcerpt, highlightExcerpt, type HighlightSegment } from '@/lib/highlight'
import { isTrustedTier } from '@/lib/credibility'
import { CredibilityTag } from '@/components/credibility-badge'
import { ArguableTag } from '@/components/arguable-badge'
import { SafeLink } from '@/components/safe-link'

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/**
 * Source snippets are raw scraped chunks, and they read like it: half-broken
 * markdown links from a wiki mirror, reference brackets, table pipes, runs of
 * newlines from a stripped nav. None of that survives being shown at 12px in
 * a 248px column — it just looks like the card is corrupted. This pulls the
 * prose back out: link text without the target, no emphasis marks, no
 * citation or edit brackets, single spaces.
 */
function cleanSnippet(raw: string): string {
  return (
    raw
      .replace(/```[\s\S]*?```/g, ' ')
      // `[label](/target)`, and the bare `](/target)` fragments left behind
      // when a scraper cuts a link in half.
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\]\([^)]*\)/g, '')
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s{0,3}[-*+]\s+/gm, '')
      .replace(/^\s{0,3}>\s?/gm, '')
      // Wikipedia-style reference and edit markers.
      .replace(/\[\s*(?:\d+|edit|citation needed)\s*\]/gi, '')
      .replace(/[*_`~|]/g, ' ')
      .replace(/\s*\n\s*/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([,.;:!?])/g, '$1')
      // A chunk almost always starts mid-sentence, so it opens on the tail of
      // the previous one — a lone ". " or ", " before the first real word.
      // An ellipsis says "picks up mid-thought" without looking like a typo.
      .replace(/^[\s.,;:!?)\]}\u2019\u201d>-]+/, '')
      .trim()
      .replace(/^(?=[a-z\u00e0-\u024f])/, '\u2026 ')
  )
}

/**
 * Trim a highlighted passage down to a window around the match.
 *
 * `highlightExcerpt` returns the matched phrase plus a couple of lines either
 * side, and on a long chunk that is still a wall of text in a 248px column.
 * Worse, clamping it with CSS would sometimes cut off the highlight itself —
 * the one part worth showing. So the trim happens per segment instead:
 * leading context keeps its tail, trailing context keeps its head, and the
 * match survives whole in between.
 */
const _CONTEXT_CHARS = 90
const _MATCH_CHARS = 220

function windowAround(segments: HighlightSegment[]): HighlightSegment[] {
  const first = segments.findIndex((s) => s.highlight)
  const last = segments.map((s) => s.highlight).lastIndexOf(true)
  if (first === -1) {
    // No match found — `highlightExcerpt` already fell back to a plain prefix.
    const text = segments.map((s) => s.text).join('')
    return [{ text: text.slice(0, _CONTEXT_CHARS * 2).trimEnd() + (text.length > _CONTEXT_CHARS * 2 ? '…' : ''), highlight: false }]
  }
  return segments.flatMap((seg, i) => {
    if (seg.highlight) {
      const t = seg.text.length > _MATCH_CHARS ? seg.text.slice(0, _MATCH_CHARS).trimEnd() + '…' : seg.text
      return [{ text: t, highlight: true }]
    }
    if (i < first) {
      // Only the context immediately before the match earns space.
      if (i !== first - 1) return []
      const t = seg.text.length > _CONTEXT_CHARS ? '…' + seg.text.slice(-_CONTEXT_CHARS).trimStart() : seg.text
      return [{ text: t, highlight: false }]
    }
    if (i > last) {
      if (i !== last + 1) return []
      const t = seg.text.length > _CONTEXT_CHARS ? seg.text.slice(0, _CONTEXT_CHARS).trimEnd() + '…' : seg.text
      return [{ text: t, highlight: false }]
    }
    return [seg]
  })
}

/** Float official/trusted/first-party sources up without otherwise reshuffling. */
function sortByTrust<T extends { credibility?: Source['credibility'] }>(list: T[]): T[] {
  return [...list].sort((a, b) => Number(isTrustedTier(b.credibility)) - Number(isTrustedTier(a.credibility)))
}

// A match whose excerpt can't be located in its own chunk (see
// `canHighlightExcerpt`) falls back to a plain, unhighlighted prefix — the
// least useful card in this view, since the whole point is showing which
// exact words back the claim. Those sink to the bottom instead of being
// interleaved with the ones that actually prove something, and the list is
// capped short: five cards you can scan beats a dozen you have to.
const CHECK_SOURCE_CAP = 5

function rankedMatches(matches: CheckSourceMatch[]): CheckSourceMatch[] {
  return [...matches]
    .sort(
      (a, b) =>
        Number(canHighlightExcerpt(b.chunk, b.excerpt, b.title, b.url)) -
        Number(canHighlightExcerpt(a.chunk, a.excerpt, a.title, a.url))
    )
    .slice(0, CHECK_SOURCE_CAP)
}

const notifyUploadedDocument = () =>
  toast.info("This is a document you uploaded — it can't be opened as a link.")

/** Favicon + host. Shared by the plain card and the check view. */
function CardHead({ url }: { url: string }) {
  const isDocument = !url
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-[var(--sand)]">
        {isDocument ? (
          <FileText size={10} className="text-[var(--ink-faint)]" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`https://www.google.com/s2/favicons?domain=${hostOf(url)}&sz=64`}
            alt=""
            className="h-full w-full object-cover"
          />
        )}
      </span>
      <span className="omni-mono min-w-0 flex-1 truncate text-[11px] text-[var(--ink-muted)]">
        {isDocument ? 'Uploaded document' : hostOf(url)}
      </span>
    </span>
  )
}

/**
 * One source beside an answer.
 *
 * No citation number. The rail lists only what this turn actually cited, in
 * trust order — a number would imply the rail is an index you look things up
 * in, when it is really the reading list the answer was built from. The host
 * and title are what a reader recognizes.
 */
export function SourceCard({ source, compact = false }: { source: Source; compact?: boolean }) {
  const isDocument = !source.url
  const snippet = source.content ? cleanSnippet(source.content) : ''

  const body = (
    <>
      <CardHead url={source.url} />
      <span
        className={`mt-2 text-[var(--ink)] ${
          compact ? 'line-clamp-3 text-[13.5px] leading-[1.4]' : 'line-clamp-2 text-[16px] leading-[1.45]'
        }`}
      >
        {source.title}
      </span>
      {snippet && (
        <span
          className={`mt-1.5 text-[var(--ink-muted)] ${
            compact ? 'line-clamp-[5] text-[12px] leading-[1.6]' : 'line-clamp-4 text-[14px] leading-[1.6]'
          }`}
        >
          {snippet}
        </span>
      )}
      <span className="mt-2.5 flex items-center gap-1.5">
        <CredibilityTag credibility={source.credibility} />
        <ArguableTag credibility={source.credibility} />
      </span>
    </>
  )

  const className = `flex flex-col rounded-[16px] border border-[var(--line)] bg-[var(--paper-raised)] text-left transition-colors hover:border-[var(--teal)] hover:bg-[var(--teal-tint)] ${
    compact ? 'px-3.5 py-3' : 'px-5 py-4'
  }`

  if (isDocument) {
    return (
      <button type="button" onClick={notifyUploadedDocument} className={`${className} w-full`}>
        {body}
      </button>
    )
  }
  return (
    <SafeLink href={source.url} credibility={source.credibility} className={className}>
      {body}
    </SafeLink>
  )
}

/**
 * A source that backs the claim currently being checked.
 *
 * The passage is set as a pull-quote rather than a grey code-ish block: the
 * matched phrase sits at full ink weight with the surrounding lines dropped
 * back, so "which words back this" is answerable at a glance instead of by
 * reading the whole chunk. A rust rule down the left marks it as quoted
 * material, the same way a blockquote does inside an answer.
 */
function CheckMatchCard({ match, compact }: { match: CheckSourceMatch; compact: boolean }) {
  const segments = windowAround(highlightExcerpt(match.chunk, match.excerpt, match.title, match.url))
  const isDocument = !match.url

  // Deliberately the same shape as SourceCard — head, title, body, tag, at the
  // same sizes. A source is a source whether you arrived at it by browsing or
  // by checking a claim, and giving the check view its own card made the rail
  // look like it had swapped to a different product mid-thread. The only
  // difference is what the body says: the passage, with the matched phrase
  // marked, in place of the snippet.
  const body = (
    <>
      <CardHead url={match.url} />
      <span
        className={`mt-2 text-[var(--ink)] ${
          compact ? 'line-clamp-3 text-[13.5px] leading-[1.4]' : 'line-clamp-2 text-[16px] leading-[1.45]'
        }`}
      >
        {match.title}
      </span>
      <span
        className={`mt-1.5 block ${
          compact ? 'text-[12px] leading-[1.6]' : 'text-[14px] leading-[1.6]'
        }`}
      >
        {segments.map((seg, i) =>
          seg.highlight ? (
            <span key={i} className="rounded-[3px] bg-[var(--teal-tint)] px-0.5 text-[var(--ink-body)]">
              {seg.text}
            </span>
          ) : (
            <span key={i} className="text-[var(--ink-muted)]">
              {seg.text}
            </span>
          )
        )}
      </span>
      <span className="mt-2.5 flex items-center gap-1.5">
        <CredibilityTag credibility={match.credibility} />
        <ArguableTag credibility={match.credibility} />
      </span>
    </>
  )

  const className = `flex flex-col rounded-[16px] border border-[var(--line)] bg-[var(--paper-raised)] text-left transition-colors hover:border-[var(--teal)] hover:bg-[var(--teal-tint)] ${
    compact ? 'px-3.5 py-3' : 'px-5 py-4'
  }`

  if (isDocument) {
    return (
      <button type="button" onClick={notifyUploadedDocument} className={`${className} w-full`}>
        {body}
      </button>
    )
  }
  return (
    <SafeLink href={match.url} credibility={match.credibility} className={className}>
      {body}
    </SafeLink>
  )
}

function CheckSkeleton({ delay }: { delay: number }) {
  // Two animations, kept on separate elements rather than combined into one
  // `animation` shorthand: the outer div's `animate-in` is a one-shot mount
  // transition (tw-animate-css's own `enter` keyframe), the inner div's pulse
  // loops forever — stacking both on one element would mean one shorthand
  // silently overwrites the other instead of running alongside it.
  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 fill-mode-backwards duration-300" style={{ animationDelay: `${delay}ms` }}>
      <div
        className="flex flex-col gap-2 rounded-[16px] border border-[var(--line)] bg-[var(--paper-raised)] px-3.5 py-3"
        style={{ animation: `omni-soft-pulse 1300ms ease-in-out ${delay}ms infinite` }}
      >
        <div className="h-2 w-1/2 rounded-full bg-[var(--line-strong)]" />
        <div className="mt-1 h-2 w-4/5 rounded-full bg-[var(--line-strong)]" />
        <div className="h-2 w-2/3 rounded-full bg-[var(--line-strong)]" />
      </div>
    </div>
  )
}

export interface SourcesRailProps {
  /** Sources this turn's answer cites. While `researching`, all of them. */
  cited: Source[]
  /** Fetched this turn and not cited — collapsed behind a toggle. */
  unused: Source[]
  /** Turn still running: show everything flat, nothing has been cited yet. */
  researching?: boolean
  /** Set while a claim is being checked; takes the rail over until dismissed. */
  checkSource?: CheckSourceState | null
  onDismissCheck?: () => void
  /** The rail is 248px wide; the inline fallback under an answer is not. */
  compact?: boolean
}

/**
 * The thread's sources, scoped to the turn on screen.
 *
 * Scoped, not accumulated: a five-turn thread's merged list is mostly sources
 * that have nothing to do with the answer you are reading, and stacking them
 * up makes the rail grow into a log. Each turn shows what that turn cited.
 */
export function SourcesRail({
  cited,
  unused,
  researching = false,
  checkSource,
  onDismissCheck,
  compact = false,
}: SourcesRailProps) {
  if (checkSource) {
    const done = checkSource.status === 'done'
    const shown = done ? rankedMatches(checkSource.matches) : []
    return (
      // `display: contents` keyed on the claim: header, quote and cards stay
      // direct flex children of the rail (so the parent's `gap` still spaces
      // them) while sharing one identity that changes with the claim —
      // checking a second claim without dismissing the first unmounts and
      // remounts this whole group, which is what replays the fade-in below
      // instead of silently updating text in place.
      <div key={checkSource.claim} className="contents">
        {/* ── Checking a claim ──────────────────────────────────────────────
            The rail becomes a single-question view: here is the sentence, and
            here is what says it. The header says which of the two states it
            is in, and the X is the only way out — this is a mode, not a
            filter on the list underneath. */}
        <div className="flex items-center justify-between gap-2 animate-in fade-in duration-200">
          <span className="omni-eyebrow text-[var(--teal)]">
            {done ? (shown.length > 0 ? `Backed by ${shown.length}` : 'No direct match') : 'Checking sources'}
          </span>
          <button
            onClick={onDismissCheck}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--line-strong)] text-[var(--ink-muted)] transition-colors hover:border-[var(--teal)] hover:text-[var(--teal)]"
            title="Back to sources"
          >
            <X size={11} />
          </button>
        </div>

        {/* The claim, quoted back — without it the passages below answer a
            question the reader has to hold in their head. Set in the UI face
            at body size, not the display serif: it sits directly above a
            column of source cards, and a large italic serif line there read
            as a pull-quote demanding to be read rather than as the reference
            point for what follows. Clamped, because a long selection is
            recognisable from its opening. */}
        <div className="rounded-[16px] border border-[var(--teal-line)] bg-[var(--teal-tint)] px-3.5 py-3 animate-in fade-in duration-200">
          <p
            className={`line-clamp-3 text-[var(--ink-body)] ${
              compact ? 'text-[12.5px] leading-[1.55]' : 'text-[14px] leading-[1.6]'
            }`}
          >
            {checkSource.claim}
          </p>
        </div>

        {checkSource.status === 'loading' ? (
          [0, 1, 2].map((i) => <CheckSkeleton key={i} delay={i * 160} />)
        ) : shown.length > 0 ? (
          shown.map((m, i) => (
            <div
              key={`${m.url}-${i}`}
              className="animate-in fade-in slide-in-from-bottom-1 fill-mode-backwards duration-300"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <CheckMatchCard match={m} compact={compact} />
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-[16px] border border-dashed border-[var(--line-strong)] px-4 py-7 text-center animate-in fade-in duration-300">
            <BookOpen size={20} strokeWidth={1.25} className="text-[var(--ink-fainter)]" />
            <p className="text-[12.5px] leading-[1.55] text-[var(--ink-muted)]">
              Nothing here says this outright. It may combine several sources, or rest on general knowledge.
            </p>
          </div>
        )}
      </div>
    )
  }

  if (cited.length === 0 && unused.length === 0) return null

  // Cited sources first, everything else the turn read after — one flat,
  // uncollapsed list. There used to be a "N read but not used" toggle
  // hiding the second half; that made a turn with zero citations (a summary
  // that leans on general knowledge, say) show nothing at all even though it
  // read a pile of sources. Ranking instead of hiding means there's always
  // something to show as long as the turn fetched anything.
  const ranked = [...sortByTrust(cited), ...sortByTrust(unused)]

  return (
    <>
      <div className="omni-eyebrow">
        {/* Mid-run the count is still climbing, so it reads as an activity
            rather than a total. */}
        {researching ? `Reading · ${cited.length}` : `Sources · ${ranked.length}`}
      </div>

      {ranked.map((s, i) => (
        <SourceCard key={`${s.url || 'doc'}-${i}`} source={s} compact={compact} />
      ))}
    </>
  )
}
