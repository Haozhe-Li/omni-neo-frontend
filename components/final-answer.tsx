'use client'

import { useState, memo } from 'react'
import { ChevronDown, ChevronRight, ExternalLink, BookOpen, Copy, Check } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import type { Components } from 'react-markdown'
import type { Source } from '@/lib/types'

interface FinalAnswerProps {
  answer: string
  sources: Source[]
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
  p: ({ children }) => (
    <p className="text-foreground leading-[1.8] mb-4 text-pretty">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic text-muted-foreground">{children}</em>
  ),
}

export const FinalAnswer = memo(function FinalAnswer({ answer, sources }: FinalAnswerProps) {
  const [sourcesOpen, setSourcesOpen] = useState(false)

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      {/* Answer body */}
      <div className="px-8 py-8 sm:px-10 sm:py-10">
        <div className="max-w-none markdown-body">
          <ReactMarkdown
            remarkPlugins={remarkPlugins}
            rehypePlugins={rehypePlugins}
            components={markdownComponents}
          >
            {answer}
          </ReactMarkdown>
        </div>
      </div>

      {/* Sources */}
      {sources.length > 0 && (
        <div className="border-t border-border">
          <button
            onClick={() => setSourcesOpen(!sourcesOpen)}
            className="flex w-full items-center gap-2.5 px-8 py-4 sm:px-10 text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 cursor-pointer"
          >
            <BookOpen className="h-4 w-4" />
            <span className="font-medium">Sources</span>
            <span className="text-xs text-muted-foreground/70">({sources.length})</span>
            <span className="ml-auto">
              {sourcesOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </span>
          </button>

          {/* Source list */}
          <div
            className="overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]"
            style={{
              maxHeight: sourcesOpen ? `${sources.length * 48 + 40}px` : '0px',
              opacity: sourcesOpen ? 1 : 0,
            }}
          >
            <div className="px-8 pb-5 sm:px-10 stagger-children">
              {sources.map((source, idx) => (
                <a
                  key={idx}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 py-2.5 group"
                >
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-accent/10 text-[10px] font-mono font-medium text-accent">
                    {idx + 1}
                  </span>
                  <span className="flex-1 min-w-0 text-sm text-foreground group-hover:text-accent transition-colors line-clamp-1">
                    {source.title}
                  </span>
                  <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>
              ))}
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
