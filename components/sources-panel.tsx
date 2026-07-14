'use client'

import { useEffect, useState } from 'react'
import { BookOpen, ChevronDown, FileText, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import type { CheckSourceMatch, CheckSourceState, Source } from '@/lib/types'
import { partitionSources, type LabeledSource } from '@/lib/markdown'
import { highlightExcerpt } from '@/lib/highlight'
import { truncateFilename } from '@/lib/domain'
import { CredibilityTag } from '@/components/credibility-badge'
import { isTrustedTier, type Credibility } from '@/lib/credibility'

// Stable sort (ties keep their original relative order) that floats
// official/trusted/first-party sources to the top of whatever list is being
// shown, without otherwise reshuffling it.
function sortByTrust(sources: Source[]): Source[] {
  return [...sources].sort((a, b) => Number(isTrustedTier(b.credibility)) - Number(isTrustedTier(a.credibility)))
}

function sortLabeledByTrust(labeled: LabeledSource[]): LabeledSource[] {
  return [...labeled].sort(
    (a, b) => Number(isTrustedTier(b.source.credibility)) - Number(isTrustedTier(a.source.credibility))
  )
}

function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

const notifyUploadedDocument = () =>
  toast.info("This is a document you uploaded — it can't be opened as a link.")

// Favicon + domain/title row shared by SourceCard and CheckSourceCard — a
// user-uploaded document (source.url === '') gets a generic file icon and its
// filename instead, and isn't clickable. Takes a structural {url, title}
// rather than `Source` so it also accepts a `CheckSourceMatch`.
function SourceCardHeader({ source }: { source: { url: string; title: string; credibility?: Credibility } }) {
  const isDocument = !source.url
  return (
    <div className="mb-1.5 flex items-center gap-2">
      <span className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-[var(--secondary)]">
        {isDocument ? (
          <FileText size={11} className="text-[var(--muted-foreground)]" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`https://www.google.com/s2/favicons?domain=${domainOf(source.url)}&sz=64`}
            alt=""
            className="h-full w-full object-cover"
          />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--muted-foreground)]">
        {isDocument ? truncateFilename(source.title, 30, true) : domainOf(source.url)}
      </span>
      <CredibilityTag credibility={source.credibility} />
    </div>
  )
}

