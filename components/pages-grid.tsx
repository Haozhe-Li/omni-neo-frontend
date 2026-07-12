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

const COVER_TINTS = [
  'linear-gradient(135deg, color-mix(in srgb, var(--accent) 14%, var(--secondary)) 0%, var(--secondary) 70%)',
  'linear-gradient(225deg, var(--secondary) 0%, color-mix(in srgb, var(--accent) 12%, var(--secondary)) 100%)',
  'radial-gradient(120% 140% at 12% 0%, color-mix(in srgb, var(--accent) 16%, var(--secondary)) 0%, var(--secondary) 65%)',
  'radial-gradient(120% 140% at 88% 100%, color-mix(in srgb, var(--accent) 16%, var(--secondary)) 0%, var(--secondary) 65%)',
]

const COVER_ICONS = [FileText, Sparkles, Compass, Layers, BookOpen, LineChart, Newspaper]

function CardCover({ page }: { page: PageSummary }) {
  return (
    <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden border-b border-[var(--border-subtle)] bg-[var(--secondary)]">
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
  // Salted separately so tint and icon don't move in lockstep for similar/sequential ids.
  const tint = COVER_TINTS[hashSeed(seed + '::tint') % COVER_TINTS.length]
  const Icon = COVER_ICONS[hashSeed(seed + '::icon') % COVER_ICONS.length]
  return (
    <div className="absolute inset-0" style={{ backgroundImage: tint }}>
      <div
        className="absolute inset-0 opacity-40"
        style={{ backgroundImage: 'radial-gradient(var(--border) 1px, transparent 1px)', backgroundSize: '14px 14px' }}
      />
      <Icon size={64} strokeWidth={1.25} className="absolute -right-2 -bottom-2 text-[var(--foreground)] opacity-[0.08]" />
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
    <div className="flex items-center justify-between gap-3 pt-3 border-t border-[var(--border-subtle)]">
      {hasSources ? (
        <div className="flex items-center gap-1.5 min-w-0 text-xs text-[var(--muted-foreground)]">
          <span className="flex -space-x-1.5 shrink-0">
            {sources.slice(0, 4).map((s, i) => (
              <span key={i} className="h-4 w-4 rounded-full ring-1 ring-[var(--card)] overflow-hidden bg-[var(--secondary)] flex items-center justify-center">
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
            <div className="w-[18px] h-[18px] rounded-full bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center shrink-0">
              <span className="text-[9px] font-semibold">{(page.authorName || 'A')[0].toUpperCase()}</span>
            </div>
          )}
          <span className="text-xs font-medium text-[var(--foreground)] truncate">{page.authorName || 'Anonymous'}</span>
        </div>
      )}
      <div className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] shrink-0">
        <Clock className="w-3 h-3" />
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
      className="group relative flex flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] hover:border-[var(--border)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.05)] transition-all duration-200 overflow-hidden cursor-pointer text-left"
    >
      <CardCover page={page} />

      <div className="px-4 pt-3.5 pb-4">
        <h3 className="text-[15px] font-semibold text-[var(--foreground)] leading-snug line-clamp-2 group-hover:text-[var(--accent)] transition-colors">
          {page.title || 'Untitled Research'}
        </h3>
      </div>

      <div className="px-4 pb-4 mt-auto">
        <MetaRow page={page} />
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {pages.map((p) => (
        <ReportCard key={p.id} page={p} href={getHref?.(p)} onOpen={onOpen ? () => onOpen(p) : undefined} />
      ))}
    </div>
  )
}
