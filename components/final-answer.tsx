'use client'

import { useState, memo, useRef, type ReactNode } from 'react'
import Image from 'next/image'
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  BookOpen,
  Copy,
  Check,
  Download,
  X,
  Share,
  Layout,
  Lock,
  Globe,
  Loader2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { TextSelectionMenu } from '@/components/text-selection-menu'
import { SourceItem } from '@/components/source-item'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { useClerk } from '@clerk/nextjs'
import type { Components } from 'react-markdown'
import type { Source, PublishDuration } from '@/lib/types'

interface FinalAnswerProps {
  answer: string
  sources: Source[]
  assets?: string[]
  title?: string
  onBack?: () => void
  onFollowUp?: (text: string) => void
  onPublish?: (duration: PublishDuration) => Promise<string | null>
  isReadOnly?: boolean
  isSignedIn?: boolean
}

/* ── Stable plugin arrays at module scope — never recreated ── */
const remarkPlugins = [remarkGfm]
const rehypePlugins = [rehypeHighlight]

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

/* ── Stable markdown component overrides at module scope ── */
const markdownComponents: Components = {
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent hover:underline underline-offset-2 decoration-accent/40 transition-colors"
    >
      {children}
    </a>
  ),
  pre: ({ children }) => (
    <div className="relative group my-4">
      <pre className="rounded-xl bg-[color-mix(in_srgb,var(--foreground)_10%,var(--background))] dark:bg-[color-mix(in_srgb,var(--foreground)_14%,var(--background))] p-4 overflow-x-auto text-sm leading-relaxed border border-[color-mix(in_srgb,var(--foreground)_22%,var(--background))] dark:border-[color-mix(in_srgb,var(--foreground)_26%,var(--background))] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--foreground)_10%,transparent)] dark:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--foreground)_14%,transparent)]">
        {children}
      </pre>
      <CopyButton getText={() => {
        return extractNodeText(children)
      }} />
    </div>
  ),
  code: ({ className, children, ...props }) => {
    const isInline = !className
    if (isInline) {
      return (
        <code
          className="bg-secondary px-1.5 py-0.5 rounded text-[13px] font-mono text-accent"
          {...props}
        >
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
  thead: ({ children }) => (
    <thead className="bg-secondary/50 border-b border-border">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="px-4 py-2.5 text-left font-medium text-foreground text-xs uppercase tracking-wider">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-4 py-2.5 text-foreground border-b border-border/50">{children}</td>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l-3 border-accent/50 bg-accent/5 rounded-r-lg pl-4 pr-3 py-3 text-muted-foreground italic">
      {children}
    </blockquote>
  ),
  hr: () => (
    <hr className="my-8 border-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
  ),
  h1: ({ children }) => (
    <h1 className="text-2xl font-semibold tracking-tight text-foreground mt-8 mb-4 first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-xl font-semibold tracking-tight text-foreground mt-8 mb-3 pb-2 border-b border-border/50">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-lg font-medium text-foreground mt-6 mb-2">{children}</h3>
  ),
  ul: ({ children }) => (
    <ul className="my-3 ml-1 space-y-1.5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-3 ml-1 space-y-1.5 list-decimal list-inside">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-foreground leading-[1.7]">
      {children}
    </li>
  ),
  p: ({ children, node }) => {
    const hasImage = node?.children?.some((child: any) => child.tagName === 'img')
    if (hasImage) {
      return <div className="text-foreground leading-[1.8] mb-4 text-pretty">{children}</div>
    }
    return <p className="text-foreground leading-[1.8] mb-4 text-pretty">{children}</p>
  },
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic text-muted-foreground">{children}</em>
  ),
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

function normalizeFilename(title: string): string {
  // 1. Replace spaces with underscores
  // 2. Remove characters that are unsafe for filenames (keeping alphanumeric, Chinese, dots, dashes, underscores)
  // 3. Limit length to avoid filesystem issues
  return title
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\w\-\u4e00-\u9fa5]/g, '')
    .slice(0, 50) || 'answer'
}

