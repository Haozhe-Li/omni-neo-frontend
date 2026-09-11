'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import type { Source } from '@/lib/types'
import { OmniMark } from '@/components/omni-mark'

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

// Always production, even when this is being viewed on localhost or staging —
// the "Ask Omni" link hands the backend a URL it can actually fetch (see the
// /pages/{id} shortcut in core/tools/web_page_reader.py, which only
// recognizes the omniknows.xyz host).
const SITE_URL = 'https://omniknows.xyz'

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

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Feed card — an author/date row, a serif headline, a sentence of lede, and a
 * footer that separates "read it here" from "start your own thread on it".
 * One flat list, no cover art: the report itself is the thing being shown,
 * not a photo standing in for it.
 */
function FeedCard({ page }: { page: PageSummary }) {
  const router = useRouter()
  const href = `/pages/${page.id}`
  const authorName = page.authorName || 'Anonymous'
  const sourceCount = (page.sources || []).filter((s) => s?.url).length
  const lede = page.answer ? plainLede(page.answer) : ''
  const pageUrl = `${SITE_URL}/pages/${page.id}`
  const omniHref = `/?source_url=${encodeURIComponent(pageUrl)}`

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => router.push(href)}
      onKeyDown={(e) => { if (e.key === 'Enter') router.push(href) }}
      className="group flex cursor-pointer flex-col gap-3 rounded-[26px] border border-[var(--line)] bg-[var(--paper-raised)] px-6 pb-[18px] pt-[22px] transition-colors duration-200 hover:border-[var(--teal)] sm:px-[30px]"
    >
      <div className="flex flex-wrap items-center gap-2.5">
        {page.authorImage ? (
          <Image src={page.authorImage} alt={authorName} width={26} height={26} className="shrink-0 rounded-full" />
        ) : (
          <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border border-[var(--teal-line)] bg-[var(--teal-tint)] text-[var(--teal)]">
            <span className="omni-mono text-[10.5px]">{initialsOf(authorName)}</span>
          </span>
        )}
        <span className="text-[13.5px] text-[var(--ink-body)]">{authorName}</span>
        <span className="omni-mono text-[11px] text-[var(--ink-faint)]">{formatDate(page.publishedAt || page.created_at)}</span>
      </div>

      <h2 className="omni-display text-[24px] leading-[1.12] tracking-[-0.015em] text-[var(--ink)] text-pretty sm:text-[29px]">
        {page.title || 'Untitled Research'}
      </h2>

      {lede && (
        <p className="line-clamp-3 max-w-[68ch] text-[15.5px] leading-[1.65] text-[var(--ink-muted)] text-pretty">
          {lede}
        </p>
      )}

      <div className="mt-1 flex flex-wrap items-center justify-between gap-3.5 border-t border-[var(--line-hair)] pt-3">
        <span className="omni-mono text-[11.5px] text-[var(--ink-faint)]">
          {sourceCount > 0 ? `${sourceCount} source${sourceCount === 1 ? '' : 's'} · ` : ''}
          {formatDate(page.publishedAt || page.created_at)}
        </span>
        <div className="flex shrink-0 gap-2" onClick={(e) => e.stopPropagation()}>
          <Link href={href} className="omni-pill px-3.5 py-[7px] text-[13px]">
            Read report
          </Link>
          <a href={omniHref} className="omni-pill omni-pill-solid gap-1.5 px-3.5 py-[7px] text-[13px]">
            <OmniMark size={13} tone="current" />
            Ask Omni
          </a>
        </div>
      </div>
    </div>
  )
}

interface PagesGridProps {
  pages: PageSummary[]
}

export function PagesGrid({ pages }: PagesGridProps) {
  return (
    <div className="flex flex-col gap-3.5">
      {pages.map((p) => (
        <FeedCard key={p.id} page={p} />
      ))}
    </div>
  )
}
