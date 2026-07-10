'use client'

import { memo, useEffect, useMemo, useState, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
import { Copy, Check, Download, BarChart3, FileText, MapPin, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { Mermaid } from '@/components/mermaid'
import { EChartsChart } from '@/components/echarts-chart'
import { preprocessMarkdown } from '@/lib/markdown'
import { spliceVerifyMarkers, type VerifiedSpan } from '@/lib/verify-claims'
import { brandDomain, truncateFilename } from '@/lib/domain'
import type { LightChatMapPoint } from '@/components/light-chat-mini-map'
import type { Source } from '@/lib/types'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'

const LightChatMiniMap = dynamic(
  () => import('@/components/light-chat-mini-map').then((m) => m.LightChatMiniMap),
  { ssr: false }
)

async function geocodePlaces(
  names: string[]
): Promise<Record<string, { lat: number; lng: number } | null>> {
  const res = await fetch('/api/geocode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ names }),
  })
  if (!res.ok) return {}
  const { results } = await res.json()
  return Object.fromEntries(
    (results as { name: string; coords: { lat: number; lng: number } | null }[]).map(
      (r) => [r.name, r.coords]
    )
  )
}

// A quiet, neutral block placeholder shown while an ```echarts block is still
// streaming in (its JSON is incomplete and won't parse yet): just a muted canvas
// with an understated "Drawing chart…" label.
function ChartDrawingPlaceholder() {
  return (
    <div className="my-4 h-[360px] w-full overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--foreground)_2.5%,var(--background))] relative">
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5">
        <BarChart3
          size={20}
          strokeWidth={1.5}
          className="text-[var(--muted-foreground)] opacity-40 animate-pulse"
        />
        <span className="omni-shimmer-text text-[12.5px] font-medium tracking-wide opacity-70">
          Drawing chart…
        </span>
      </div>
    </div>
  )
}

// ── Inline map ───────────────────────────────────────────────────────────────

interface MapPinSpec {
  name: string
  description?: string
}

interface MapSpec {
  title?: string
  pins: MapPinSpec[]
}

function MapLoadingPlaceholder() {
  return (
    <div className="my-4 h-[360px] w-full overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--foreground)_2.5%,var(--background))] relative">
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5">
        <MapPin
          size={20}
          strokeWidth={1.5}
          className="text-[var(--muted-foreground)] opacity-40 animate-pulse"
        />
        <span className="omni-shimmer-text text-[12.5px] font-medium tracking-wide opacity-70">
          Loading map…
        </span>
      </div>
    </div>
  )
}

function MapTextFallback({ spec }: { spec: MapSpec }) {
  return (
    <div className="my-4 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] p-4">
      {spec.title && (
        <p className="text-[13px] font-semibold text-[var(--foreground)] mb-2">{spec.title}</p>
      )}
      <ul className="space-y-1.5">
        {spec.pins.map((pin, i) => (
          <li key={i} className="flex items-start gap-2 text-[13px] text-[var(--muted-foreground)]">
            <MapPin size={14} className="shrink-0 mt-0.5 text-[var(--accent)]" strokeWidth={1.75} />
            <span>
              <span className="text-[var(--foreground)] font-medium">{pin.name}</span>
              {pin.description ? ` — ${pin.description}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Renders a ```map fenced block inline. Geocodes each pin name via Nominatim
// and hands the resolved coordinates to LightChatMiniMap. Shows a placeholder
// while the JSON is still streaming or geocoding is in progress. Falls back to
// a plain text list if all geocoding fails.
export function InlineMap({ source }: { source: string }) {
  const [points, setPoints] = useState<LightChatMapPoint[]>([])
  const [geocodingDone, setGeocodingDone] = useState(false)

  // Quick parse to know whether JSON is complete yet (used for placeholder).
  let spec: MapSpec | null = null
  try {
    spec = JSON.parse(source.trim())
  } catch {}

  useEffect(() => {
    let parsed: MapSpec | null = null
    try { parsed = JSON.parse(source.trim()) } catch {}

    if (!parsed?.pins?.length) {
      setGeocodingDone(true)
      return
    }

    let cancelled = false
    setPoints([])
    setGeocodingDone(false)

    const pins = parsed.pins
    ;(async () => {
      const coordsMap = await geocodePlaces(pins.map((p) => p.name))
      if (cancelled) return
      const resolved: LightChatMapPoint[] = pins
        .map((p, i) => {
          const coords = coordsMap[p.name]
          if (!coords) return null
          return {
            id: `pin-${i}`,
            name: p.name,
            lat: coords.lat,
            lng: coords.lng,
            position: i + 1,
            address: p.description,
          }
        })
        .filter(Boolean) as LightChatMapPoint[]
      if (!cancelled) {
        setPoints(resolved)
        setGeocodingDone(true)
      }
    })()

    return () => { cancelled = true }
  }, [source])

  // JSON not yet complete (still streaming)
  if (!spec) return <MapLoadingPlaceholder />

  // Geocoding in progress with no resolved pins yet
  if (!geocodingDone && points.length === 0) return <MapLoadingPlaceholder />

  // All pins failed geocoding — text fallback
  if (geocodingDone && points.length === 0) return <MapTextFallback spec={spec} />

  return (
    <div className="my-4 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] overflow-hidden">
      <LightChatMiniMap points={points} />
    </div>
  )
}

// ── Inline echarts ────────────────────────────────────────────────────────────

// Renders an ```echarts fenced block inline. While the block is still streaming
// in, its JSON is incomplete and won't parse — show the placeholder until it does.
export function InlineEcharts({ source }: { source: string }) {
  let option: any = null
  try {
    option = JSON.parse(source.trim())
  } catch {
    option = null
  }
  if (!option || typeof option !== 'object' || Array.isArray(option)) {
    return <ChartDrawingPlaceholder />
  }
  return (
    <div className="my-4 h-[360px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] p-2">
      <EChartsChart option={option} />
    </div>
  )
}

// ── Inline citations ────────────────────────────────────────────────────────

function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

const DOCUMENT_LABEL_MAX = 20

// Renders a `[n]` inline citation marker (rewritten to a `citation:n` — or,
// for a run of adjacent markers, `citation:n1,n2,...` — link by preprocessMarkdown)
// as a small pill showing the (first) source's brand name, plus a `+N` count
// when it bundles more than one. Hovering reveals a card with the full
// hostname, title, date, url and snippet, paged with arrows when there's more
// than one source.
const notifyUploadedDocument = () =>
  toast.info("This is a document you uploaded — it can't be opened as a link.")

export function CitationBadge({ sources }: { sources: Source[] }) {
  const [idx, setIdx] = useState(0)
  const current = sources[Math.min(idx, sources.length - 1)]
  const primaryIsDocument = !sources[0].url
  const currentIsDocument = !current.url
  const primaryLabel = primaryIsDocument
    ? truncateFilename(sources[0].title, DOCUMENT_LABEL_MAX, false)
    : brandDomain(sources[0].url)
  const currentDomain = domainOf(current.url)
  const extra = sources.length - 1
  const triggerClassName =
    'mx-0.5 inline-flex max-w-[140px] items-center rounded-md bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)] px-1.5 py-0.5 align-middle font-mono text-[11.5px] font-medium leading-none text-[var(--muted-foreground)] no-underline hover:bg-[color-mix(in_srgb,var(--foreground)_14%,transparent)] hover:text-[var(--foreground)] transition-colors'

  return (
    <HoverCard openDelay={150} closeDelay={100} onOpenChange={(open) => { if (!open) setIdx(0) }}>
      <HoverCardTrigger asChild>
        {primaryIsDocument ? (
          <button type="button" onClick={notifyUploadedDocument} className={triggerClassName}>
            <span className="min-w-0 truncate">{primaryLabel}</span>
            {extra > 0 && <span className="ml-1 shrink-0 font-semibold">+{extra}</span>}
          </button>
        ) : (
          <a href={sources[0].url} target="_blank" rel="noopener noreferrer" className={triggerClassName}>
            <span className="min-w-0 truncate">{primaryLabel}</span>
            {extra > 0 && <span className="ml-1 shrink-0 font-semibold">+{extra}</span>}
          </a>
        )}
      </HoverCardTrigger>
      <HoverCardContent className="w-80 p-0 overflow-hidden">
        {sources.length > 1 && (
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={idx === 0}
                onClick={() => setIdx((i) => Math.max(0, i - 1))}
                className="p-0.5 rounded text-[var(--muted-foreground)] disabled:opacity-30 hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="text-[11px] font-medium text-[var(--muted-foreground)] tabular-nums">
                {idx + 1}/{sources.length}
              </span>
              <button
                type="button"
                disabled={idx === sources.length - 1}
                onClick={() => setIdx((i) => Math.min(sources.length - 1, i + 1))}
                className="p-0.5 rounded text-[var(--muted-foreground)] disabled:opacity-30 hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="flex -space-x-1.5">
                {sources.slice(0, 3).map((s, i) => (
                  <span key={i} className="h-3.5 w-3.5 rounded-full ring-1 ring-[var(--card)] overflow-hidden bg-[var(--secondary)] flex items-center justify-center">
                    {s.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`https://www.google.com/s2/favicons?domain=${domainOf(s.url)}&sz=64`} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <FileText size={8} className="text-[var(--muted-foreground)]" />
                    )}
                  </span>
                ))}
              </span>
              <span className="text-[11px] text-[var(--muted-foreground)]">{sources.length} sources</span>
            </div>
          </div>
        )}
        {currentIsDocument ? (
          <button
            type="button"
            onClick={notifyUploadedDocument}
            className="block w-full p-3 text-left no-underline hover:bg-[color-mix(in_srgb,var(--foreground)_3%,transparent)] transition-colors"
          >
            <div className="mb-1.5 flex items-center gap-2">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-[var(--secondary)]">
                <FileText size={11} className="text-[var(--muted-foreground)]" />
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--muted-foreground)]">
                {truncateFilename(current.title, 30, true)}
              </span>
              {current.date && (
                <span className="shrink-0 text-[11px] text-[var(--muted-foreground)]/70">{current.date}</span>
              )}
            </div>
            <div className="text-[13px] font-medium leading-snug text-[var(--foreground)] line-clamp-2">{current.title}</div>
            {current.content && (
              <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--muted-foreground)] line-clamp-4">{current.content}</p>
            )}
          </button>
        ) : (
          <a
            href={current.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-3 no-underline hover:bg-[color-mix(in_srgb,var(--foreground)_3%,transparent)] transition-colors"
          >
            <div className="mb-1.5 flex items-center gap-2">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-[var(--secondary)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`https://www.google.com/s2/favicons?domain=${currentDomain}&sz=64`} alt="" className="h-full w-full object-cover" />
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--muted-foreground)]">{currentDomain}</span>
              {current.date && (
                <span className="shrink-0 text-[11px] text-[var(--muted-foreground)]/70">{current.date}</span>
              )}
            </div>
            <div className="text-[13px] font-medium leading-snug text-[var(--foreground)] line-clamp-2">{current.title}</div>
            {current.content && (
              <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--muted-foreground)] line-clamp-4">{current.content}</p>
            )}
            <div className="mt-1.5 truncate text-[11px] text-[var(--muted-foreground)]/70">{current.url}</div>
          </a>
        )}
      </HoverCardContent>
    </HoverCard>
  )
}

