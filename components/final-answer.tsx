'use client'

import { useState, memo, useRef, useEffect } from 'react'
import { ChevronDown, ChevronRight, ExternalLink, BookOpen, Copy, Check, Download, FileText, File, MoreHorizontal, ArrowLeft, MessageSquare, X, Share, Layout } from 'lucide-react'
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
import type { Components } from 'react-markdown'
import type { Source } from '@/lib/types'

interface FinalAnswerProps {
  answer: string
  sources: Source[]
  assets?: string[]
  title?: string
  onBack?: () => void
  onFollowUp?: (text: string) => void
}

/* ── Stable plugin arrays at module scope — never recreated ── */
const remarkPlugins = [remarkGfm]
const rehypePlugins = [rehypeHighlight]

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
      <pre className="rounded-xl bg-[#1e1e2e] dark:bg-[#0d0d14] p-4 overflow-x-auto text-sm leading-relaxed border border-white/5">
        {children}
      </pre>
      <CopyButton getText={() => {
        return (children as any)?.props?.children || ''
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
    <ul className="my-3 ml-1 space-y-1.5 list-none">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-3 ml-1 space-y-1.5 list-decimal list-inside">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-foreground leading-[1.7] pl-4 relative before:content-['•'] before:absolute before:left-0 before:text-accent/60 before:font-bold">
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

export const FinalAnswer = memo(function FinalAnswer({ answer: initialAnswer, sources, assets = [], title, onBack, onFollowUp }: FinalAnswerProps) {
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [isCopied, setIsCopied] = useState(false)

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

  const handleDownload = (format: 'markdown' | 'txt' | 'pdf' | 'word' | 'gdoc') => {
    if (format === 'markdown') {
      const blob = new Blob([initialAnswer], { type: 'text/markdown' })
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
      const plainText = stripMarkdown(initialAnswer)
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
    } else {
      toast.info('Format coming soon')
    }
  }

  return (
    <div ref={containerRef} className="rounded-xl border border-border bg-card shadow-sm relative group/answer flex flex-col">
      <TextSelectionMenu containerRef={containerRef} sources={sources} onFollowUp={onFollowUp} />

      {/* Action Buttons (Sticky Header) */}
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
                className="rounded-full bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-700 dark:text-cyan-400 h-8 sm:h-9 px-3 sm:px-4 text-xs sm:text-[13px] font-medium border border-cyan-500/20 shadow-sm transition-colors"
              >
                <Share className="h-3.5 w-3.5 mr-1.5 sm:hidden" />
                <span className="hidden sm:inline">Share & Export</span>
                <span className="sm:hidden">Share</span>
                <ChevronDown className="ml-1 sm:ml-1.5 h-3.5 w-3.5 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 sm:w-56 rounded-xl">
              <DropdownMenuItem onClick={handleCopy} className="cursor-pointer">
                {isCopied ? <Check className="mr-2 h-4 w-4 text-green-500" /> : <Copy className="mr-2 h-4 w-4" />}
                <span>{isCopied ? 'Copied' : 'Copy Text'}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleDownload('markdown')} className="cursor-pointer">
                <FileText className="mr-2 h-4 w-4" />
                <span>Download (.md)</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleDownload('txt')} className="cursor-pointer">
                <File className="mr-2 h-4 w-4" />
                <span>Download (.txt)</span>
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

      {/* Answer body */}
      <div className="px-5 py-6 sm:px-10 sm:py-8">
        <div className="max-w-none markdown-body">
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
      className="absolute top-2.5 right-2.5 flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-white/40 hover:text-white/70 transition-all text-xs opacity-0 group-hover:opacity-100 cursor-pointer"
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
