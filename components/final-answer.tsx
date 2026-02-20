'use client'

import { useState, memo, useRef, useEffect } from 'react'
import { ChevronDown, ChevronRight, ExternalLink, BookOpen, Copy, Check, Download, FileText, File, Edit2, CheckCircle2, MoreHorizontal, History } from 'lucide-react'
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
  title?: string
  isEdited?: boolean
  onAnswerEdit?: (newAnswer: string) => void
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

export const FinalAnswer = memo(function FinalAnswer({ answer: initialAnswer, sources, title, isEdited = false, onAnswerEdit }: FinalAnswerProps) {
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editedAnswer, setEditedAnswer] = useState(initialAnswer)
  const [hasBeenEdited, setHasBeenEdited] = useState(isEdited)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setEditedAnswer(initialAnswer)
  }, [initialAnswer])

  useEffect(() => {
    setHasBeenEdited(isEdited)
  }, [isEdited])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(editedAnswer)
      setIsCopied(true)
      toast.success('Copied to clipboard')
      setTimeout(() => setIsCopied(false), 2000)
    } catch {
      toast.error('Failed to copy')
    }
  }

  const handleDownload = (format: 'markdown' | 'pdf' | 'word' | 'gdoc') => {
    if (format === 'markdown') {
      const blob = new Blob([editedAnswer], { type: 'text/markdown' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${normalizeFilename(title || 'answer')}.md`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Downloaded as Markdown')
    } else {
      toast.info('Format coming soon')
    }
  }

  return (
    <div ref={containerRef} className="rounded-xl border border-border bg-card shadow-sm relative group/answer">
      <TextSelectionMenu containerRef={containerRef} sources={sources} />

      {/* Action Buttons (Top Right) */}
      <div className="absolute top-3 right-3 flex items-center gap-0.5 sm:gap-1 z-10 bg-card/80 sm:bg-card/50 backdrop-blur-md p-1 rounded-lg border border-border/50 shadow-sm">
        {hasBeenEdited && !isEditing && (
          <div className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 text-xs text-muted-foreground bg-muted/30 rounded-md py-1 mr-0.5 sm:mr-1" title="This document has been edited by you">
            <History className="h-3 w-3" />
            <span className="hidden sm:inline">Edited</span>
          </div>
        )}

        {/* DESKTOP/TABLET BUTTONS - Hidden on Mobile */}
        <div className="hidden sm:flex items-center gap-1">
          {isEditing ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-3 text-accent hover:text-accent hover:bg-accent/10"
              onClick={() => {
                setIsEditing(false)
                if (editedAnswer !== initialAnswer) {
                  setHasBeenEdited(true)
                  if (onAnswerEdit) onAnswerEdit(editedAnswer)
                }
                toast.success('Changes saved')
              }}
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              <span>Done</span>
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => setIsEditing(true)}
              title="Edit document"
            >
              <Edit2 className="h-4 w-4" />
              <span className="sr-only">Edit</span>
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            onClick={handleCopy}
            title="Copy all text"
          >
            {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            <span className="sr-only">Copy</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                title="Download"
              >
                <Download className="h-4 w-4" />
                <span className="sr-only">Download</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => handleDownload('markdown')} className="cursor-pointer">
                <FileText className="mr-2 h-4 w-4" />
                <span>Markdown (.md)</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>
                <File className="mr-2 h-4 w-4" />
                <span>PDF Document</span>
              </DropdownMenuItem>
              <DropdownMenuItem disabled>
                <File className="mr-2 h-4 w-4" />
                <span>Word Document</span>
              </DropdownMenuItem>
              <DropdownMenuItem disabled>
                <File className="mr-2 h-4 w-4" />
                <span>Google Doc</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* MOBILE BUTTONS - Hidden on Desktop */}
        <div className="flex sm:hidden items-center gap-0.5">
          {isEditing ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-accent hover:text-accent hover:bg-accent/10"
              onClick={() => {
                setIsEditing(false)
                if (editedAnswer !== initialAnswer) {
                  setHasBeenEdited(true)
                  if (onAnswerEdit) onAnswerEdit(editedAnswer)
                }
                toast.success('Changes saved')
              }}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" />
              <span>Done</span>
            </Button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => setIsEditing(true)} className="cursor-pointer">
                  <Edit2 className="mr-2 h-4 w-4" />
                  <span>Edit</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleCopy} className="cursor-pointer">
                  {isCopied ? <Check className="mr-2 h-4 w-4 text-green-500" /> : <Copy className="mr-2 h-4 w-4" />}
                  <span>{isCopied ? 'Copied' : 'Copy'}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleDownload('markdown')} className="cursor-pointer">
                  <Download className="mr-2 h-4 w-4" />
                  <span>Download (.md)</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      {/* Answer body */}
      <div className="px-5 pt-16 pb-8 sm:px-10 sm:py-10">
        {isEditing ? (
          <textarea
            value={editedAnswer}
            onChange={(e) => setEditedAnswer(e.target.value)}
            className="w-full min-h-[500px] p-4 bg-background border border-border rounded-lg outline-none focus:ring-1 focus:ring-accent font-mono text-[13px] leading-relaxed resize-y custom-scrollbar"
            placeholder="Write your markdown here..."
            autoFocus
          />
        ) : (
          <div className="max-w-none markdown-body">
            <ReactMarkdown
              remarkPlugins={remarkPlugins}
              rehypePlugins={rehypePlugins}
              components={markdownComponents}
            >
              {editedAnswer}
            </ReactMarkdown>
          </div>
        )}
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
            className={`grid transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${sourcesOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
              }`}
          >
            <div className="overflow-hidden">
              <div className="px-8 pb-5 sm:px-10 stagger-children flex flex-col gap-3">
                {sources.map((source, idx) => (
                  <SourceItem key={idx} source={source} index={idx} />
                ))}
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
