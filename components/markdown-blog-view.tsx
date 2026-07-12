"use client"

import { useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeHighlight from 'rehype-highlight'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import { Copy, Check, ChevronDown, Download } from 'lucide-react'
import { toast } from 'sonner'
import type { Components } from 'react-markdown'
import { Mermaid } from '@/components/mermaid'
import { InlineEcharts, InlineMap, CitationBadge, citationUrlTransform, resolveCitationSources } from '@/components/markdown-message'
import type { Source } from '@/lib/types'
import { SourceItem } from '@/components/source-item'
import { extractCitedNumbers, partitionSources, preprocessMarkdown } from '@/lib/markdown'

interface MarkdownBlogViewProps {
  title: string
  markdown: string
  sectionLabel?: string
  excerpt?: string
  coverImage?: string
  author?: string
  publishedAt?: string
  readingTime?: string
  tags?: string[]
  sources?: Source[]
  /** Rendered inside the app shell (sidebar already provides nav) — hides the standalone header/footer. */
  embedded?: boolean
  /** Hides the section-label eyebrow and the author/date/reading-time row above the title. Defaults to shown. */
  showMeta?: boolean
  /** Hides the inline "References" list at the bottom of the article — set to false when the host surface offers a sources drawer instead (see PagesDetailView). Defaults to shown. */
  showReferences?: boolean
}

function extractNodeText(node: ReactNode): string {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractNodeText).join('')
  if (typeof node === 'object' && 'props' in node) {
    const withProps = node as { props?: { children?: ReactNode } }
    return extractNodeText(withProps.props?.children)
  }
  return ''
}

function CodeCopyButton({ getText }: { getText: () => string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const text = getText().trim()
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success('Code copied')
      setTimeout(() => setCopied(false), 1600)
    } catch {
      toast.error('Failed to copy code')
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2.5 right-2.5 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/70 bg-background/80 hover:bg-secondary/70 text-muted-foreground hover:text-foreground transition-all text-xs opacity-0 group-hover:opacity-100 cursor-pointer"
      title="Copy code"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3" />
          <span>Copied</span>
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          <span>Copy</span>
        </>
      )}
    </button>
  )
}

const baseMarkdownComponents: Omit<Components, 'a'> = {
  pre: ({ children }: any) => {
    const cls = children?.props?.className || ''
    if (cls.includes('language-mermaid') || cls.includes('language-echarts') || cls.includes('language-map')) {
      return <>{children}</>
    }
    return (
      <div className="relative group my-6">
        <pre className="overflow-x-auto rounded-xl border border-border/70 bg-card px-4 py-4 text-[13px] leading-relaxed shadow-sm">
          {children}
        </pre>
        <CodeCopyButton getText={() => extractNodeText(children)} />
      </div>
    )
  },
  code: ({ className, children, ...props }) => {
    const isInline = !className

    if (className?.includes('language-mermaid')) {
      return <Mermaid chart={String(children).replace(/\n$/, '')} />
    }
    if (className?.includes('language-echarts')) {
      return <InlineEcharts source={String(children)} />
    }
    if (className?.includes('language-map')) {
      return <InlineMap source={String(children)} />
    }

    if (isInline) {
      return (
        <code
          className="rounded-md border border-border/60 bg-secondary/60 px-1.5 py-0.5 text-[0.9em] text-foreground"
          {...props}
        >
          {children}
        </code>
      )
    }

    return (
      <code className={className} {...props}>
        {children}
      </code>
    )
  },
  blockquote: ({ children }) => (
    <blockquote className="my-6 rounded-r-lg border-l-3 border-accent/70 bg-accent/5 px-4 py-3 text-muted-foreground">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="my-6 overflow-x-auto rounded-xl border border-border/80">
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-secondary/60">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-border/80 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border-b border-border/50 px-4 py-3 align-top">{children}</td>,
  hr: () => <hr className="my-10 border-0 border-t border-border/80" />,
  img: ({ src, alt, ...props }) => (
    <figure className="my-6 w-full sm:w-fit sm:max-w-[80%] mx-auto flex flex-col items-center gap-2">
      <div className="group relative rounded-lg overflow-hidden w-full bg-muted/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src as string}
          alt={alt || 'Image'}
          className="w-full h-auto object-contain max-h-[500px]"
          loading="lazy"
          {...props}
        />
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <a
            href={src as string}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center p-2 bg-black/50 hover:bg-black/70 text-white rounded-md backdrop-blur-sm transition-colors"
            title="View/Download Image"
          >
            <Download className="w-4 h-4" />
          </a>
        </div>
      </div>
      {alt && (
        <figcaption className="text-[13px] text-muted-foreground/80 text-center px-4">
          {alt}
        </figcaption>
      )}
    </figure>
  ),
}

// `a` is built per-render so it can close over the page's citation map: a
// `citation:n` href (synthesized by preprocessMarkdown from a `[n]` marker)
// renders as the same CitationBadge used in chat, instead of a plain link.
function buildMarkdownComponents(citationMap: Map<number, Source>): Components {
  return {
    ...baseMarkdownComponents,
    a: ({ href, children }) => {
      const sources = resolveCitationSources(href, children, citationMap)
      if (sources.length > 0) return <CitationBadge sources={sources} />
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent underline decoration-accent/40 underline-offset-4 transition-colors duration-200 hover:decoration-accent"
        >
          {children}
        </a>
      )
    },
  }
}