// Renders a `<span data-verify="id">…</span>` — spliced into the raw markdown
// by `spliceVerifyMarkers` around a sentence that silently came back with a
// `/check_source` hit (see `lib/verify-claims.ts`) — as a dashed-underline
// span. Its own children render normally (bold, a nested citation badge,
// etc.); clicking just hands the id back to the caller, which already has
// the matches from the background check and opens the sources panel with
// them directly, no second request.
//
// The mark mounts the instant its message's background check confirms a
// hit — the sentence's text is already sitting there fully visible (it's
// been on screen since the answer streamed in), so fading the whole span's
// opacity would flash the *words* too. Instead only the underline itself
// fades in: mount with a transparent decoration color, flip to the real
// color one frame later so `transition-colors` has something to animate
// from — the text never dims, just the dashes settle in under it.
function VerifiedClaimMark({ id, onClick, children }: { id: string; onClick?: (id: string) => void; children: ReactNode }) {
  const [revealed, setRevealed] = useState(false)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setRevealed(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  if (!onClick) return <>{children}</>
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => onClick(id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(id) } }}
      className={`cursor-pointer underline decoration-dashed decoration-1 underline-offset-4 transition-colors duration-500 ease-out hover:decoration-[var(--foreground)]/70 ${revealed ? 'decoration-[var(--muted-foreground)]/50' : 'decoration-transparent'}`}
      title="Verified — click to see the source"
    >
      {children}
    </span>
  )
}

