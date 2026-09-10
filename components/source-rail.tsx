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
      {source.content && (
        <span
          className={`mt-1.5 text-[var(--ink-muted)] ${
            compact ? 'line-clamp-[6] text-[12px] leading-[1.55]' : 'line-clamp-[8] text-[14px] leading-[1.6]'
          }`}
        >
          {source.content}
        </span>
      )}
      <span className="mt-2 flex items-center">
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
 * A source that backs the claim currently being checked, with the supporting
 * phrase highlighted inside its surrounding lines.
 *
 * This used to live in a drawer that slid over the thread. It belongs here:
 * "which of these sources says that" is a question about the list already on
 * screen, and answering it in a second panel made the reader hold two lists
 * of the same sources in their head.
 */
function CheckMatchCard({ match, compact }: { match: CheckSourceMatch; compact: boolean }) {
  const segments = highlightExcerpt(match.chunk, match.excerpt, match.title, match.url)
  const isDocument = !match.url

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
        className={`mt-2 block whitespace-pre-wrap rounded-[10px] bg-[var(--sand)] px-2.5 py-2 text-[var(--ink-muted)] ${
          compact ? 'text-[12px] leading-[1.55]' : 'text-[13.5px] leading-[1.6]'
        }`}
      >
        {segments.map((seg, i) =>
          seg.highlight ? (
            <mark
              key={i}
              className="rounded-[3px] bg-[var(--teal-tint)] px-0.5 text-[var(--ink)]"
              style={{ boxShadow: '0 0 0 1px var(--teal-line)' }}
            >
              {seg.text}
            </mark>
          ) : (
            <span key={i}>{seg.text}</span>
          )
        )}
      </span>
    </>
  )

  const className = `flex flex-col rounded-[16px] border border-[var(--teal-line)] bg-[var(--paper-raised)] text-left transition-colors hover:border-[var(--teal)] ${
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
      <div className="h-2.5 w-1/2 rounded-full bg-[var(--line-strong)]" />
      <div className="h-2.5 w-4/5 rounded-full bg-[var(--line-strong)]" />
      <div className="h-2.5 w-2/3 rounded-full bg-[var(--line-strong)]" />
    </div>
  )
}

export interface SourcesRailProps {
  /** Sources this turn's answer cites inline, in citation order. */
  cited: Source[]
  /** Fetched this turn and not cited — collapsed behind a toggle. */
  unused: Source[]
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
  checkSource,
  onDismissCheck,
  compact = false,
}: SourcesRailProps) {
  const [showUnused, setShowUnused] = useState(false)
  // Collapse back down when the turn changes — "read but not used" is opened
  // for one answer, not left open across the thread.
  useEffect(() => setShowUnused(false), [cited, unused])

  if (checkSource) {
    return (
      <>
        <div className="flex items-baseline justify-between gap-2">
          <div className="omni-eyebrow">
            {checkSource.status === 'loading' ? 'Checking' : `Backing this claim · ${checkSource.matches.length}`}
          </div>
          <button
            onClick={onDismissCheck}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[var(--ink-fainter)] transition-colors hover:text-[var(--teal)]"
            title="Back to sources"
          >
            <X size={12} />
          </button>
        </div>

        {/* The claim, quoted back — without it the highlighted passages below
            are answers to a question the reader has to remember. */}
        <div className="rounded-[14px] border border-[var(--teal-line)] bg-[var(--teal-tint)] px-3.5 py-3">
          <p className={`text-[var(--ink-body)] ${compact ? 'text-[12.5px] leading-[1.5]' : 'text-[14px] leading-[1.55]'}`}>
            {checkSource.claim}
          </p>
        </div>

        {checkSource.status === 'loading' ? (
          [0, 1, 2].map((i) => <CheckSkeleton key={i} delay={i * 160} />)
        ) : checkSource.matches.length > 0 ? (
          checkSource.matches.map((m, i) => <CheckMatchCard key={`${m.url}-${i}`} match={m} compact={compact} />)
        ) : (
          <div className="flex flex-col items-center gap-3 px-2 py-8 text-center">
            <BookOpen size={20} strokeWidth={1.25} className="text-[var(--ink-fainter)]" />
            <p className="text-[12.5px] leading-[1.55] text-[var(--ink-muted)]">
              No source here directly supports that passage — it may combine several, or rest on general knowledge.
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
        {cited.length > 0 ? `Sources · ${cited.length}` : 'Sources'}
      </div>

      {sortByTrust(cited).map((s, i) => (
        <SourceCard key={`${s.url || 'doc'}-${i}`} source={s} compact={compact} />
      ))}

      {/* Read but not used: everything the agent opened this turn and did not
          end up citing. Worth keeping — it is the difference between "these
          are the sources" and "these are the sources it chose" — but not
          worth the same visual weight as the ones the answer rests on. */}
      {unused.length > 0 && (
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