export function MarkdownBlogView({
  title,
  markdown,
  sectionLabel = 'Blog',
  excerpt,
  coverImage,
  author = 'Omni Knows Team',
  publishedAt,
  readingTime,
  tags = [],
  sources = [],
  embedded = false,
  showMeta = true,
  showReferences = true,
}: MarkdownBlogViewProps) {
  const citationMap = useMemo(() => {
    const map = new Map<number, Source>()
    for (const s of sources) if (typeof s.n === 'number') map.set(s.n, s)
    return map
  }, [sources])
  const citationNumbers = useMemo(() => new Set(citationMap.keys()), [citationMap])
  const markdownComponents = useMemo(() => buildMarkdownComponents(citationMap), [citationMap])
  // Which source numbers the article actually cites inline, so References can
  // separate those from sources that were only fetched during research.
  const citedNumbers = useMemo(() => extractCitedNumbers(markdown), [markdown])
  const { used: usedSources, unused: unusedSources, split: sourcesSplit } = useMemo(
    () => partitionSources(sources, citedNumbers),
    [sources, citedNumbers]
  )
  const [showUnused, setShowUnused] = useState(false)

  return (
    <div className={embedded ? 'bg-transparent' : 'blog-shell min-h-screen bg-background'}>
      {/* ─── Minimal brand bar ─── */}
      {!embedded && (
        <header className="sticky top-0 z-30 bg-[var(--background)]/85 backdrop-blur-xl border-b border-[var(--border-subtle)]">
          <div className="max-w-6xl mx-auto flex items-center px-6 h-14">
            <Link href="/pages" className="flex items-center gap-2 group">
              <Image
                src="/android-chrome-512x512.png"
                alt="Omni Knows Logo"
                width={20}
                height={20}
                className="rounded-lg"
              />
              <span className="font-[family-name:var(--font-plex)] text-[14px] font-light tracking-tight text-[var(--muted-foreground)] lowercase group-hover:text-[var(--foreground)] transition-colors">
                omni<span className="font-normal" style={{ color: '#20B2AA' }}>knows</span>
              </span>
            </Link>
          </div>
        </header>
      )}

      <main className={embedded ? '' : 'px-4 py-8 sm:px-6 sm:py-10'}>
        <article className={embedded ? 'mx-auto w-full max-w-[880px]' : 'mx-auto w-full max-w-[880px] rounded-2xl border border-border/70 bg-card/95 p-5 shadow-sm sm:p-8'}>
          <header className="border-b border-border/70 pb-6">
            {showMeta && <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{sectionLabel}</p>}
            <h1 className={`${showMeta ? 'mt-2' : ''} text-2xl font-semibold tracking-tight text-foreground sm:text-3xl`}>{title}</h1>
            {excerpt && <p className="mt-4 text-base leading-7 text-muted-foreground">{excerpt}</p>}

            {showMeta && (
              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                <span>{author}</span>
                {publishedAt && <span>{publishedAt}</span>}
                {readingTime && <span>{readingTime}</span>}
              </div>
            )}

            {tags.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <li key={tag} className="rounded-full border border-border/80 bg-secondary/55 px-3 py-1 text-xs text-secondary-foreground">
                    {tag}
                  </li>
                ))}
              </ul>
            )}

            {coverImage && (
              <div className="mt-6 overflow-hidden rounded-xl border border-border/70 bg-secondary/30">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={coverImage} alt={title} className="h-auto max-h-[440px] w-full object-cover" loading="lazy" />
              </div>
            )}
          </header>

          <section className="blog-markdown markdown-body pt-7 text-[16px] leading-[1.8] text-foreground">
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeHighlight, rehypeKatex, rehypeRaw]} components={markdownComponents} urlTransform={citationUrlTransform}>
              {preprocessMarkdown(markdown, citationNumbers)}
            </ReactMarkdown>

            {showReferences && sources.length > 0 && (
              <div className="mt-12 border-t border-border/70 pt-8">
                <h3 className="mb-6 text-xl font-semibold tracking-tight text-foreground">References</h3>

                {sourcesSplit ? (
                  <>
                    <div className="flex flex-col gap-3">
                      {usedSources.map(({ source, label }) => (
                        <SourceItem key={label} source={source} index={label - 1} label={label} showNumber={false} />
                      ))}
                    </div>

                    {unusedSources.length > 0 && (
                      <div className="mt-5">
                        <button
                          type="button"
                          onClick={() => setShowUnused((v) => !v)}
                          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${showUnused ? 'rotate-180' : ''}`} />
                          {unusedSources.length} more source{unusedSources.length === 1 ? '' : 's'} read but not cited
                        </button>
                        <div
                          className={`grid transition-all duration-300 ease-in-out ${
                            showUnused ? 'grid-rows-[1fr] opacity-100 mt-4' : 'grid-rows-[0fr] opacity-0'
                          }`}
                        >
                          <div className="overflow-hidden">
                            <div className="flex flex-col gap-3">
                              {unusedSources.map(({ source, label }) => (
                                <SourceItem key={label} source={source} index={label - 1} label={label} showNumber={false} />
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col gap-3">
                    {sources.map((source, idx) => (
                      <SourceItem key={idx} source={source} index={idx} showNumber={false} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </article>
      </main>

      {!embedded && (
        <footer className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6">
          <p className="text-center text-[11px] text-muted-foreground/70">
            Answers generated by AI. Check important info. ·{' '}
            <a
              href="https://omniknows.xyz"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-muted-foreground/40 underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground"
            >
              Omni Knows
            </a>
          </p>
        </footer>
      )}
    </div>
  )
}