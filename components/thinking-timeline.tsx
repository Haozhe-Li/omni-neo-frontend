'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Search,
  FileText,
  BookOpen,
  ShieldCheck,
  Code,
  Play,
  Brain,
  Lightbulb,
  Sparkles,
  AlertTriangle,
  Terminal,
} from 'lucide-react'
import type { SSEMessage } from '@/lib/types'

interface ThinkingTimelineProps {
  messages: SSEMessage[]
  isStreaming: boolean
  isComplete?: boolean
  hasError?: boolean
}

export function ThinkingTimeline({
  messages,
  isStreaming,
  isComplete,
  hasError,
}: ThinkingTimelineProps) {
  /* ── Better Auto-Scrolling Logic ── */
  const scrollRef = useRef<HTMLDivElement>(null)
  const userHasScrolledRef = useRef(false)
  const isAutoScrolling = useRef(false)

  // 1. Scroll to bottom when new content arrives (unless user scrolled up)
  useEffect(() => {
    // Only auto-scroll if we are streaming/loading and user hasn't scrolled up
    if (scrollRef.current && !userHasScrolledRef.current) {

      // Mark that we are programmatically scrolling
      isAutoScrolling.current = true

      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: 'smooth',
          })
        }
        // Reset the flag after animation finishes (~300ms for smooth scroll)
        setTimeout(() => {
          isAutoScrolling.current = false
        }, 300)
      })
    }
  }, [messages]) // Trigger on new messages

  // 2. Detect user scroll interactions
  const handleScroll = () => {
    // Ignore scroll events triggered by our auto-scroll logic
    if (isAutoScrolling.current) return
    if (!scrollRef.current) return

    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current

    // Check if user is near the bottom (tolerance of 20px)
    const isAtBottom = scrollHeight - scrollTop - clientHeight <= 50

    if (isAtBottom) {
      // User is at the bottom -> Resume auto-scroll
      userHasScrolledRef.current = false
    } else {
      // User scrolled up -> Pause auto-scroll
      userHasScrolledRef.current = true
    }
  }

  return (
    <div className="flex flex-col h-full">


      {/* Scrollable timeline container — no vertical line */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto custom-scrollbar relative"
      >
        {messages.length === 0 && isStreaming && <ThinkingLoader />}
        {messages.length === 0 && isComplete && (
          <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
            <span>No thinking steps used</span>
          </div>
        )}

        <div className="flex flex-col gap-1">
          {messages.map((msg, idx) => (
            <TimelineItem key={idx} message={msg} isActive={isStreaming && idx === messages.length - 1} />
          ))}
        </div>

        {/* Streaming pulse at the end */}
        {messages.length > 0 && isStreaming && <StreamingLoader />}

        {/* Error state — 60s timeout */}
        {hasError && (
          <div className="flex items-center gap-3 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 mt-2 animate-fade-up">
            <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-red-400">No response received for 100 seconds</p>
              <p className="text-xs text-red-400/60 mt-0.5">The backend may have encountered an issue. Please try a new search.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Loading state: shown before any steps arrive ── */
function ThinkingLoader() {
  return (
    <div className="flex flex-col gap-2.5 py-2 animate-fade-up">
      <div className="flex items-center gap-3 rounded-lg bg-muted/30 px-4 py-3">
        <div className="flex items-center justify-center h-6 w-6 rounded-md bg-muted text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 animate-pulse" />
        </div>
        <div className="flex-1 space-y-2">
          <p className="text-xs text-muted-foreground">Analyzing your question...</p>
          <div className="flex gap-2">
            <div className="h-1 rounded-full bg-border animate-shimmer-bar" style={{ width: '55%' }} />
            <div className="h-1 rounded-full bg-border/60 animate-shimmer-bar" style={{ width: '25%', animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
      {[0, 1].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-4 py-2 opacity-30"
        >
          <div className="h-5 w-5 rounded-md bg-muted animate-pulse" />
          <div className="h-2 rounded-full bg-muted animate-pulse" style={{ width: `${45 + i * 18}%` }} />
        </div>
      ))}
    </div>
  )
}

/* ── Streaming loader at the bottom when steps are already present ── */
function StreamingLoader() {
  return (
    <div className="flex items-center gap-3 py-2 mt-1 animate-fade-up">
      <div className="flex items-center justify-center h-6 w-6 rounded-md bg-muted text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 animate-spin-slow" />
      </div>
      <span className="text-xs text-muted-foreground/70">Processing...</span>
      <div className="flex gap-1 ml-0.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="block h-1 w-1 rounded-full bg-muted-foreground/40 animate-dot-bounce"
            style={{ animationDelay: `${i * 160}ms` }}
          />
        ))}
      </div>
    </div>
  )
}

/* ── Individual timeline item — icon-based, no dots or lines ── */
function TimelineItem({ message, isActive }: { message: SSEMessage; isActive?: boolean }) {
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Fade-in on mount
  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  const iconClass = isActive
    ? 'bg-accent/15 text-accent'
    : 'bg-muted text-muted-foreground'

  if (message.type === 'reasoning') {
    return (
      <div
        ref={ref}
        className="flex items-start gap-3 rounded-lg px-3 py-2 transition-all duration-400 ease-out hover:bg-card/40"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(8px)',
        }}
      >
        <div className={`flex-shrink-0 flex items-center justify-center h-6 w-6 rounded-md ${iconClass} mt-0.5 transition-colors duration-300`}>
          <Lightbulb className="h-3.5 w-3.5" />
        </div>
        <ReasoningContent content={typeof message.content === 'string' ? message.content : ''} />
      </div>
    )
  }

  if (message.type === 'tool') {
    return (
      <div
        ref={ref}
        className="rounded-lg px-3 py-2 transition-all duration-400 ease-out hover:bg-card/40"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(8px)',
        }}
      >
        <ToolContent message={message} isActive={isActive} />
      </div>
    )
  }

  return null
}

