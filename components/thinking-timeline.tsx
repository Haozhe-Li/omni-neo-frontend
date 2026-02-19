'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Search,
  FileText,
  BookOpen,
  ShieldCheck,
  Code,
  MoreHorizontal,
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
        className="flex-1 min-h-0 overflow-y-auto custom-scrollbar relative px-1"
      >
        {messages.length === 0 && isStreaming && <ThinkingLoader />}
        {messages.length === 0 && isComplete && (
          <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
            <span>No thinking steps used</span>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {messages.map((msg, idx) => (
            <TimelineItem
              key={idx}
              message={msg}
              isActive={isStreaming && idx === messages.length - 1}
              isComplete={isComplete || (idx < messages.length - 1)}
            />
          ))}
        </div>

        {/* Loading Block Animation - pushes latest step up into view */}
        {isStreaming && <ThinkingBlockLoader />}

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
    <div className="flex flex-col gap-4 py-2 animate-fade-up">
      <div className="flex items-center gap-3">
        <div className="relative flex h-4 w-4 shrink-0 overflow-hidden rounded-full">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75"></span>
          <span className="relative inline-flex h-4 w-4 rounded-full bg-accent"></span>
        </div>
        <span className="text-sm text-muted-foreground">Analyzing your question...</span>
      </div>
    </div>
  )
}

/* ── Individual timeline item — icon-based, no dots or lines ── */
function TimelineItem({ message, isActive, isComplete }: { message: SSEMessage; isActive: boolean; isComplete: boolean }) {
  const [visible, setVisible] = useState(false)

  // Fade-in on mount
  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  if (message.type === 'reasoning') {
    return (
      <div
        className="flex items-start gap-3 transition-all duration-400 ease-out"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(8px)',
        }}
      >
        <StatusIcon isActive={isActive} isComplete={isComplete} />
        <ReasoningContent content={typeof message.content === 'string' ? message.content : ''} />
      </div>
    )
  }

  if (message.type === 'tool') {
    return (
      <div
        className="flex items-start gap-3 transition-all duration-400 ease-out"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(8px)',
        }}
      >
        <StatusIcon isActive={isActive} isComplete={isComplete} />
        <ToolContent message={message} />
      </div>
    )
  }

  return null
}

function StatusIcon({ isActive, isComplete }: { isActive: boolean; isComplete: boolean }) {
  if (isActive) {
    return (
      <div className="flex h-4 w-4 shrink-0 items-center justify-center mt-0.5">
        <MoreHorizontal className="h-4 w-4 animate-pulse text-accent" />
      </div>
    )
  }

  // Completed state (or previous items) always check
  return (
    <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-0.5">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-2.5 w-2.5 text-muted-foreground"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </div>
  )
}

function ReasoningContent({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false)
  const preview = content.slice(0, 80)
  const hasMore = content.length > 80

  return (
    <div className="flex-1 min-w-0 pt-0.5">
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

function ToolContent({ message }: { message: SSEMessage }) {
  const [codeVisible, setCodeVisible] = useState(false)
  const tool = message.tool || ''
  const raw = message.raw || {}
  const args = raw.args || {}

  const getToolLabel = (): { label: string; detail: React.ReactNode } => {
    switch (tool) {
      case 'tavily_search':
        return {
          label: 'Searching',
          detail: args.query ? <span className="text-muted-foreground/80">"{args.query}"</span> : null
        }
      case 'skimming_web_pages':
        return {
          label: 'Reviewing Sources',
          detail: null
        }
      case 'get_full_text':
        return {
          label: 'Reading Content',
          detail: null
        }
      case 'verify_claim':
        return {
          label: 'Verifying',
          detail: <span className="truncate">{args.fact}</span>
        }
      case 'run_python_tool':
        return {
          label: 'Running Code',
          detail: (
            <button onClick={() => setCodeVisible(!codeVisible)} className="text-xs underline hover:text-foreground cursor-pointer transition-colors whitespace-nowrap ml-2">
              {codeVisible ? 'hide' : 'view'}
            </button>
          ),
        }
      default:
        return {
          label: tool,
          detail: null,
        }
    }
  }

  const { label, detail } = getToolLabel()

  return (
    <div className="flex-1 min-w-0 pt-0.5">
      <div className="flex flex-wrap items-baseline gap-x-2 text-sm text-muted-foreground">
        <span className="font-medium">{label}</span>
        {detail}
      </div>
      {codeVisible && args.code && (
        <pre className="mt-2 rounded-lg bg-secondary/50 p-3 text-xs font-mono overflow-x-auto text-foreground border border-border/50">
          <code>{args.code}</code>
        </pre>
      )}
    </div>
  )
}

function ThinkingBlockLoader() {
  return (
    <div className="flex flex-col gap-2 mt-4 px-1 opacity-50">
      <div className="h-4 w-3/4 bg-muted/60 rounded animate-pulse" />
      <div className="h-4 w-1/2 bg-muted/60 rounded animate-pulse delay-150" />
    </div>
  )
}
