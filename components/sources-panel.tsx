'use client'

import { X } from 'lucide-react'
import type { Source } from '@/lib/types'
import { partitionSources } from '@/lib/markdown'

function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function SourceCard({ source, label }: { source: Source; label: number }) {
  const domain = domainOf(source.url)
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-lg border border-[var(--border-subtle)] bg-[var(--card)] p-3 transition-colors hover:bg-[var(--secondary)]/60"
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-[var(--secondary)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`} alt="" className="h-full w-full object-cover" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--muted-foreground)]">{domain}</span>
        <span className="shrink-0 text-[11px] font-mono text-[var(--muted-foreground)]/70">{label}</span>
      </div>
      <div className="text-[13px] font-medium leading-snug text-[var(--foreground)] line-clamp-2">{source.title}</div>
      {source.content && (
        <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--muted-foreground)] line-clamp-3">{source.content}</p>
      )}
    </a>
  )
}

function SourcesList({ sources, citedNumbers }: { sources: Source[]; citedNumbers?: Set<number> }) {
  const { used, unused, split } = partitionSources(sources, citedNumbers)

  if (!split) {
    return (
      <>
        {sources.map((s, i) => (
          <SourceCard key={i} source={s} label={s.n ?? i + 1} />
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
          {used.map(({ source, label }) => (
            <SourceCard key={label} source={source} label={label} />
          ))}
        </>
      )}
      {unused.length > 0 && (
        <>
          {used.length > 0 && <div className="border-t border-[var(--border-subtle)] pt-3" />}
          <p className="px-0.5 text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
            {unused.length} source{unused.length === 1 ? '' : 's'} read but not used
          </p>
          {unused.map(({ source, label }) => (
            <SourceCard key={label} source={source} label={label} />
          ))}
        </>
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
}

/**
 * A small right-hand drawer that lists the answer's sources (Perplexity-style),
 * opened on demand from the answer footer instead of expanding inline.
 */
export function SourcesPanel({ sources, citedNumbers, open, onClose }: SourcesPanelProps) {
  return (
    <>
      {/* Mobile: Full-screen overlay */}
      {open && (
        <div className="fixed inset-0 z-50 bg-[var(--background)] flex flex-col sm:hidden animate-in fade-in slide-in-from-bottom-8 duration-300">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-4">
            <span className="text-[15px] font-medium text-[var(--foreground)] opacity-90">
              {sources.length} source{sources.length === 1 ? '' : 's'}
            </span>
            <button onClick={onClose} className="rounded-md p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--secondary)] transition-colors" title="Close">
              <X size={18} />
            </button>
          </div>
          <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto p-4">
            <SourcesList sources={sources} citedNumbers={citedNumbers} />
          </div>
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
            <span className="text-[15px] font-medium text-[var(--foreground)] opacity-90">
              {sources.length} source{sources.length === 1 ? '' : 's'}
            </span>
            <button onClick={onClose} className="rounded-md p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--secondary)] transition-colors" title="Close">
              <X size={18} />
            </button>
          </div>
          <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto p-4">
            <SourcesList sources={sources} citedNumbers={citedNumbers} />
          </div>
        </div>
      </div>
    </>
  )
}
