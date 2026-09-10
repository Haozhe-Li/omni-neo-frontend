'use client'

import { FileText } from 'lucide-react'
import { toast } from 'sonner'
import type { Source } from '@/lib/types'
import { CredibilityTag } from '@/components/credibility-badge'

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/**
 * One source, as it appears beside an answer.
 *
 * This replaced a drawer that opened over the thread from a button in the
 * answer footer. Two surfaces listing the same sources meant the rail and the
 * drawer could both be open, showing the same five things twice at different
 * levels of detail — so the drawer's detail moved here instead: host, how far
 * the source can be trusted, and the passage the answer actually drew on.
 *
 * `compact` is the rail: the snippet is worth two lines there, not five, and
 * the column is 248px wide. The full variant is what a narrow window gets
 * instead of the rail, where there is room to read.
 */
export function SourceCard({ source, compact = false }: { source: Source; compact?: boolean }) {
  const isDocument = !source.url
  const label = source.n ?? undefined

  const body = (
    <>
      <span className={`mb-2 flex items-center gap-2 ${compact ? '' : 'gap-2.5'}`}>
        {label !== undefined && (
          <span className="omni-mono shrink-0 rounded-[4px] bg-[var(--teal-tint)] px-1.5 py-0.5 text-[10px] leading-[1.2] text-[var(--teal)]">
            {label}
          </span>
        )}
        <span className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-[var(--sand)]">
          {isDocument ? (
            <FileText size={10} className="text-[var(--ink-faint)]" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`https://www.google.com/s2/favicons?domain=${hostOf(source.url)}&sz=64`}
              alt=""
              className="h-full w-full object-cover"
            />
          )}
        </span>
        <span className="omni-mono min-w-0 flex-1 truncate text-[11px] text-[var(--ink-muted)]">
          {isDocument ? 'Uploaded document' : hostOf(source.url)}
        </span>
        <CredibilityTag credibility={source.credibility} className="shrink-0" />
      </span>

      {/* `line-clamp-*` sets `display: -webkit-box`, so it must not be paired
          with `block` — the two are the same CSS property and the winner is
          decided by stylesheet order, not class order. That collision is why
          a clamp silently does nothing. */}
      <span
        className={`text-[var(--ink)] ${
          compact ? 'line-clamp-3 text-[13.5px] leading-[1.4]' : 'line-clamp-2 text-[16px] leading-[1.45]'
        }`}
      >
        {source.title}
      </span>

      {source.content && (
        <span
          className={`mt-1.5 text-[var(--ink-muted)] ${
            compact ? 'line-clamp-2 text-[12px] leading-[1.5]' : 'line-clamp-3 text-[14px] leading-[1.6]'
          }`}
        >
          {source.content}
        </span>
      )}
    </>
  )

  const className = `flex flex-col rounded-[16px] border border-[var(--line)] bg-[var(--paper-raised)] text-left transition-colors hover:border-[var(--teal)] hover:bg-[var(--teal-tint)] ${
    compact ? 'px-3.5 py-3' : 'px-5 py-4'
  }`

  // An uploaded document has no URL to open — say so rather than rendering a
  // dead anchor that looks identical to a live one.
  if (isDocument) {
    return (
      <button
        type="button"
        onClick={() => toast.info("This is a document you uploaded — it can't be opened as a link.")}
        className={`${className} w-full`}
      >
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
 * Every source the thread has gathered, numbered as the answers cite them.
 *
 * Rendered twice per thread with the same data and opposite visibility: as a
 * sticky rail when the column is wide enough (see `.omni-thread-rail` in
 * globals.css), and stacked under the last answer when it is not. A container
 * query decides, so opening the report panel — which the viewport knows
 * nothing about — moves the list rather than crushing it.
 */
export function SourceList({ sources, compact = false }: { sources: Source[]; compact?: boolean }) {
  if (sources.length === 0) return null
  return (
    <>
      {sources.map((s, i) => (
        <SourceCard key={`${s.n ?? i}-${s.url || i}`} source={s} compact={compact} />
      ))}
    </>
  )
}