function stripMarkdown(md: string): string {
  if (!md) return ''
  return md
    // Remove horizontal rules
    .replace(/^(-\s*?|\*\s*?|_\s*?){3,}\s*$/gm, '')
    // Remove HTML tags
    .replace(/<[^>]*>/g, '')
    // Remove bold/italic (e.g. **bold**, *italic*, __bold__, _italic_)
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    // Remove heading hashes (e.g. ### Heading -> Heading)
    .replace(/^#{1,6}\s+/gm, '')
    // Remove strikethrough
    .replace(/~~(.*?)~~/g, '$1')
    // Remove inline code
    .replace(/`([^`]+)`/g, '$1')
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, (match) => match.replace(/```[^\n]*\n?|```/g, ''))
    // Remove links [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove images ![alt](url) -> alt
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    // Remove blockquotes (> quote)
    .replace(/^\s*>\s+/gm, '')
    // Clean up lists (remove unordered list markers, keep item text)
    .replace(/^\s*[-+*]\s+/gm, '')
    // Remove extra newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export const FinalAnswer = memo(function FinalAnswer({ answer: initialAnswer, sources, assets = [], title, onBack, onFollowUp, onPublish, isReadOnly = false, isSignedIn = true }: FinalAnswerProps) {
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const [isPdfLoading, setIsPdfLoading] = useState(false)
  const [isPublishExpanded, setIsPublishExpanded] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [isPublishing, setIsPublishing] = useState(false)
  const clerk = useClerk()

  const containerRef = useRef<HTMLDivElement>(null)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(initialAnswer)
      setIsCopied(true)
      toast.success('Copied to clipboard')
      setTimeout(() => setIsCopied(false), 2000)
    } catch {
      toast.error('Failed to copy')
    }
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.success('Sharing link copied')
    } catch {
      toast.error('Failed to copy link')
    }
  }

  const handleDownload = async (format: 'markdown' | 'txt' | 'pdf') => {
    if (format === 'markdown') {
      let contentToDownload = initialAnswer
      if (sources && sources.length > 0) {
        contentToDownload += '\n\n------\n\n## References\n'
        sources.forEach((source, index) => {
          contentToDownload += `${index + 1}. [${source.title}](${source.url})\n`
        })
      }
      const blob = new Blob([contentToDownload], { type: 'text/markdown' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${normalizeFilename(title || 'answer')}.md`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Downloaded as Markdown')
    } else if (format === 'txt') {
      let plainText = stripMarkdown(initialAnswer)
      if (sources && sources.length > 0) {
        plainText += '\n\n------\n\n## References\n'
        sources.forEach((source, index) => {
          plainText += `${index + 1}. ${source.title} - ${source.url}\n`
        })
      }
      const blob = new Blob([plainText], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${normalizeFilename(title || 'answer')}.txt`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Downloaded as Text')
    } else if (format === 'pdf') {
      setIsPdfLoading(true)
      try {
        // 1. Get the content
        const contentHtml = containerRef.current?.innerHTML || ''

        // 2. Create a hidden iframe for printing
        const iframe = document.createElement('iframe')
        iframe.style.position = 'fixed'
        iframe.style.right = '0'
        iframe.style.bottom = '0'
        iframe.style.width = '0'
        iframe.style.height = '0'
        iframe.style.border = '0'
        document.body.appendChild(iframe)

        const doc = iframe.contentWindow?.document
        if (!doc) throw new Error('Could not create print document')

        // 3. Prepare the print document
        // We include a simple but elegant print stylesheet
        doc.write(`
          <html lang="zh-CN">
            <head>
              <title>${title || 'Research Report'}</title>
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.6; color: #1a1a18; padding: 20mm; }
                .sticky, button, [role="menuitem"], .DropdownMenuContent, [title="Close Report"] { display: none !important; }
                h1 { font-size: 24pt; margin-bottom: 10pt; color: #1a1a18; }
                h2 { font-size: 18pt; margin-top: 20pt; border-bottom: 1px solid #eee; padding-bottom: 5pt; }
                img { max-width: 100%; height: auto; border-radius: 8px; margin: 10pt 0; }
                pre { background: #f5f4ef; padding: 10pt; border-radius: 5pt; overflow-x: auto; font-family: monospace; font-size: 10pt; }
                blockquote { border-left: 4px solid #20B2AA; padding-left: 10pt; font-style: italic; color: #666; }
                table { width: 100%; border-collapse: collapse; margin: 10pt 0; }
                th, td { border: 1px solid #eee; padding: 8pt; text-align: left; }
                a { color: #20B2AA; text-decoration: none; }
                @page { size: A4; margin: 0; }
                @media print {
                  body { padding: 15mm; }
                  .page-break { page-break-before: always; }
                }
              </style>
            </head>
            <body>
              <div class="report-content">
                ${contentHtml}
              </div>
              <script>
                // Small delay to ensure images are ready
                window.onload = () => {
                  window.print();
                  setTimeout(() => { window.frameElement.remove(); }, 100);
                }
              </script>
            </body>
          </html>
        `)
        doc.close()

        toast.success('Print dialog opened. Choose "Save as PDF".')
      } catch (e) {
        console.error('Print error:', e)
        toast.error('Failed to open print dialog')
      } finally {
        setIsPdfLoading(false)
      }
    }
  }

  return (
    <div ref={containerRef} className="rounded-xl border border-border bg-card shadow-sm relative group/answer flex flex-col">
      {!isReadOnly && (
        <TextSelectionMenu
          containerRef={containerRef}
          sources={sources}
          onFollowUp={onFollowUp}
          allowedSelectors={['[data-selection-scope="canvas-body"]']}
        />
      )}

      {/* Action Buttons (Sticky Header) */}
      {isReadOnly ? (
        /* ── Read-only / shared page header ── */
        <div className="sticky top-0 z-40 px-4 py-3 sm:px-6 sm:py-3.5 bg-card/95 backdrop-blur-md border-b border-border/50 rounded-t-xl">
          <div className="flex items-center justify-between gap-3">
            {/* Brand — matches homepage style */}
            <a
              href="https://omniknows.xyz"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 group shrink-0"
            >
              <Image
                src="/android-chrome-512x512.png"
                alt="Omni Knows"
                width={20}
                height={20}
                className="rounded-md opacity-90"
              />
              <span className="font-[family-name:var(--font-plex)] text-[18px] font-light tracking-tight text-foreground/90 lowercase group-hover:opacity-60 transition-opacity">
                omni<span className="font-normal" style={{ color: '#20B2AA' }}>knows</span>
              </span>
            </a>

            {/* CTA — flat, neutral, low saturation */}
            <a
              href="https://omniknows.xyz"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-muted-foreground bg-secondary/40 text-[11px] font-medium hover:text-foreground hover:bg-secondary hover:border-border/80 transition-colors shrink-0"
            >
              <span className="hidden min-[360px]:inline">Try Omni Knows</span>
              <span className="min-[360px]:hidden">Try</span>
              <ExternalLink className="w-3 h-3 opacity-50" />
            </a>
          </div>
        </div>
      ) : (
        /* ── Normal editable header ── */
        <div className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 bg-card/95 backdrop-blur-md border-b border-border/50 rounded-t-xl">
          <div className="flex items-center gap-2 text-[var(--muted-foreground)] font-medium text-sm sm:text-[15px]">
            <Layout size={16} className="opacity-70" />
            Report
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="secondary"
                  className="rounded-full h-8 sm:h-9 px-3 sm:px-4 text-xs sm:text-[13px] font-medium shadow-sm transition-colors"
                >
                  <Share className="h-3.5 w-3.5 mr-1.5 sm:hidden" />
                  <span className="hidden sm:inline">Share &amp; Export</span>
                  <span className="sm:hidden">Share</span>
                  <ChevronDown className="ml-1 sm:ml-1.5 h-3.5 w-3.5 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 sm:w-64 rounded-xl p-1.5 shadow-xl border-border">
                {onPublish ? (
                  <div className="flex flex-col mb-1.5">
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault()
                        setIsPublishExpanded(!isPublishExpanded)
                      }}
                      className={`cursor-pointer transition-colors duration-200 ${isPublishExpanded ? 'bg-secondary' : ''}`}
                    >
                      <Globe className="mr-2 h-4 w-4 text-foreground/70" />
                      <span className="font-medium">Publish to Pages</span>
                      <span className="ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-foreground text-background tracking-wide uppercase">New</span>
                      <ChevronDown className={`ml-auto h-3.5 w-3.5 opacity-50 transition-transform duration-300 ${isPublishExpanded ? 'rotate-180' : ''}`} />
                    </DropdownMenuItem>

                    {isPublishExpanded && (
                      <div className="flex flex-col bg-secondary/30 rounded-lg mx-1 mt-1.5 mb-1 overflow-hidden animate-in slide-in-from-top-1 duration-200 border border-border/40 min-h-[100px] justify-center">
                        {isPublishing ? (
                          <div className="flex flex-col items-center justify-center p-6 space-y-3 animate-in fade-in duration-300">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/60" />
                            <span className="text-[11px] font-medium text-muted-foreground/80 tracking-wide">Generating secure link...</span>
                          </div>
                        ) : !shareUrl ? (
                          <div className="p-3.5 space-y-3 animate-in fade-in duration-200">
                            <div className="rounded-md border border-border/60 bg-background/60 px-3 py-2.5 flex items-center gap-2.5">
                              <span className="h-6 w-6 rounded-md bg-accent/10 text-accent flex items-center justify-center">
                                <Lock className="h-3.5 w-3.5" />
                              </span>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-foreground">Permanent link</p>
                                <p className="text-[11px] text-muted-foreground truncate">Once published, this page will not expire.</p>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              className="h-8 text-[11px] w-full rounded-lg bg-accent text-white hover:bg-accent/90"
                              onClick={async (e) => {
                                e.stopPropagation()
                                setIsPublishing(true)
                                try {
                                  const url = await onPublish('permanent')
                                  if (url) setShareUrl(url)
                                } finally {
                                  setIsPublishing(false)
                                }
                              }}
                            >
                              Generate Link
                            </Button>
                          </div>
                        ) : (
                          <div className="p-3.5 space-y-3.5 bg-secondary/10 animate-in zoom-in-95 duration-300 border-t border-border/40">
                            <div className="text-[10px] font-bold text-accent uppercase tracking-widest flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-accent" /> Link Generated
                            </div>
                            <div className="bg-background border border-border rounded-md px-2.5 py-2 text-[11px] font-mono break-all leading-tight">
                              {shareUrl}
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-8 text-[11px] flex-1 rounded-lg border-border bg-background/70 hover:bg-background transition-all"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  navigator.clipboard.writeText(shareUrl)
                                  toast.success('Link copied')
                                }}
                              >
                                <Copy size={13} className="mr-2 opacity-70" /> Copy
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-8 text-[11px] flex-1 rounded-lg border-border bg-background/70 hover:bg-background transition-all"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  window.open(shareUrl, '_blank')
                                }}
                              >
                                <ExternalLink size={13} className="mr-2 opacity-70" /> Open
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : !isSignedIn ? (
                  <div className="flex flex-col mb-1.5">
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault()
                        clerk.openSignIn()
                      }}
                      className="cursor-pointer opacity-50"
                    >
                      <Globe className="mr-2 h-4 w-4 text-foreground/70" />
                      <span className="font-medium">Publish to Pages</span>
                      <Lock className="ml-auto h-3.5 w-3.5 opacity-50" />
                    </DropdownMenuItem>
                  </div>
                ) : null}

                <DropdownMenuSeparator className="opacity-50" />
                <div className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">
                  Export Options
                </div>

                {/* PDF */}
                <DropdownMenuItem onClick={() => handleDownload('pdf')} disabled={isPdfLoading} className="cursor-pointer flex items-center gap-2.5 py-2 hover:bg-secondary">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="shrink-0 text-foreground/70">
                    <rect x="2" y="1" width="11" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
                    <path d="M10 1v4h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                    <text x="3.5" y="12.5" fontSize="4.5" fontWeight="700" fill="currentColor" fontFamily="sans-serif">PDF</text>
                  </svg>
                  <span className="text-sm">PDF Document</span>
                </DropdownMenuItem>
                {/* Markdown */}
                <DropdownMenuItem onClick={() => handleDownload('markdown')} className="cursor-pointer flex items-center gap-2.5 py-2 hover:bg-secondary">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="shrink-0 text-foreground/70">
                    <rect x="2" y="1" width="11" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
                    <path d="M10 1v4h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                    <text x="3" y="12.5" fontSize="4" fontWeight="700" fill="currentColor" fontFamily="sans-serif">.MD</text>
                  </svg>
                  <span className="text-sm">Markdown File</span>
                </DropdownMenuItem>
                {/* TXT */}
                <DropdownMenuItem onClick={() => handleDownload('txt')} className="cursor-pointer flex items-center gap-2.5 py-2 hover:bg-secondary">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="shrink-0 text-foreground/70">
                    <rect x="2" y="1" width="11" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
                    <path d="M10 1v4h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                    <text x="3" y="12.5" fontSize="4" fontWeight="700" fill="currentColor" fontFamily="sans-serif">TXT</text>
                  </svg>
                  <span className="text-sm">Plain Text</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator className="opacity-50" />

                <DropdownMenuItem onClick={handleCopy} className="cursor-pointer flex items-center gap-2.5 py-2 hover:bg-secondary text-foreground/90">
                  {isCopied ? <Check className="mr-0 h-4 w-4 text-green-500" /> : <Copy className="mr-0 h-4 w-4 text-foreground/70" />}
                  <span className="font-medium">{isCopied ? 'Copied' : 'Copy Text'}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {onBack && (
              <div className="flex items-center pl-0.5 sm:pl-3 border-l border-[var(--border-subtle)]/50 ml-0.5 sm:ml-2">
                <button
                  onClick={onBack}
                  className="p-1.5 sm:p-2 rounded-full text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors shrink-0 outline-none"
                  title="Close Report"
                >
                  <X className="h-4 w-4 sm:h-5 sm:w-5" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Answer body */}
      <div className="px-5 py-6 sm:px-10 sm:py-8">
        <div className="max-w-none markdown-body blog-markdown" data-selection-scope="canvas-body">
          <ReactMarkdown
            remarkPlugins={remarkPlugins}
            rehypePlugins={rehypePlugins}
            components={markdownComponents}
          >
            {initialAnswer}
          </ReactMarkdown>
        </div>
      </div>

      {/* Sources & Assets */}
      {(sources.length > 0 || (assets && assets.length > 0)) && (
        <div className="border-t border-border">
          <button
            onClick={() => setSourcesOpen(!sourcesOpen)}
            className="flex w-full items-center gap-2.5 px-8 py-4 sm:px-10 text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 cursor-pointer"
          >
            <BookOpen className="h-4 w-4" />
            <span className="font-medium">Sources & Assets</span>
            <span className="text-xs text-muted-foreground/70">({sources.length + (assets?.length || 0)})</span>
            <span className="ml-auto">
              {sourcesOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </span>
          </button>

          {/* Source list & Assets */}
          <div
            className={`grid transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${sourcesOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
              }`}
          >
            <div className="overflow-hidden">
              <div className="px-8 pb-5 sm:px-10 flex flex-col gap-6">
                {assets && assets.length > 0 && (
                  <div className="flex flex-col gap-3 mt-2">
                    <h4 className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">Generated Assets</h4>
                    <div className="flex flex-wrap gap-4">
                      {assets.map((asset, idx) => (
                        <figure key={idx} className="relative group w-full sm:w-fit sm:max-w-[80%] flex flex-col items-center gap-2">
                          <div className="relative rounded-lg overflow-hidden w-full bg-muted/10 border border-border">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={asset}
                              alt={`Asset ${idx + 1}`}
                              className="w-full h-auto object-contain max-h-[400px]"
                              loading="lazy"
                            />
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <a
                                href={asset}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center p-2 bg-black/50 hover:bg-black/70 text-white rounded-md backdrop-blur-sm transition-colors"
                                title="View/Download Image"
                              >
                                <Download className="w-4 h-4" />
                              </a>
                            </div>
                          </div>
                        </figure>
                      ))}
                    </div>
                  </div>
                )}

                {sources.length > 0 && (
                  <div className="flex flex-col gap-3">
                    {assets && assets.length > 0 && (
                      <h4 className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider mt-2">References</h4>
                    )}
                    <div className="stagger-children flex flex-col gap-3">
                      {sources.map((source, idx) => (
                        <SourceItem key={idx} source={source} index={idx} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

/* ── Copy button for code blocks ── */
function CopyButton({ getText }: { getText: () => string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      const text = getText()
      await navigator.clipboard.writeText(typeof text === 'string' ? text : '')
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard API may not be available
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
