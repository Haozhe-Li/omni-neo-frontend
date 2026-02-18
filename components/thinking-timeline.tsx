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
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll within the container as new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      })
    }
  }, [messages])

  return (
    <div className="flex flex-col h-full">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <div className="flex items-center justify-center h-6 w-6 rounded-md bg-muted text-muted-foreground">
          <Brain className="h-3.5 w-3.5" />
        </div>
        <span className="text-sm font-medium text-foreground">Thinking</span>
        {messages.length > 0 && (
          <span className="text-xs text-muted-foreground">{messages.length} steps</span>
        )}
        {isStreaming && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-accent">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            Streaming
          </span>
        )}
      </div>

      {/* Scrollable timeline container — no vertical line */}
      <div
        ref={scrollRef}
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
            className="ml-1.5 text-accent text-xs hover:underline cursor-pointer"
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
          detail: <span className="text-foreground/80">{args.query || ''}</span>,
        }
      case 'skimming_web_pages': {
        const urls: string[] = args.urls || []
        return {
          icon: <FileText className="h-3.5 w-3.5" />,
          label: 'Skimming',
          detail: (
            <span>
              <span className="text-foreground/80">{args.purpose || ''}</span>
              {urls.length > 0 && (
                <span className="block mt-0.5 text-xs text-muted-foreground/50">
                  {urls.slice(0, 3).map((u: string) => {
                    try { return new URL(u).hostname } catch { return u }
                  }).join(', ')}
                  {urls.length > 3 && ` +${urls.length - 3} more`}
                </span>
              )}
            </span>
          ),
        }
      }
      case 'get_full_text': {
        const url = args.url || ''
        let hostname = url
        try { hostname = new URL(url).hostname } catch { /* keep raw */ }
        return {
          icon: <BookOpen className="h-3.5 w-3.5" />,
          label: 'Reading',
          detail: (
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-foreground/80 hover:text-foreground hover:underline transition-colors">
              {hostname}
            </a>
          ),
        }
      }
      case 'verify_claim':
        return {
          icon: <ShieldCheck className="h-3.5 w-3.5" />,
          label: 'Verifying',
          detail: <span className="text-foreground/80">{args.fact || ''}</span>,
        }
      case 'check_python_compile':
        return {
          icon: <Code className="h-3.5 w-3.5" />,
          label: 'Checking python code',
          detail: (
            <button onClick={() => setCodeVisible(!codeVisible)} className="text-muted-foreground text-xs hover:text-foreground hover:underline cursor-pointer transition-colors">
              {codeVisible ? 'hide code' : 'show code'}
            </button>
          ),
        }
      case 'run_python_tool':
        return {
          icon: <Terminal className="h-3.5 w-3.5" />,
          label: 'Running python code',
          detail: (
            <button onClick={() => setCodeVisible(!codeVisible)} className="text-muted-foreground text-xs hover:text-foreground hover:underline cursor-pointer transition-colors">
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

  const iconClass = isActive
    ? 'bg-accent/15 text-accent'
    : 'bg-muted text-muted-foreground'

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-3 text-sm">
        <div className={`flex-shrink-0 flex items-center justify-center h-6 w-6 rounded-md ${iconClass} transition-colors duration-300`}>
          {icon}
        </div>
        <span className={`flex-shrink-0 ${isActive ? 'text-accent/80' : 'text-muted-foreground/80'} transition-colors duration-300`}>{label}</span>
        <span className="flex-1 min-w-0 truncate">{detail}</span>
      </div>
      {codeVisible && args.code && (
        <pre className="mt-2 ml-9 rounded-lg bg-secondary p-3 text-xs font-mono overflow-x-auto text-foreground">
          <code>{args.code}</code>
        </pre>
      )}
    </div>
  )
}