function SourceCard({ source }: { source: Source }) {
  const isDocument = !source.url
  const body = (
    <>
      <SourceCardHeader source={source} />
      <div className="text-[13px] font-medium leading-snug text-[var(--foreground)] line-clamp-2">{source.title}</div>
      {source.content && (
        <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--muted-foreground)] line-clamp-3">{source.content}</p>
      )}
    </>
  )
  const className =
    'block rounded-lg border border-[var(--border-subtle)] bg-[var(--card)] p-3 transition-colors hover:bg-[var(--secondary)]/60'

  if (isDocument) {
    return (
      <button type="button" onClick={notifyUploadedDocument} className={`${className} w-full text-left`}>
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

function CheckSourceCard({ match }: { match: CheckSourceMatch }) {
  const isDocument = !match.url
  const segments = highlightExcerpt(match.chunk, match.excerpt, match.title, match.url)
  const body = (
    <>
      <SourceCardHeader source={match} />
      <div className="text-[13px] font-medium leading-snug text-[var(--foreground)] line-clamp-2">{match.title}</div>
      <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--muted-foreground)]">
        {segments.map((seg, i) =>
          seg.highlight ? (
            <mark
              key={i}
              className="box-decoration-clone rounded-[3px] bg-[color-mix(in_srgb,var(--accent)_28%,transparent)] px-0.5 text-[var(--foreground)]"
            >
              {seg.text}
            </mark>
          ) : (
            <span key={i}>{seg.text}</span>
          )
        )}
      </p>
    </>
  )
  const className =
    'block rounded-lg border border-[var(--border-subtle)] bg-[var(--card)] p-3 transition-colors hover:bg-[var(--secondary)]/60'

  if (isDocument) {
    return (
      <button type="button" onClick={notifyUploadedDocument} className={`${className} w-full text-left`}>
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

function CheckSourceCardSkeleton({ delay }: { delay: number }) {
  return (
    <div
      className="animate-pulse rounded-lg border border-[var(--border-subtle)] bg-[var(--card)] p-3"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="mb-2 flex items-center gap-2">
        <div className="h-4 w-4 shrink-0 rounded-sm bg-[var(--border-subtle)]" />
        <div className="h-2 w-20 rounded-full bg-[var(--border-subtle)]" />
      </div>
      <div className="h-2.5 w-4/5 rounded-full bg-[var(--border-subtle)]" />
      <div className="mt-2.5 space-y-1.5">
        <div className="h-2 w-full rounded-full bg-[var(--border-subtle)]/60" />
        <div className="h-2 w-3/4 rounded-full bg-[var(--border-subtle)]/60" />
      </div>
    </div>
  )
}

function CheckSourceView({ state }: { state: CheckSourceState }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-3 py-2.5">
        <p className="line-clamp-4 text-[13px] leading-relaxed text-[var(--foreground)]/90">{state.claim}</p>
      </div>

      <p className="px-0.5 text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
        {state.status === 'loading' ? 'Checking sources' : 'Sources that support this claim'}
      </p>

      {state.status === 'loading' ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <CheckSourceCardSkeleton key={i} delay={i * 120} />
          ))}
        </div>
      ) : state.matches.length > 0 ? (
        <div className="space-y-3">
          {state.matches.map((m, i) => (
            <CheckSourceCard key={`${m.n}-${i}`} match={m} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 px-2 py-10 text-center">
          <div className="rounded-full bg-[var(--secondary)]/60 p-3">
            <BookOpen size={20} className="text-[var(--muted-foreground)]/60" />
          </div>
          <p className="max-w-[220px] text-[12.5px] leading-relaxed text-[var(--muted-foreground)]">
            No source in this thread directly supports this passage — it may combine multiple sources or general knowledge.
          </p>
        </div>
      )}
    </div>
  )
}

function SourcesList({ sources, citedNumbers }: { sources: Source[]; citedNumbers?: Set<number> }) {
  const { used, unused, split } = partitionSources(sources, citedNumbers)
  const [showUnused, setShowUnused] = useState(false)
  // Collapse back down whenever we're showing a different answer's sources.
  useEffect(() => setShowUnused(false), [sources])

  if (!split) {
    return (
      <>
        {sortByTrust(sources).map((s, i) => (
          <SourceCard key={i} source={s} />
        ))}
      </>
    )
  }

  return (
    <>
      {used.length > 0 && (
        <>
          <p className="px-0.5 text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
            {used.length} source{used.length === 1 ? '' : 's'} used
          </p>
          {sortLabeledByTrust(used).map(({ source, label }) => (
            <SourceCard key={label} source={source} />
          ))}
        </>
      )}
      {unused.length > 0 && (
        <div className={used.length > 0 ? 'border-t border-[var(--border-subtle)] pt-3' : ''}>
          <button
            type="button"
            onClick={() => setShowUnused((v) => !v)}
            className="flex w-full items-center gap-1.5 px-0.5 text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
          >
            <ChevronDown size={12} className={`shrink-0 transition-transform duration-200 ${showUnused ? 'rotate-180' : ''}`} />
            {unused.length} source{unused.length === 1 ? '' : 's'} read but not used
          </button>
          <div className={`grid transition-all duration-300 ease-in-out ${showUnused ? 'grid-rows-[1fr] opacity-100 mt-3' : 'grid-rows-[0fr] opacity-0'}`}>
            <div className="space-y-3 overflow-hidden">
              {sortLabeledByTrust(unused).map(({ source, label }) => (
                <SourceCard key={label} source={source} />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

interface SourcesPanelProps {
  sources: Source[]
  /** Source numbers (`Source.n`) actually cited inline in the answer text, used
   * to split "used" sources from ones that were only fetched. Omit or pass an
   * empty set to show the flat, unsplit list. */
  citedNumbers?: Set<number>
  open: boolean
  onClose: () => void
  /** When set, the panel shows the "check source" view (a claim + the source
   * passages that support it, Perplexity-style) instead of the plain source
   * list. `null`/omitted falls back to normal browse mode. */
  checkSource?: CheckSourceState | null
}

function PanelHeaderTitle({ sources, checkSource }: { sources: Source[]; checkSource?: CheckSourceState | null }) {
  if (checkSource) {
    return checkSource.status === 'loading' ? (
      <span className="flex items-center gap-1.5 text-[15px] font-medium text-[var(--foreground)] opacity-90">
        <Loader2 size={14} className="animate-spin text-[var(--muted-foreground)]" />
        Checking sources…
      </span>
    ) : (
      <span className="text-[15px] font-medium text-[var(--foreground)] opacity-90">
        {checkSource.matches.length} source{checkSource.matches.length === 1 ? '' : 's'} found
      </span>
    )
  }
  return (
    <span className="text-[15px] font-medium text-[var(--foreground)] opacity-90">
      {sources.length} source{sources.length === 1 ? '' : 's'}
    </span>
  )
}

function PanelBody({ sources, citedNumbers, checkSource }: { sources: Source[]; citedNumbers?: Set<number>; checkSource?: CheckSourceState | null }) {
  return (
    <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto p-4">
      {checkSource ? <CheckSourceView state={checkSource} /> : <SourcesList sources={sources} citedNumbers={citedNumbers} />}
    </div>
  )
}

/**
 * A small right-hand drawer that lists the answer's sources (Perplexity-style),
 * opened on demand from the answer footer instead of expanding inline. Also
 * doubles as the "check source" result view when `checkSource` is set.
 */
export function SourcesPanel({ sources, citedNumbers, open, onClose, checkSource }: SourcesPanelProps) {
  return (
    <>
      {/* Mobile: Full-screen overlay */}
      {open && (
        <div className="fixed inset-0 z-50 bg-[var(--background)] flex flex-col sm:hidden animate-in fade-in slide-in-from-bottom-8 duration-300">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-4">
            <PanelHeaderTitle sources={sources} checkSource={checkSource} />
            <button onClick={onClose} className="rounded-md p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--secondary)] transition-colors" title="Close">
              <X size={18} />
            </button>
          </div>
          <PanelBody sources={sources} citedNumbers={citedNumbers} checkSource={checkSource} />
        </div>
      )}

      {/* Desktop: Flex child that animates width to squeeze content */}
      <div
        className={`
          hidden sm:block relative z-auto translate-x-0 shadow-none transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] flex-shrink-0 overflow-hidden bg-transparent h-full
          ${open ? 'w-[320px] lg:w-[360px] border-l border-[var(--border-subtle)]' : 'w-0 border-transparent'}
        `}
      >
        <div className="flex h-full w-[320px] lg:w-[360px] flex-col bg-[var(--background)]">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-4">
            <PanelHeaderTitle sources={sources} checkSource={checkSource} />
            <button onClick={onClose} className="rounded-md p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--secondary)] transition-colors" title="Close">
              <X size={18} />
            </button>
          </div>
          <PanelBody sources={sources} citedNumbers={citedNumbers} checkSource={checkSource} />
        </div>
      </div>
    </>
  )
}