function ReasoningContent({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false)
  const preview = content.slice(0, 80)
  const hasMore = content.length > 80

  return (
    <div className="flex-1 min-w-0">
      <p className="text-sm text-muted-foreground leading-relaxed">
        {expanded ? content : preview}
        {hasMore && !expanded && '...'}
        {hasMore && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="ml-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-xs hover:underline cursor-pointer transition-colors"
          >
            {expanded ? 'less' : 'more'}
          </button>
        )}
      </p>
    </div>
  )
}

function ToolContent({ message, isActive }: { message: SSEMessage; isActive?: boolean }) {
  const [codeVisible, setCodeVisible] = useState(false)
  const tool = message.tool || ''
  const raw = message.raw || {}
  const args = raw.args || {}

  const getToolInfo = (): { icon: React.ReactNode; label: string; detail: React.ReactNode } => {
    switch (tool) {
      case 'tavily_search':
        return {
          icon: <Search className="h-3.5 w-3.5" />,
          label: 'Searching',
          detail: (
            <div className="flex flex-wrap gap-2 w-full min-w-0">
              <span className="block text-[var(--muted-foreground)] text-xs bg-[var(--secondary)] px-2 py-0.5 rounded-md border border-[var(--border-subtle)] truncate w-full sm:w-auto hover:w-auto transition-all" title={args.query}>
                {args.query || ''}
              </span>
            </div>
          ),
        }
      case 'skimming_web_pages': {
        const urls: string[] = args.urls || []
        // On mobile, stack them. On desktop, keep row.
        // We use flex-col for mobile (default) and sm:flex-row for desktop?
        // Actually user asked for "stack five webpages vertically" specifically.
        // Let's make it responsive: stacked on small screens.
        return {
          icon: <FileText className="h-3.5 w-3.5" />,
          label: 'Reviewing Sources',
          detail: (
            <div className="flex flex-col sm:flex-row flex-wrap gap-2 w-full min-w-0 mt-1 sm:mt-0">
              {urls.map((u, i) => {
                let hostname = u
                try {
                  hostname = new URL(u).hostname
                  if (hostname.startsWith('www.')) hostname = hostname.slice(4)
                } catch { /* keep raw */ }

                // Mobile: allow more width but truncate.
                return (
                  <a
                    key={i}
                    href={u}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full sm:w-auto text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:underline transition-colors text-xs bg-[var(--secondary)] px-2 py-0.5 rounded-md border border-[var(--border-subtle)] truncate max-w-full sm:max-w-[200px]"
                    title={u}
                  >
                    {hostname}
                  </a>
                )
              })}
            </div>
          ),
        }
      }
      case 'get_full_text': {
        const url = args.url || ''
        let hostname = url
        try {
          hostname = new URL(url).hostname
          if (hostname.startsWith('www.')) hostname = hostname.slice(4)
        } catch { /* keep raw */ }

        return {
          icon: <BookOpen className="h-3.5 w-3.5" />,
          label: 'Reading',
          detail: (
            <div className="flex flex-col sm:flex-row flex-wrap gap-2 w-full min-w-0 mt-1 sm:mt-0">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full sm:w-auto text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:underline transition-colors text-xs bg-[var(--secondary)] px-2 py-0.5 rounded-md border border-[var(--border-subtle)] truncate max-w-full sm:max-w-[250px]"
                title={url}
              >
                {hostname}
              </a>
            </div>
          ),
        }
      }
      case 'verify_claim':
        return {
          icon: <ShieldCheck className="h-3.5 w-3.5" />,
          label: 'Verifying',
          detail: <span className="text-foreground/80 truncate block w-full">{args.fact || ''}</span>,
        }
      case 'run_python_tool':
        return {
          icon: <Terminal className="h-3.5 w-3.5" />,
          label: 'Running python code',
          detail: (
            <button onClick={() => setCodeVisible(!codeVisible)} className="text-muted-foreground text-xs hover:text-foreground hover:underline cursor-pointer transition-colors whitespace-nowrap">
              {codeVisible ? 'hide code' : 'show code'}
            </button>
          ),
        }
      default:
        return {
          icon: <Sparkles className="h-3.5 w-3.5" />,
          label: tool,
          detail: null,
        }
    }
  }

  const { icon, label, detail } = getToolInfo()

  return (
    <div className="flex-1 min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3 text-sm">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex-shrink-0 flex items-center justify-center h-6 w-6 rounded-md bg-muted text-muted-foreground mt-0.5">
            {icon}
          </div>
          <span className="font-medium text-muted-foreground">{label}</span>
        </div>
        <div className="flex-1 min-w-0 w-full sm:mt-0.5 pl-8 sm:pl-0">
          {detail}
        </div>
      </div>
      {codeVisible && args.code && (
        <pre className="mt-2 ml-0 sm:ml-9 rounded-lg bg-secondary p-3 text-xs font-mono overflow-x-auto text-foreground">
          <code>{args.code}</code>
        </pre>
      )}
    </div>
  )
}
