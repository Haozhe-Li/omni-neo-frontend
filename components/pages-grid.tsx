'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Clock, FileText, Sparkles, Compass, Layers, BookOpen, LineChart, Newspaper } from 'lucide-react'
import type { Source } from '@/lib/types'

export interface PageSummary {
  id: string
  title?: string
  answer?: string
  authorName?: string
  authorImage?: string
  coverImage?: string
  sources?: Source[]
  publishedAt?: string
  created_at?: string
  publishToPages?: boolean
}

function formatDate(dateStr: string | number | undefined | null) {
  if (!dateStr) return 'Unknown date'
  const d = new Date(dateStr)
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d)
}

/* Cards show a sentence or two of the report, and the report is markdown —
   headings, list bullets, citation brackets and emphasis marks all have to
   come off before it can sit under a title as plain prose. */
function plainLede(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\[\d+(?:\s*,\s*\d+)*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

// Cards always reserve a cover slot. When a report has a real coverImage it's
// rendered as a photo; until then (most reports today), a deterministic
// abstract placeholder fills the same slot — same id always renders the same
// tint + glyph, so an uncovered card feels designed rather than broken.
function hashSeed(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

/* Diagonal hatch, three inks, four rakes. Not a gradient: a gradient reads as
   "image failed to load", while ruled hatching reads as a deliberate plate —
   the same move a printed paper makes when it has no photograph to run. The
   seed keeps a given page's plate stable across renders and sessions. */
const COVER_HATCHES = [
  'repeating-linear-gradient(115deg, color-mix(in srgb, var(--teal) 18%, transparent) 0 2px, transparent 2px 12px)',
  'repeating-linear-gradient(115deg, color-mix(in srgb, var(--rust) 20%, transparent) 0 2px, transparent 2px 12px)',
  'repeating-linear-gradient(65deg, color-mix(in srgb, var(--ink) 13%, transparent) 0 2px, transparent 2px 12px)',
  'repeating-linear-gradient(155deg, color-mix(in srgb, var(--teal) 15%, transparent) 0 2px, transparent 2px 14px)',
]

const COVER_ICONS = [FileText, Sparkles, Compass, Layers, BookOpen, LineChart, Newspaper]

function CardCover({ page }: { page: PageSummary }) {
  return (
    <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden bg-[var(--sand-deep)]">
      {page.coverImage ? (
        <Image
          src={page.coverImage}
          alt={page.title || 'Cover image'}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover"
        />
      ) : (
        <CoverPlaceholder seed={page.id} />
      )}
    </div>
  )
}

/** Abstract fallback cover — deterministic tint + glyph, shown until a real coverImage is set. */
function CoverPlaceholder({ seed }: { seed: string }) {
  // Salted separately so hatch and glyph don't move in lockstep for
  // similar/sequential ids.
  const hatch = COVER_HATCHES[hashSeed(seed + '::tint') % COVER_HATCHES.length]
  const Icon = COVER_ICONS[hashSeed(seed + '::icon') % COVER_ICONS.length]
  return (
    <div className="absolute inset-0 bg-[var(--sand-deep)]" style={{ backgroundImage: hatch }}>
      <Icon size={58} strokeWidth={1} className="absolute -bottom-2 -right-2 text-[var(--ink)] opacity-[0.07]" />
    </div>
  )
}

function CardShell({ href, onOpen, className, children }: { href?: string; onOpen?: () => void; className: string; children: ReactNode }) {
  if (href) {
    return (
      <Link href={href} onClick={onOpen} className={className}>
        {children}
      </Link>
    )
  }
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => { if (e.key === 'Enter') onOpen?.() }} className={className}>
      {children}
    </div>
  )
}

/** Left: stacked source favicons + count (falls back to author identity when a report has no sources yet). Right: publish date. */
function MetaRow({ page }: { page: PageSummary }) {
  const sources = (page.sources || []).filter((s) => s?.url)
  const hasSources = sources.length > 0

  return (
    <div className="flex items-center justify-between gap-3">
      {hasSources ? (
        <div className="omni-mono flex min-w-0 items-center gap-2 text-[11.5px] text-[var(--ink-faint)]">
          <span className="flex -space-x-1.5 shrink-0">
            {sources.slice(0, 4).map((s, i) => (
              <span key={i} className="flex h-4 w-4 items-center justify-center overflow-hidden rounded-full bg-[var(--sand)] ring-1 ring-[var(--paper-raised)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`https://www.google.com/s2/favicons?domain=${domainOf(s.url)}&sz=64`} alt="" className="h-full w-full object-cover" />
              </span>
            ))}
          </span>
          <span className="truncate">{sources.length} source{sources.length > 1 ? 's' : ''}</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 min-w-0">
          {page.authorImage ? (
            <Image src={page.authorImage} alt={page.authorName || 'User'} width={18} height={18} className="rounded-full shrink-0" />
          ) : (
            <div className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[var(--clay)] text-[var(--clay-ink)]">
              <span className="text-[9px]">{(page.authorName || 'A')[0].toUpperCase()}</span>
            </div>
          )}
          <span className="truncate text-[12px] text-[var(--ink-muted)]">{page.authorName || 'Anonymous'}</span>
        </div>
      )}
      <div className="omni-mono flex shrink-0 items-center gap-1.5 text-[11.5px] text-[var(--ink-faint)]">
        <Clock className="h-3 w-3" />
        <span>{formatDate(page.publishedAt || page.created_at)}</span>
      </div>
    </div>
  )
}

/** Report card — cover slot (real photo when set, abstract placeholder otherwise), title, sources + date. */
function ReportCard({ page, href, onOpen }: { page: PageSummary; href?: string; onOpen?: () => void }) {
  return (
    <CardShell
      href={href}
      onOpen={onOpen}
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-[24px] border border-[var(--line)] bg-[var(--paper-raised)] text-left transition-colors duration-200 hover:border-[var(--teal)]"
    >
      <CardCover page={page} />

      <div className="flex flex-1 flex-col gap-2.5 px-[22px] pb-5 pt-5">
        <h3 className="omni-display line-clamp-3 text-[22px] leading-[1.2] text-[var(--ink)]">
          {page.title || 'Untitled Research'}
        </h3>
        {page.answer && (
          <p className="line-clamp-2 text-[14.5px] leading-[1.6] text-[var(--ink-muted)]">{plainLede(page.answer)}</p>
        )}
        <div className="mt-auto pt-2">
          <MetaRow page={page} />
        </div>
      </div>
    </CardShell>
  )
}

interface PagesGridProps {
  pages: PageSummary[]
  /** Build the href for a page (external navigation, e.g. `/pages/${id}`). Omit for in-app callback navigation. */
  getHref?: (page: PageSummary) => string
  onOpen?: (page: PageSummary) => void
}

export function PagesGrid({ pages, getHref, onOpen }: PagesGridProps) {
  return (
    /* `auto-fit` with a 258px floor rather than fixed breakpoints: the grid
       has to look right beside a collapsible sidebar and an open report
       panel, and column counts pinned to viewport width get that wrong in
       both directions. */
    <div className="grid grid-cols-[repeat(auto-fit,minmax(258px,1fr))] gap-3.5">
      {pages.map((p) => (
        <ReportCard key={p.id} page={p} href={getHref?.(p)} onOpen={onOpen ? () => onOpen(p) : undefined} />
      ))}
    </div>
  )
}

/* ── Lead story ────────────────────────────────────────────────────────────
   The newest page, run across the full width with its plate on the left. A
   front page needs one thing that is plainly bigger than the rest; without
   it a grid of equal cards gives the reader no place to start. */
export function PagesLead({ page, href, onOpen }: { page: PageSummary; href?: string; onOpen?: () => void }) {
  const sourceCount = (page.sources || []).filter((s) => s?.url).length
  return (
    <CardShell
      href={href}
      onOpen={onOpen}
      className="group mb-3.5 grid cursor-pointer grid-cols-[repeat(auto-fit,minmax(280px,1fr))] overflow-hidden rounded-[28px] border border-[var(--line)] bg-[var(--paper-raised)] text-left transition-colors hover:border-[var(--teal)]"
    >
      <div className="relative min-h-[260px] overflow-hidden">
        {page.coverImage ? (
          <Image src={page.coverImage} alt={page.title || 'Cover image'} fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" />
        ) : (
          <CoverPlaceholder seed={page.id} />
        )}
      </div>
      <div className="flex flex-col justify-center gap-3.5 px-8 py-[30px]">
        <div className="omni-eyebrow text-[var(--rust)]">Lead story</div>
        <h2 className="omni-display text-[clamp(26px,2.6vw,32px)] leading-[1.12] text-[var(--ink)]">
          {page.title || 'Untitled Research'}
        </h2>
        {page.answer && (
          <p className="line-clamp-3 text-[16px] leading-[1.65] text-[var(--ink-muted)] text-pretty">{plainLede(page.answer)}</p>
        )}
        <div className="omni-mono text-[13px] text-[var(--ink-faint)]">
          {sourceCount > 0 && <>{sourceCount} source{sourceCount === 1 ? '' : 's'} · </>}
          {formatDate(page.publishedAt || page.created_at)}
        </div>
      </div>
    </CardShell>
  )
}
