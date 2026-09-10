'use client'

import { useEffect, useState } from 'react'
import { BookOpen, ChevronDown, FileText, X } from 'lucide-react'
import { toast } from 'sonner'
import type { CheckSourceMatch, CheckSourceState, Source } from '@/lib/types'
import { highlightExcerpt } from '@/lib/highlight'
import { isTrustedTier } from '@/lib/credibility'
import { CredibilityTag } from '@/components/credibility-badge'

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

/** Float official/trusted/first-party sources up without otherwise reshuffling. */
function sortByTrust<T extends { credibility?: Source['credibility'] }>(list: T[]): T[] {
  return [...list].sort((a, b) => Number(isTrustedTier(b.credibility)) - Number(isTrustedTier(a.credibility)))
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
      <span className="mt-2.5 flex items-center">
        <CredibilityTag credibility={source.credibility} />
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
    <a href={source.url} target="_blank" rel="noopener noreferrer" className={className}>
      {body}
    </a>
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
  const segments = highlightExcerpt(match.chunk, match.excerpt, match.title, match.url)
  const isDocument = !match.url

  const body = (
    <>
      <CardHead url={match.url} />
      <span
        className={`mt-2 line-clamp-2 text-[var(--ink)] ${
          compact ? 'text-[13.5px] leading-[1.4]' : 'text-[16px] leading-[1.45]'
        }`}
      >
        {match.title}
      </span>
      <span
        className={`mt-2.5 block border-l-2 border-[var(--rust)] pl-3 ${
          compact ? 'text-[12.5px] leading-[1.65]' : 'text-[14px] leading-[1.7]'
        }`}
      >
        {segments.map((seg, i) =>
          seg.highlight ? (
            <span key={i} className="rounded-[3px] bg-[var(--teal-tint)] px-0.5 text-[var(--ink)]">
              {seg.text}
            </span>
          ) : (
            // Context, deliberately faint: it is here to put the phrase back
            // in its sentence, not to be read.
            <span key={i} className="text-[var(--ink-fainter)]">
              {seg.text}
            </span>
          )
        )}
      </span>
      <span className="mt-2.5 flex items-center">
        <CredibilityTag credibility={match.credibility} />
      </span>
    </>
  )

  const className = `flex flex-col rounded-[16px] border border-[var(--line)] bg-[var(--paper-raised)] text-left transition-colors hover:border-[var(--teal)] ${
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
    <a href={match.url} target="_blank" rel="noopener noreferrer" className={className}>
      {body}
    </a>
  )
}

function CheckSkeleton({ delay }: { delay: number }) {
  return (
    <div
      className="flex flex-col gap-2 rounded-[16px] border border-[var(--line)] bg-[var(--paper-raised)] px-3.5 py-3"
      style={{ animation: `omni-soft-pulse 1300ms ease-in-out ${delay}ms infinite` }}
    >
      <div className="h-2 w-1/2 rounded-full bg-[var(--line-strong)]" />
      <div className="mt-1 h-2 w-4/5 rounded-full bg-[var(--line-strong)]" />
      <div className="h-2 w-2/3 rounded-full bg-[var(--line-strong)]" />
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
  const [showUnused, setShowUnused] = useState(false)
  // Collapse back down when the turn changes — "read but not used" is opened
  // for one answer, not left open across the thread.
  useEffect(() => setShowUnused(false), [cited, unused])

  if (checkSource) {
    const done = checkSource.status === 'done'
    return (
      <>
        {/* ── Checking a claim ──────────────────────────────────────────────
            The rail becomes a single-question view: here is the sentence, and
            here is what says it. The header says which of the two states it
            is in, and the X is the only way out — this is a mode, not a
            filter on the list underneath. */}
        <div className="flex items-center justify-between gap-2">
          <span className="omni-eyebrow text-[var(--teal)]">
            {done
              ? checkSource.matches.length > 0
                ? `Backed by ${checkSource.matches.length}`
                : 'No direct match'
              : 'Checking sources'}
          </span>
          <button
            onClick={onDismissCheck}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--line-strong)] text-[var(--ink-muted)] transition-colors hover:border-[var(--teal)] hover:text-[var(--teal)]"
            title="Back to sources"
          >
            <X size={11} />
          </button>
        </div>

        {/* The claim, quoted back. Without it the passages below answer a
            question the reader has to hold in their head. Set in the display
            serif because it is a quotation of the answer's own prose, not a
            piece of UI copy about it. */}
        <div className="rounded-[16px] border border-[var(--teal-line)] bg-[var(--teal-tint)] px-4 py-3.5">
          <p
            className={`omni-display italic text-[var(--ink)] ${
              compact ? 'text-[15px] leading-[1.4]' : 'text-[18px] leading-[1.4]'
            }`}
          >
            {checkSource.claim}
          </p>
        </div>

        {checkSource.status === 'loading' ? (
          [0, 1, 2].map((i) => <CheckSkeleton key={i} delay={i * 160} />)
        ) : checkSource.matches.length > 0 ? (
          checkSource.matches.map((m, i) => <CheckMatchCard key={`${m.url}-${i}`} match={m} compact={compact} />)
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-[16px] border border-dashed border-[var(--line-strong)] px-4 py-7 text-center">
            <BookOpen size={20} strokeWidth={1.25} className="text-[var(--ink-fainter)]" />
            <p className="text-[12.5px] leading-[1.55] text-[var(--ink-muted)]">
              Nothing here says this outright. It may combine several sources, or rest on general knowledge.
            </p>
          </div>
        )}
      </>
    )
  }

  if (cited.length === 0 && unused.length === 0) return null

  return (
    <>
      <div className="omni-eyebrow">
        {/* Mid-run the count is still climbing, so it reads as an activity
            rather than a total. */}
        {researching ? `Reading · ${cited.length}` : `Sources · ${cited.length}`}
      </div>

      {sortByTrust(cited).map((s, i) => (
        <SourceCard key={`${s.url || 'doc'}-${i}`} source={s} compact={compact} />
      ))}

      {/* Read but not used: everything the agent opened this turn and did not
          end up citing. Worth keeping — it is the difference between "these
          are the sources" and "these are the sources it chose" — but not
          worth the same weight as the ones the answer rests on. Never shown
          mid-run: until an answer exists, nothing has been "not used" yet. */}
      {!researching && unused.length > 0 && (
        <div className={cited.length > 0 ? 'mt-1' : ''}>
          <button
            type="button"
            onClick={() => setShowUnused((v) => !v)}
            className="omni-eyebrow flex w-full items-center gap-1.5 transition-colors hover:text-[var(--teal)]"
          >
            <ChevronDown
              size={12}
              className={`shrink-0 transition-transform duration-200 ${showUnused ? 'rotate-180' : ''}`}
            />
            {unused.length} read but not used
          </button>
          <div
            className="grid transition-[grid-template-rows,opacity] duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
            style={{ gridTemplateRows: showUnused ? '1fr' : '0fr', opacity: showUnused ? 1 : 0 }}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="flex flex-col gap-2.5 pt-2.5">
                {sortByTrust(unused).map((s, i) => (
                  <SourceCard key={`${s.url || 'doc'}-${i}`} source={s} compact={compact} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
