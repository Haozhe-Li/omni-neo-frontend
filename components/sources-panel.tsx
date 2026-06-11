'use client'

import { X } from 'lucide-react'
import type { Source } from '@/lib/types'

function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function SourceCard({ source, index }: { source: Source; index: number }) {
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
        <span className="shrink-0 text-[11px] font-mono text-[var(--muted-foreground)]/70">{index + 1}</span>
      </div>
      <div className="text-[13px] font-medium leading-snug text-[var(--foreground)] line-clamp-2">{source.title}</div>
      {source.content && (
        <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--muted-foreground)] line-clamp-3">{source.content}</p>
      )}
    </a>
  )
}

interface SourcesPanelProps {
  sources: Source[]
  open: boolean
  onClose: () => void
}

/**
 * A small right-hand drawer that lists the answer's sources (Perplexity-style),
 * opened on demand from the answer footer instead of expanding inline.
 */
export function SourcesPanel({ sources, open, onClose }: SourcesPanelProps) {
  return (
    <>
      {/* Backdrop — dismisses on click, fades with the drawer. */}
      <div
        onClick={onClose}
        className={`absolute inset-0 z-40 bg-black/10 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden
      />
      {/* Drawer */}
      <div
        className={`absolute right-0 top-0 z-50 flex h-full w-full max-w-[400px] flex-col border-l border-[var(--border)] bg-[var(--background)] shadow-lg transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-4">
          <span className="text-sm font-medium text-[var(--foreground)]">
            {sources.length} source{sources.length === 1 ? '' : 's'}
          </span>
          <button onClick={onClose} className="rounded-md p-2 text-[var(--muted-foreground)] hover:bg-[var(--secondary)]" title="Close">
            <X size={16} />
          </button>
        </div>
        <div className="custom-scrollbar flex-1 space-y-2 overflow-y-auto p-3">
          {sources.map((s, i) => (
            <SourceCard key={i} source={s} index={i} />
          ))}
        </div>
      </div>
    </>
  )
}
