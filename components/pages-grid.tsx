'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Clock, FileText, ArrowRight } from 'lucide-react'
import { MarkdownMessage } from '@/components/markdown-message'

export interface PageSummary {
  id: string
  title?: string
  answer?: string
  authorName?: string
  authorImage?: string
  publishedAt?: string
  created_at?: string
  publishToPages?: boolean
}

// Interactive fenced blocks (map, echarts) are stripped from previews so the
// card thumbnail doesn't spin up full Leaflet/ECharts instances — same
// convention as the inline report card preview in chat.
const stripInteractiveBlocks = (content: string) => content.replace(/```(map|echarts)[\s\S]*?```/g, '')

function formatDate(dateStr: string | number | undefined | null) {
  if (!dateStr) return 'Unknown date'
  const d = new Date(dateStr)
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d)
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

function AuthorRow({ page }: { page: PageSummary }) {
  return (
    <div className="flex items-center justify-between pt-3 border-t border-[var(--border-subtle)]">
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
      <div className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] shrink-0">
        <Clock className="w-3 h-3" />
        <span>{formatDate(page.publishedAt || page.created_at)}</span>
      </div>
    </div>
  )
}

function HoverOpen() {
  return (
    <div className="absolute top-3 right-3 z-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
      <div className="flex items-center justify-center w-7 h-7 rounded-full bg-[var(--foreground)] text-[var(--background)] shadow-md pointer-events-none scale-95 group-hover:scale-100 transition-transform duration-200">
        <ArrowRight size={13} strokeWidth={2} />
      </div>
    </div>
  )
}

/** Grid card — used for the standard 3-across rows. */
function GridCard({ page, href, onOpen }: { page: PageSummary; href?: string; onOpen?: () => void }) {
  const preview = stripInteractiveBlocks(page.answer || '').slice(0, 500)
  return (
    <CardShell
      href={href}
      onOpen={onOpen}
      className="group relative flex flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] hover:border-[var(--border)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.05)] transition-all duration-200 overflow-hidden cursor-pointer text-left"
    >
      <HoverOpen />

      <div className="flex items-center gap-2 px-4 pt-4 text-[var(--muted-foreground)]">
        <FileText size={13} strokeWidth={1.75} className="shrink-0" />
        <h3 className="text-[14px] font-medium text-[var(--foreground)] leading-snug line-clamp-1 group-hover:text-[var(--accent)] transition-colors">
          {page.title || 'Untitled Research'}
        </h3>
      </div>

      <div className="relative isolate mt-2 px-4 h-[150px] overflow-hidden text-[12.5px] leading-relaxed text-[var(--foreground)] opacity-80">
        <MarkdownMessage content={preview || 'No description available.'} />
        <div className="absolute bottom-0 left-0 right-0 h-14 bg-gradient-to-t from-[var(--card)] via-[var(--card)]/90 to-transparent pointer-events-none" />
      </div>

      <div className="px-4 pb-4 mt-1">
        <AuthorRow page={page} />
      </div>
    </CardShell>
  )
}

/** Wide card — a full-width breather row, alternating with the 3-across grid. */
function WideCard({ page, href, onOpen }: { page: PageSummary; href?: string; onOpen?: () => void }) {
  const preview = stripInteractiveBlocks(page.answer || '').slice(0, 700)
  return (
    <CardShell
      href={href}
      onOpen={onOpen}
      className="group relative flex flex-col sm:flex-row items-stretch rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] hover:border-[var(--border)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.05)] transition-all duration-200 overflow-hidden cursor-pointer text-left"
    >
      <HoverOpen />

      <div className="flex flex-col justify-center gap-3 p-5 sm:p-6 sm:w-[42%] shrink-0">
        <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
          <FileText size={13} strokeWidth={1.75} className="shrink-0" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">Featured</span>
        </div>
        <h3 className="text-[19px] font-semibold text-[var(--foreground)] leading-snug line-clamp-2 group-hover:text-[var(--accent)] transition-colors">
          {page.title || 'Untitled Research'}
        </h3>
        <AuthorRow page={page} />
      </div>

      <div className="relative isolate flex-1 min-w-0 h-[180px] sm:h-auto overflow-hidden px-5 py-5 sm:py-6 sm:pr-6 text-[13px] leading-relaxed text-[var(--foreground)] opacity-80 bg-[var(--secondary)]/25 border-t sm:border-t-0 sm:border-l border-[var(--border-subtle)]">
        <MarkdownMessage content={preview || 'No description available.'} />
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[var(--card)] sm:from-[color-mix(in_srgb,var(--secondary)_25%,var(--card))] via-[var(--card)]/85 sm:via-[color-mix(in_srgb,var(--secondary)_25%,var(--card))]/85 to-transparent pointer-events-none" />
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

/** Perplexity-Discover-style rhythm: a row of 3, then a full-width breather row, repeating. */
export function PagesGrid({ pages, getHref, onOpen }: PagesGridProps) {
  const rows: { wide: boolean; items: PageSummary[] }[] = []
  let i = 0
  let wide = false
  while (i < pages.length) {
    const size = wide ? 1 : 3
    rows.push({ wide, items: pages.slice(i, i + size) })
    i += size
    wide = !wide
  }

  return (
    <div className="flex flex-col gap-4">
      {rows.map((row, idx) =>
        row.wide ? (
          row.items.map((p) => (
            <WideCard key={p.id} page={p} href={getHref?.(p)} onOpen={onOpen ? () => onOpen(p) : undefined} />
          ))
        ) : (
          <div key={idx} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {row.items.map((p) => (
              <GridCard key={p.id} page={p} href={getHref?.(p)} onOpen={onOpen ? () => onOpen(p) : undefined} />
            ))}
          </div>
        )
      )}
    </div>
  )
}

/** The "Introducing Omni Pages" headline, restyled to match the app's flat/neutral tokens. */
export function PagesHero() {
  return (
    <section className="py-8 sm:py-10">
      <div className="flex flex-col lg:flex-row gap-6 lg:gap-10 items-center rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] p-6 sm:p-8 overflow-hidden">
        <div className="relative w-full lg:w-[46%] aspect-[16/9] rounded-xl overflow-hidden border border-[var(--border-subtle)] shrink-0">
          <Image src="/omniknows_pages.webp" alt="Omni Knows" fill className="object-cover" priority />
        </div>

        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">Welcome</span>
            <span className="w-6 h-px bg-[var(--accent)]" />
          </div>
          <h1 className="text-2xl sm:text-[28px] font-semibold tracking-tight text-[var(--foreground)] leading-[1.2]">
            Introducing Omni Pages
          </h1>
          <p className="text-[var(--muted-foreground)] text-[14px] leading-relaxed">
            Publish research from the Omni Canvas as a shareable page — with charts, maps, and sources intact.
          </p>
          <Link
            href="https://haozhe.li/blog/omniknows-pages"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--foreground)] hover:text-[var(--accent)] transition-colors"
          >
            Learn more
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </section>
  )
}