function extractNodeText(node: ReactNode): string {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractNodeText).join('')
  if (typeof node === 'object' && 'props' in node) {
    return extractNodeText((node as { props?: { children?: ReactNode } }).props?.children)
  }
  return ''
}

function CopyButton({ getText }: { getText: () => string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(getText().trim())
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="p-1.5 rounded-md text-[var(--muted-foreground)] hover:bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)] transition-all opacity-0 group-hover:opacity-100"
      title="Copy code"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

// Faithful port of the original answer styling: 16px body, leading-[1.8],
// accent links, mermaid + code copy. Kept identical so the new chat reads the
// same as the legacy canvas/light answers.
//
// `a` is built per-render (via buildMarkdownComponents) so it can close over
// the message's citation map: a `citation:n` href (synthesized by
// preprocessMarkdown from a `[n]` marker) renders as a CitationBadge instead
// of a plain link.
const baseMarkdownComponents: Omit<Components, 'a'> = {
  pre: ({ children }: any) => {
    const cls = children?.props?.className || ''
    if (cls.includes('language-mermaid') || cls.includes('language-echarts') || cls.includes('language-map')) return <>{children}</>
    const match = /language-(\w+)/.exec(cls)
    const language = match ? match[1] : ''
    return (
      <div className="relative group my-4 rounded-xl border border-[color-mix(in_srgb,var(--foreground)_10%,var(--background))] bg-[color-mix(in_srgb,var(--foreground)_4%,var(--background))] dark:bg-[color-mix(in_srgb,var(--foreground)_8%,var(--background))] overflow-hidden">
        <div className="flex items-center justify-between px-3 pt-2 pb-0">
          {language ? (
            <span className="px-2 py-1 text-[11px] font-medium text-[var(--muted-foreground)] bg-[color-mix(in_srgb,var(--foreground)_6%,var(--background))] dark:bg-[color-mix(in_srgb,var(--foreground)_12%,var(--background))] rounded-md lowercase select-none">
              {language}
            </span>
          ) : <span />}
          <CopyButton getText={() => extractNodeText(children)} />
        </div>
        <pre className="px-4 pb-4 pt-2 overflow-x-auto text-[13px] leading-relaxed custom-scrollbar">
          {children}
        </pre>
      </div>
    )
  },
  code: ({ className, children, ...props }) => {
    if (className?.includes('language-mermaid')) return <Mermaid chart={String(children).replace(/\n$/, '')} />
    if (className?.includes('language-echarts')) return <InlineEcharts source={String(children)} />
    if (className?.includes('language-map')) return <InlineMap source={String(children)} />
    if (!className) {
      return (
        <code className="bg-secondary px-1.5 py-0.5 rounded text-[13px] font-mono text-accent" {...props}>
          {children}
        </code>
      )
    }
    return (
      <code className={`${className || ''} text-[13px] leading-relaxed`} {...props}>
        {children}
      </code>
    )
  },
  table: ({ children }) => (
    <div className="my-6 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-secondary/50 border-b border-border">{children}</thead>,
  th: ({ children }) => <th className="px-4 py-2.5 text-left font-medium text-foreground text-xs uppercase tracking-wider">{children}</th>,
  td: ({ children }) => <td className="px-4 py-2.5 text-foreground border-b border-border/50">{children}</td>,
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l-3 border-accent/50 bg-accent/5 rounded-r-lg pl-4 pr-3 py-3 text-muted-foreground italic">{children}</blockquote>
  ),
  hr: () => <hr className="my-8 border-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />,
  h1: ({ children }) => <h1 className="text-2xl font-semibold tracking-tight text-foreground mt-8 mb-4 first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="text-xl font-semibold tracking-tight text-foreground mt-8 mb-3 pb-2 border-b border-border/50">{children}</h2>,
  h3: ({ children }) => <h3 className="text-lg font-medium text-foreground mt-6 mb-2">{children}</h3>,
  ul: ({ children }) => <ul className="my-3 ml-1 space-y-1.5 list-disc list-inside">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 ml-1 space-y-1.5 list-decimal list-inside">{children}</ol>,
  li: ({ children }) => <li className="text-foreground leading-[1.7]">{children}</li>,
  p: ({ children }) => <p className="text-foreground leading-[1.8] mb-4 text-pretty">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic text-muted-foreground">{children}</em>,
  img: ({ src, alt, ...props }) => (
    <figure className="my-6 w-full sm:w-fit sm:max-w-[80%] mx-auto flex flex-col items-center gap-2">
      <div className="group relative rounded-lg overflow-hidden w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src as string} alt={alt || 'Image'} className="w-full h-auto object-contain max-h-[500px]" loading="lazy" {...props} />
        <a href={src as string} target="_blank" rel="noopener noreferrer" className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity" title="Open image">
          <Download className="w-4 h-4" />
        </a>
      </div>
      {alt && <figcaption className="text-[13px] text-muted-foreground/80 text-center px-4">{alt}</figcaption>}
    </figure>
  ),
}

// react-markdown's default urlTransform whitelists only http(s)/mailto/irc/xmpp
// and blanks every other protocol's href — including our synthetic `citation:`
// links. With the href gone, resolveCitationSources can only fall back on the
// link's visible text ("1"), which recovers a single source and silently drops
// the rest of a merged `[1][3]` run (`citation:1,3`). Every ReactMarkdown that
// renders citations must pass this transform to let `citation:` hrefs through.
export function citationUrlTransform(url: string): string {
  return url.startsWith('citation:') ? url : defaultUrlTransform(url)
}

// Resolves an `a` node's href/children to the citation sources it refers to, if
// any — shared by every markdown surface in the app (chat, report panel, published
// Pages view) so they all recognize citations the same way instead of each
// reimplementing this matching logic with its own subtle differences.
//
// Handles both `citation:n` / `citation:n1,n2,...` synthetic links (produced by
// preprocessMarkdown from `[n]` markers) and the case where the model already
// emitted a real markdown link (`[1](https://...)`) — transformCitations
// deliberately leaves those alone (its `(?!\()` guard) so it doesn't mangle
// genuine links, so a link whose visible text is just a number matching a known
// source is treated as a citation too.
export function resolveCitationSources(
  href: string | undefined,
  children: ReactNode,
  citationMap: Map<number, Source>
): Source[] {
  const citationMatch = /^citation:([\d,]+)$/.exec(href ?? '')
  let sources: Source[] = citationMatch
    ? (citationMatch[1].split(',').map((n) => citationMap.get(Number(n))).filter(Boolean) as Source[])
    : []
  if (sources.length === 0) {
    const text = extractNodeText(children).trim()
    if (/^\d+$/.test(text)) {
      const single = citationMap.get(Number(text))
      if (single) sources = [single]
    }
  }
  return sources
}

function buildMarkdownComponents(citationMap: Map<number, Source>, onVerifiedClaimClick?: (id: string) => void): Components {
  return {
    ...baseMarkdownComponents,
    a: ({ href, children }) => {
      const sources = resolveCitationSources(href, children, citationMap)
      if (sources.length > 0) return <CitationBadge sources={sources} />
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 decoration-[var(--muted-foreground)]/40 hover:decoration-[var(--foreground)]/60 transition-colors">
          {children}
        </a>
      )
    },
    span: ({ node, children, ...props }: any) => {
      const verifyId = props['data-verify']
      if (typeof verifyId === 'string') {
        return <VerifiedClaimMark id={verifyId} onClick={onVerifiedClaimClick}>{children}</VerifiedClaimMark>
      }
      return <span {...props}>{children}</span>
    },
  }
}

interface MarkdownMessageProps {
  content: string
  className?: string
  /**
   * Sources used to render `[n]` markers as citation badges. Since citation
   * numbering accumulates across the thread, callers should pass the
   * thread-wide merged `n -> source` list, not just this message's own
   * freshly-fetched sources — a `[n]` here may point at an earlier turn's source.
   */
  sources?: Source[]
  /**
   * Sentence spans that silently came back with a `/check_source` hit (see
   * `lib/verify-claims.ts` + the caller's background extraction) — rendered
   * as a dashed-underline `VerifiedClaimMark` instead of plain text. Offsets
   * are into this exact `content` string, so the caller must recompute them
   * if `content` changes shape (e.g. a fresh streaming turn).
   */
  verifiedClaims?: VerifiedSpan[]
  /** Called with a verified claim's id when its dashed-underline mark is
   * clicked. The caller already has that id's matches from the background
   * check — this is just a "show them" signal, not a request to refetch. */
  onVerifiedClaimClick?: (id: string) => void
}

/** GitHub-flavoured Markdown renderer matching the original answer styling. */
export const MarkdownMessage = memo(function MarkdownMessage({ content, className = '', sources, verifiedClaims, onVerifiedClaimClick }: MarkdownMessageProps) {
  const citationMap = useMemo(() => {
    const map = new Map<number, Source>()
    for (const s of sources ?? []) if (typeof s.n === 'number') map.set(s.n, s)
    return map
  }, [sources])
  const citationNumbers = useMemo(() => new Set(citationMap.keys()), [citationMap])
  const components = useMemo(() => buildMarkdownComponents(citationMap, onVerifiedClaimClick), [citationMap, onVerifiedClaimClick])
  const contentWithVerifyMarkers = useMemo(
    () => (verifiedClaims && verifiedClaims.length > 0 ? spliceVerifyMarkers(content, verifiedClaims) : content),
    [content, verifiedClaims]
  )

  return (
    <div className={`text-[16px] text-foreground break-words ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeRaw, rehypeKatex, rehypeHighlight]}
        components={components}
        urlTransform={citationUrlTransform}
      >
        {preprocessMarkdown(contentWithVerifyMarkers, citationNumbers)}
      </ReactMarkdown>
    </div>
  )
})
